import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJsonFile } from '../core/fs/json';
import { cswapBinary, exportFromCswap, importEnvelope } from './cswap-import';
import { readCodeAccount } from './identity';
import { ICswapSyncDeps, ICswapSyncResult, IOAuthBlock } from './interfaces';
import { accountFileName, CODE_INSTALL, installFileName } from './installs';
import { codeAccountPath, codeCredentialsPath, homeDir, sessionSlot } from './paths';
import * as registry from './registry';
import { CODE_KEY, readCredentials } from './session-store';

interface ICswapAccount {
  number?: unknown;
  email?: unknown;
  uuid?: unknown;
  organizationUuid?: unknown;
  organizationName?: unknown;
  kind?: unknown;
  credentials?: unknown;
  config?: unknown;
}

const SIGNATURE_FILES = ['claude-swap.log', 'sequence.json', path.join('cache', 'usage.json')];

export function cswapDataDir(env = process.env): string {
  return path.join(homeDir(env), '.claude-swap-backup');
}

export function cswapAvailable(env = process.env): boolean {
  return fs.existsSync(path.join(cswapDataDir(env), 'sequence.json'));
}

function mtimes(files: readonly string[]): string {
  return files
    .map(file => {
      try {
        return String(fs.statSync(file).mtimeMs);
      } catch {
        return '-';
      }
    })
    .join('|');
}

export function cswapSignature(env = process.env): string {
  return mtimes(SIGNATURE_FILES.map(name => path.join(cswapDataDir(env), name)));
}

export function deckSignature(deps: ICswapSyncDeps): string {
  const slots = registry.read(deps.registryFile).sessions.map(entry => path.join(deps.slotOf(entry.alias), installFileName(CODE_INSTALL)));
  return mtimes([...slots, deps.credPath]);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function blockOf(account: ICswapAccount): IOAuthBlock | null {
  const block = (account.credentials as { claudeAiOauth?: unknown } | null)?.claudeAiOauth;
  return block && typeof block === 'object' ? (block as IOAuthBlock) : null;
}

function expiresAt(block: IOAuthBlock | null): number {
  return block && typeof block.expiresAt === 'number' ? block.expiresAt : 0;
}

function deckBlock(deps: ICswapSyncDeps, alias: string, email: string): IOAuthBlock | null {
  const live = deps.codeEmail()?.toLowerCase() === email.toLowerCase();
  const block = live
    ? readCredentials(deps.credPath)[CODE_KEY]
    : readJsonFile<IOAuthBlock>(path.join(deps.slotOf(alias), installFileName(CODE_INSTALL)));
  return block && typeof block === 'object' && (block as IOAuthBlock).refreshToken ? (block as IOAuthBlock) : null;
}

function tokenOwners(pairs: readonly [string, IOAuthBlock | null][]): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>();
  for (const [email, block] of pairs) {
    if (!block?.refreshToken) continue;
    const set = owners.get(block.refreshToken) ?? new Set<string>();
    set.add(email.toLowerCase());
    owners.set(block.refreshToken, set);
  }
  return owners;
}

export function syncWithCswap(deps: ICswapSyncDeps): ICswapSyncResult {
  const envelope = deps.exportCswap() as { accounts?: unknown } | null;
  const theirs = (Array.isArray(envelope?.accounts) ? envelope.accounts : []) as ICswapAccount[];
  const sessions = registry.read(deps.registryFile).sessions;
  const mine = sessions.map(entry => [entry.email, deckBlock(deps, entry.alias, entry.email)] as [string, IOAuthBlock | null]);
  const owners = tokenOwners([...theirs.map(entry => [text(entry.email), blockOf(entry)] as [string, IOAuthBlock | null]), ...mine]);
  const trusted = (email: string, block: IOAuthBlock | null) =>
    Boolean(block?.refreshToken && (owners.get(block.refreshToken)?.size ?? 0) === 1 && owners.get(block.refreshToken)?.has(email.toLowerCase()));

  const pullable = theirs.filter(entry => entry.kind !== 'api_key' && trusted(text(entry.email), blockOf(entry)));
  const imported = pullable.length
    ? importEnvelope({ accounts: pullable }, { slotOf: deps.slotOf, registryFile: deps.registryFile, now: deps.now })
    : { added: [], updated: [] };

  const byEmail = new Map(theirs.map(entry => [text(entry.email).toLowerCase(), entry]));
  let nextNumber = Math.max(0, ...theirs.map(entry => (typeof entry.number === 'number' ? entry.number : 0)));
  const push: Record<string, unknown>[] = [];
  const pushed: string[] = [];

  for (const session of registry.read(deps.registryFile).sessions) {
    const block = deckBlock(deps, session.alias, session.email);
    if (!block || !trusted(session.email, block)) continue;
    const other = byEmail.get(session.email.toLowerCase());
    if (other?.kind === 'api_key') continue;
    const otherBlock = other ? blockOf(other) : null;
    const live = deps.codeEmail()?.toLowerCase() === session.email.toLowerCase();
    if (!live && other && trusted(session.email, otherBlock) && expiresAt(otherBlock) >= expiresAt(block)) continue;
    const oauthAccount = readJsonFile<Record<string, unknown>>(path.join(deps.slotOf(session.alias), accountFileName(CODE_INSTALL)));
    if (!oauthAccount || typeof oauthAccount !== 'object') continue;
    push.push({
      number: typeof other?.number === 'number' ? other.number : ++nextNumber,
      email: other ? text(other.email) : session.email,
      uuid: text(other?.uuid) || session.accountUuid || '',
      organizationUuid: other ? text(other.organizationUuid) : session.orgUuid ?? '',
      organizationName: text(other?.organizationName),
      credentials: { claudeAiOauth: block },
      config: { oauthAccount },
    });
    pushed.push(session.alias);
  }

  if (push.length) {
    deps.importCswap({
      version: 1,
      exportedAt: deps.now().toISOString(),
      exportedFrom: 'claudedeck',
      encrypted: false,
      activeAccountNumber: null,
      accounts: push,
    });
  }
  return { pulled: [...imported.added, ...imported.updated], pushed };
}

export function importIntoCswap(envelope: unknown, binary: string = cswapBinary()): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudedeck-cswap-'));
  const file = path.join(dir, 'import.json');
  try {
    fs.writeFileSync(file, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 });
    const run = spawnSync(binary, ['import', file, '--force'], { encoding: 'utf8', windowsHide: true });
    if (run.error) throw new Error(`Could not run cswap: ${run.error.message}`);
    if (run.status !== 0) throw new Error(`cswap import failed: ${(run.stderr || run.stdout || '').trim().split('\n').pop() ?? ''}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function defaultSyncDeps(): ICswapSyncDeps {
  return {
    exportCswap: () => exportFromCswap(),
    importCswap: envelope => importIntoCswap(envelope),
    slotOf: alias => sessionSlot(alias),
    registryFile: undefined,
    credPath: codeCredentialsPath(),
    codeEmail: () => readCodeAccount(codeAccountPath())?.email ?? null,
    now: () => new Date(),
  };
}

export function createCswapWatcher(deps: ICswapSyncDeps, theirSignature: () => string = () => cswapSignature()) {
  let seen = { theirs: '', mine: '' };
  return {
    check(): ICswapSyncResult | null {
      const current = { theirs: theirSignature(), mine: deckSignature(deps) };
      if (current.theirs === seen.theirs && current.mine === seen.mine) return null;
      try {
        return syncWithCswap(deps);
      } finally {
        seen = { theirs: theirSignature(), mine: deckSignature(deps) };
      }
    },
  };
}
