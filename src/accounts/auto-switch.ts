import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from '../core/fs/json';
import { decide, nextPick, toRanked } from './auto-rank';
import { IAutoDecision, IAutoDeps, IAutoSettings, IAutoState, IAutoTick, ILiveUsage, ISwitcher } from './interfaces';
import { cachedUsage, createLiveUsage, MIN_INTERVAL_MS, targetsFor } from './live-usage';
import { autoStatePath, codeCredentialsPath, sessionSlot } from './paths';

export const DEFAULT_AUTO_SETTINGS: IAutoSettings = { threshold: 95, landing: 85, cooldownSeconds: 60, intervalSeconds: 20 };
export const HOT_PERCENT = 80;
export const HOT_INTERVAL_MS = 15_000;
export const TASK_NAME = 'ClaudeDeck Auto Switch';
const LOG_LIMIT = 1_000_000;

function number(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function normalizeAutoState(value: unknown): IAutoState {
  const source = (value && typeof value === 'object' ? value : {}) as Partial<IAutoState>;
  const settings = (source.settings ?? {}) as Partial<IAutoSettings>;
  return {
    settings: {
      threshold: number(settings.threshold, DEFAULT_AUTO_SETTINGS.threshold, 50, 100),
      landing: number(settings.landing, DEFAULT_AUTO_SETTINGS.landing, 10, 99),
      cooldownSeconds: number(settings.cooldownSeconds, DEFAULT_AUTO_SETTINGS.cooldownSeconds, 0, 3600),
      intervalSeconds: number(settings.intervalSeconds, DEFAULT_AUTO_SETTINGS.intervalSeconds, 5, 600),
    },
    preferredNext: typeof source.preferredNext === 'string' && source.preferredNext ? source.preferredNext : null,
    held: Array.isArray(source.held) ? source.held.filter((alias): alias is string => typeof alias === 'string') : [],
    lastSwitchAt: typeof source.lastSwitchAt === 'string' ? source.lastSwitchAt : null,
    lastDecision: (source.lastDecision as IAutoDecision | null) ?? null,
    heartbeatAt: typeof source.heartbeatAt === 'string' ? source.heartbeatAt : null,
    pid: typeof source.pid === 'number' ? source.pid : null,
  };
}

export function readAutoState(file: string = autoStatePath()): IAutoState {
  return normalizeAutoState(readJsonFile(file));
}

export function updateAutoState(change: (state: IAutoState) => IAutoState, file: string = autoStatePath()): IAutoState {
  const next = normalizeAutoState(change(readAutoState(file)));
  writeJsonFile(file, next);
  return next;
}

export function setPreferredNext(alias: string | null, known: readonly string[], file?: string): IAutoState {
  if (alias && !known.some(entry => entry.toLowerCase() === alias.toLowerCase())) throw new Error(`No saved account "${alias}".`);
  const match = alias ? known.find(entry => entry.toLowerCase() === alias.toLowerCase()) ?? alias : null;
  return updateAutoState(state => ({ ...state, preferredNext: match }), file);
}

export function setHeld(alias: string, hold: boolean, known: readonly string[], file?: string): IAutoState {
  const match = known.find(entry => entry.toLowerCase() === alias.toLowerCase());
  if (!match) throw new Error(`No saved account "${alias}".`);
  return updateAutoState(state => {
    const rest = state.held.filter(entry => entry.toLowerCase() !== match.toLowerCase());
    return {
      ...state,
      held: hold ? [...rest, match] : rest,
      preferredNext: hold && state.preferredNext?.toLowerCase() === match.toLowerCase() ? null : state.preferredNext,
    };
  }, file);
}

export function isRunning(state: IAutoState, now: Date, selfPid: number = process.pid): boolean {
  if (!state.pid || state.pid === selfPid || !state.heartbeatAt) return false;
  if (now.getTime() - Date.parse(state.heartbeatAt) > state.settings.intervalSeconds * 3000) return false;
  try {
    process.kill(state.pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function defaultAutoDeps(switcher: ISwitcher, logFile?: string): IAutoDeps {
  const file = logFile ?? path.join(path.dirname(autoStatePath()), 'auto.log');
  return {
    switcher,
    refresh: (targets, minIntervalMs) => createLiveUsage({ minIntervalMs }).refreshAll(targets),
    stateFile: autoStatePath(),
    credPath: codeCredentialsPath(),
    slotFile: alias => path.join(sessionSlot(alias), 'code.json'),
    now: () => new Date(),
    log: line => {
      try {
        if (fs.existsSync(file) && fs.statSync(file).size > LOG_LIMIT) fs.renameSync(file, `${file}.1`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`, 'utf8');
      } catch {
        return;
      }
    },
  };
}

export function createAutoSwitch(deps: IAutoDeps) {
  async function tick(options: { dryRun?: boolean } = {}): Promise<IAutoTick> {
    const listing = deps.switcher.listSessions();
    const codeEmail = deps.switcher.currentCodeIdentity()?.email ?? null;
    const targets = targetsFor(listing.sessions, codeEmail, deps.credPath, deps.slotFile);
    const state = readAutoState(deps.stateFile);

    const activeTarget = targets.find(target => target.active);
    const activeCached = activeTarget ? cachedUsage(activeTarget.alias) : null;
    const activeUsed = Math.max(activeCached?.fiveHour?.usedPercent ?? 0, activeCached?.sevenDay?.usedPercent ?? 0);
    const live: Record<string, ILiveUsage> = {
      ...(await deps.refresh(targets.filter(target => !target.active), MIN_INTERVAL_MS)),
      ...(activeTarget ? await deps.refresh([activeTarget], activeUsed >= HOT_PERCENT ? HOT_INTERVAL_MS : MIN_INTERVAL_MS) : {}),
    };

    const now = deps.now();
    const entries = targets.map(target => ({
      alias: target.alias,
      email: listing.sessions.find(entry => entry.alias === target.alias)?.email ?? '',
      active: target.active,
    }));
    const accounts = toRanked(entries, live, state, now.getTime());
    const decision = decide(accounts, state, now);
    let switched = false;

    if (decision.action === 'switch' && decision.target && !options.dryRun) {
      deps.switcher.switchCode(decision.target);
      switched = true;
      deps.log(`switch ${decision.from ?? '?'} -> ${decision.target} (${decision.trigger}): ${decision.reason}`);
    }

    const after = switched ? accounts.map(entry => ({ ...entry, active: entry.alias === decision.target })) : accounts;
    const stored = updateAutoState(
      current => ({
        ...current,
        lastSwitchAt: switched ? now.toISOString() : current.lastSwitchAt,
        preferredNext:
          switched && current.preferredNext?.toLowerCase() === decision.target?.toLowerCase() ? null : current.preferredNext,
        lastDecision: decision,
        heartbeatAt: options.dryRun ? current.heartbeatAt : now.toISOString(),
        pid: options.dryRun ? current.pid : process.pid,
      }),
      deps.stateFile
    );
    return { decision, accounts: after, next: nextPick(after, stored.preferredNext), switched };
  }

  async function run(onTick: (result: IAutoTick) => void, signal?: AbortSignal): Promise<void> {
    const start = readAutoState(deps.stateFile);
    if (isRunning(start, deps.now())) throw new Error(`Auto switch already runs as process ${start.pid}.`);
    deps.log('auto switch started');
    while (!signal?.aborted) {
      try {
        onTick(await tick());
      } catch (error) {
        deps.log(`tick failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      const wait = readAutoState(deps.stateFile).settings.intervalSeconds * 1000;
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, wait);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  return { tick, run };
}

export function launcherScript(nodePath: string, binPath: string): string {
  return [
    'Set shell = CreateObject("WScript.Shell")',
    `shell.Run """${nodePath}"" ""${binPath}"" auto", 0, False`,
    '',
  ].join('\r\n');
}

export function installAutoTask(dataDir: string, binPath: string, nodePath: string = process.execPath): string {
  if (process.platform !== 'win32') throw new Error('Starting auto switch at sign in is only set up on Windows so far. Run "claudedeck auto" yourself.');
  const script = path.join(dataDir, 'auto-switch.vbs');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(script, launcherScript(nodePath, binPath), 'utf8');
  const ps = [
    `$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument '"${script}"'`,
    "$trigger = New-ScheduledTaskTrigger -AtLogOn -User \"$env:USERDOMAIN\\$env:USERNAME\"",
    '$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew',
    `Register-ScheduledTask -TaskName '${TASK_NAME}' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null`,
    `Start-ScheduledTask -TaskName '${TASK_NAME}'`,
  ].join('; ');
  const run = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true });
  if (run.status !== 0) throw new Error(`Could not register the task: ${(run.stderr || run.stdout).trim()}`);
  return script;
}

export function removeAutoTask(): boolean {
  if (process.platform !== 'win32') return false;
  const run = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', `Unregister-ScheduledTask -TaskName '${TASK_NAME}' -Confirm:$false -ErrorAction SilentlyContinue`],
    { encoding: 'utf8', windowsHide: true }
  );
  return run.status === 0;
}
