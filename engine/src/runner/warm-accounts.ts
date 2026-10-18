import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readAutoState } from '../accounts/auto-switch';
import { readCodeAccount } from '../accounts/identity';
import { ILiveUsage, IOAuthBlock } from '../accounts/interfaces';
import { accountFileName, CODE_INSTALL, installFileName } from '../accounts/installs';
import { createLiveUsage, needsRefresh, refreshSlot, targetsFor } from '../accounts/live-usage';
import { codeAccountPath, codeCredentialsPath, sessionSlot } from '../accounts/paths';
import * as registry from '../accounts/registry';
import { ACCOUNT_KEY, CODE_KEY } from '../accounts/session-store';
import { errorMessage, readJsonFile, writeJsonFile } from '../core/fs/json';
import { IInvocation } from '../core/interfaces';
import { packageRoot } from '../core/paths';
import { IWarmAccount, IWarmDeps, IWarmResult, IWarmRun } from './interfaces';

export const CONFIG_DIR_ENV = 'CLAUDE_CONFIG_DIR';
export const DROPPED_ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'] as const;
export const TEMP_PREFIX = 'claudedeck-warm-';
const RUN_TIMEOUT_MS = 3 * 60 * 1000;

export function hasLiveWindow(usage: ILiveUsage | null, now: Date): boolean {
  const resetsAt = usage?.fiveHour?.resetsAt;
  return Boolean(resetsAt && Date.parse(resetsAt) > now.getTime());
}

export function skipReason(usage: ILiveUsage | null, held: boolean, now: Date): string | null {
  if (held) return 'held out of auto switch';
  if (usage?.status === 'relogin') return 'login expired, sign in again';
  if (usage?.status === 'no-login') return 'no saved Claude Code login';
  if (hasLiveWindow(usage, now)) return `5h window already running until ${usage?.fiveHour?.resetsAt}`;
  if ((usage?.sevenDay?.usedPercent ?? 0) >= 100) return 'weekly limit reached';
  return null;
}

export function warmEnv(base: NodeJS.ProcessEnv, configDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, [CONFIG_DIR_ENV]: configDir };
  for (const key of DROPPED_ENV) delete env[key];
  return env;
}

export function writeConfigDir(dir: string, block: IOAuthBlock, account: Record<string, unknown>): void {
  writeJsonFile(path.join(dir, '.credentials.json'), { [CODE_KEY]: block });
  writeJsonFile(path.join(dir, '.claude.json'), { [ACCOUNT_KEY]: account, hasCompletedOnboarding: true });
}

export function readConfigBlock(dir: string): IOAuthBlock | null {
  const block = readJsonFile<Record<string, unknown>>(path.join(dir, '.credentials.json'))?.[CODE_KEY];
  return block && typeof block === 'object' ? (block as IOAuthBlock) : null;
}

function lastLine(text: string): string {
  return text.trim().split(/\r?\n/).filter(Boolean).pop() ?? '';
}

function failure(run: IWarmRun): string {
  if (run.error) return run.error;
  return lastLine(run.stderr) || lastLine(run.stdout) || `claude exited with ${run.status ?? 'no code'}`;
}

export async function warmOne(account: IWarmAccount, deps: IWarmDeps): Promise<IWarmResult> {
  const slot = deps.slotDir(account.alias);
  const slotFile = path.join(slot, installFileName(CODE_INSTALL));
  const result = (action: IWarmResult['action'], reason: string, rotated = false): IWarmResult => ({
    alias: account.alias,
    action,
    reason,
    rotated,
  });
  let block = readJsonFile<IOAuthBlock>(slotFile);
  if (!block || typeof block !== 'object') return result('skipped', 'no saved Claude Code login');
  let rotated = false;

  if (needsRefresh(block, deps.now())) {
    const refreshed = await refreshSlot(slotFile, deps.fetch, deps.now());
    if (refreshed.dead) return result('failed', 'login expired, sign in again');
    if (!refreshed.block) return result('failed', refreshed.error ?? 'token refresh failed');
    block = refreshed.block;
    rotated = refreshed.rotated;
  }

  const saved = readJsonFile<Record<string, unknown>>(path.join(slot, accountFileName(CODE_INSTALL)));
  const oauthAccount = saved && typeof saved === 'object' ? saved : { emailAddress: account.email };
  fs.mkdirSync(deps.tempRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(deps.tempRoot, TEMP_PREFIX));
  try {
    writeConfigDir(dir, block, oauthAccount);
    const run = deps.run(deps.invocation(), warmEnv(process.env, dir));
    const after = readConfigBlock(dir);
    if (after && JSON.stringify(after) !== JSON.stringify(block)) {
      writeJsonFile(slotFile, after);
      rotated = true;
    }
    if (run.status === 0 && !run.error) return result('warmed', 'started the 5h window', rotated);
    return result('failed', failure(run), rotated);
  } catch (error) {
    return result('failed', errorMessage(error), rotated);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

export async function warmAccounts(deps: IWarmDeps): Promise<IWarmResult[]> {
  const accounts = deps.accounts();
  const codeEmail = deps.codeEmail();
  const targets = targetsFor(accounts, codeEmail, deps.credPath, alias =>
    path.join(deps.slotDir(alias), installFileName(CODE_INSTALL))
  );
  const idle = targets.filter(target => !target.active);
  const live = idle.length ? await deps.refresh(idle) : {};
  const held = new Set(deps.held().map(alias => alias.toLowerCase()));
  const results: IWarmResult[] = [];
  for (const target of targets) {
    if (target.active) {
      results.push({ alias: target.alias, action: 'skipped', reason: 'Claude Code uses it, the main run covers it', rotated: false });
      continue;
    }
    const usage = live[target.alias.toLowerCase()] ?? null;
    const reason = skipReason(usage, held.has(target.alias.toLowerCase()), deps.now());
    if (reason) {
      results.push({ alias: target.alias, action: 'skipped', reason, rotated: false });
      continue;
    }
    const account = accounts.find(entry => entry.alias === target.alias) as IWarmAccount;
    results.push(await warmOne(account, deps));
  }
  return results;
}

export function warmLogLines(results: readonly IWarmResult[]): string[] {
  const warmed = results.filter(entry => entry.action === 'warmed').length;
  const failed = results.filter(entry => entry.action === 'failed').length;
  return [
    ...results.map(entry => `warm ${entry.alias}: ${entry.action}, ${entry.reason}${entry.rotated ? ' (token saved)' : ''}`),
    `warm done: ${warmed} warmed, ${failed} failed, ${results.length - warmed - failed} skipped`,
  ];
}

export function spawnClaude(invocation: IInvocation, env: NodeJS.ProcessEnv, timeout = RUN_TIMEOUT_MS): IWarmRun {
  const run = spawnSync(invocation.command, invocation.args, {
    cwd: packageRoot,
    encoding: 'utf8',
    shell: false,
    env,
    timeout,
    windowsHide: true,
  });
  return {
    status: typeof run.status === 'number' ? run.status : null,
    stdout: run.stdout ?? '',
    stderr: run.stderr ?? '',
    error: run.error ? errorMessage(run.error) : null,
  };
}

export function defaultWarmDeps(invocation: () => IInvocation): IWarmDeps {
  return {
    accounts: () => registry.read().sessions.map(entry => ({ alias: entry.alias, email: entry.email })),
    codeEmail: () => readCodeAccount(codeAccountPath())?.email ?? null,
    held: () => readAutoState().held,
    refresh: targets => createLiveUsage().refreshAll(targets),
    credPath: codeCredentialsPath(),
    slotDir: alias => sessionSlot(alias),
    tempRoot: os.tmpdir(),
    fetch: globalThis.fetch,
    now: () => new Date(),
    invocation,
    run: (invocation, env) => spawnClaude(invocation, env),
  };
}
