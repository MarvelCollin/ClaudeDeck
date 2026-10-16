import fs from 'node:fs';
import path from 'node:path';
import { errorMessage, readJsonFile, writeJsonFile } from '../core/fs/json';
import { ILiveUsage, ILiveUsageDeps, ILiveUsageTarget, ILiveWindow, IOAuthBlock } from './interfaces';
import { liveUsagePath } from './paths';
import { CODE_KEY, readCredentials } from './session-store';

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
export const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
export const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
export const OAUTH_BETA = 'oauth-2025-04-20';
export const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
export const MIN_INTERVAL_MS = 60 * 1000;
export const BACKOFF_MS = 5 * 60 * 1000;
export const RELOGIN_RETRY_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 8000;
const USER_AGENT = 'claudedeck/1.0';

type Cache = Record<string, ILiveUsage>;

function toWindow(value: unknown): ILiveWindow | null {
  const window = value as { utilization?: unknown; resets_at?: unknown } | null;
  if (!window || typeof window !== 'object' || typeof window.utilization !== 'number') return null;
  return {
    usedPercent: Math.min(100, Math.max(0, window.utilization)),
    resetsAt: typeof window.resets_at === 'string' && window.resets_at ? window.resets_at : null,
  };
}

export function parseUsage(data: unknown): Pick<ILiveUsage, 'fiveHour' | 'sevenDay'> {
  const source = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return { fiveHour: toWindow(source.five_hour), sevenDay: toWindow(source.seven_day) };
}

export function emptyUsage(status: ILiveUsage['status'], error: string | null = null): ILiveUsage {
  return { status, fiveHour: null, sevenDay: null, fetchedAt: null, checkedAt: null, error, backoffUntil: null };
}

export function needsRefresh(block: IOAuthBlock, now: Date): boolean {
  if (!block.accessToken) return true;
  return typeof block.expiresAt === 'number' && block.expiresAt - EXPIRY_BUFFER_MS <= now.getTime();
}

export function readBlock(file: string, fromCredentials: boolean): IOAuthBlock | null {
  if (fromCredentials) {
    const block = readCredentials(file)[CODE_KEY];
    return block && typeof block === 'object' ? (block as IOAuthBlock) : null;
  }
  return readJsonFile<IOAuthBlock>(file);
}

export function readCache(file: string = liveUsagePath()): Cache {
  const raw = readJsonFile<Cache>(file);
  return raw && typeof raw === 'object' ? raw : {};
}

export function cachedUsage(alias: string, file: string = liveUsagePath()): ILiveUsage | null {
  return readCache(file)[alias.toLowerCase()] ?? null;
}

function signal(): AbortSignal {
  return AbortSignal.timeout(TIMEOUT_MS);
}

export async function refreshBlock(
  block: IOAuthBlock,
  fetchImpl: typeof fetch,
  now: Date
): Promise<{ block: IOAuthBlock | null; dead: boolean; error: string | null }> {
  if (!block.refreshToken) return { block: null, dead: true, error: 'no refresh token' };
  let response: Response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: block.refreshToken, client_id: CLIENT_ID }),
      signal: signal(),
    });
  } catch (error) {
    return { block: null, dead: false, error: errorMessage(error) };
  }
  const text = await response.text();
  if (!response.ok) {
    let code = '';
    try {
      code = String((JSON.parse(text) as { error?: unknown }).error ?? '');
    } catch {
      code = '';
    }
    const dead = [400, 401, 403].includes(response.status) && ['invalid_grant', 'invalid_request'].includes(code);
    return { block: null, dead, error: `refresh failed with ${response.status}${code ? ` ${code}` : ''}` };
  }
  const data = JSON.parse(text) as { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
  const next: IOAuthBlock = {
    ...block,
    accessToken: data.access_token,
    expiresAt: now.getTime() + data.expires_in * 1000,
  };
  if (data.refresh_token) next.refreshToken = data.refresh_token;
  if (data.scope) next.scopes = data.scope.split(' ');
  return { block: next, dead: false, error: null };
}

export async function requestUsage(
  accessToken: string,
  fetchImpl: typeof fetch
): Promise<{ data: unknown; status: number }> {
  const response = await fetchImpl(USAGE_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, 'anthropic-beta': OAUTH_BETA, 'User-Agent': USER_AGENT },
    signal: signal(),
  });
  if (!response.ok) return { data: null, status: response.status };
  return { data: await response.json(), status: response.status };
}

function writeSlot(slotFile: string, block: IOAuthBlock): void {
  fs.mkdirSync(path.dirname(slotFile), { recursive: true });
  fs.writeFileSync(slotFile, `${JSON.stringify(block, null, 2)}\n`, 'utf8');
}

export function targetsFor(
  aliases: readonly { alias: string; email: string }[],
  codeEmail: string | null,
  credPath: string,
  slotFileOf: (alias: string) => string
): ILiveUsageTarget[] {
  const active = codeEmail ? codeEmail.toLowerCase() : null;
  return aliases.map(entry => ({
    alias: entry.alias,
    active: entry.email.toLowerCase() === active,
    credPath,
    slotFile: slotFileOf(entry.alias),
  }));
}

export function defaultLiveDeps(): ILiveUsageDeps {
  return { fetch: globalThis.fetch, now: () => new Date(), cacheFile: liveUsagePath(), minIntervalMs: MIN_INTERVAL_MS };
}

export function createLiveUsage(overrides: Partial<ILiveUsageDeps> = {}) {
  const deps: ILiveUsageDeps = { ...defaultLiveDeps(), ...overrides };

  async function fetchOne(target: ILiveUsageTarget, previous: ILiveUsage | null): Promise<ILiveUsage> {
    const now = deps.now();
    const checkedAt = now.toISOString();
    const keep = (patch: Partial<ILiveUsage>): ILiveUsage => ({
      ...(previous ?? emptyUsage('error')),
      checkedAt,
      ...patch,
    });
    let block = readBlock(target.active ? target.credPath : target.slotFile, target.active);
    if (!block) return { ...emptyUsage('no-login', 'no saved Claude Code login'), checkedAt };

    if (needsRefresh(block, now)) {
      if (target.active) return keep({ error: 'Claude Code refreshes this login on its next message' });
      const refreshed = await refreshBlock(block, deps.fetch, now);
      if (refreshed.dead) return keep({ status: 'relogin', error: refreshed.error });
      if (!refreshed.block) return keep({ error: refreshed.error });
      block = refreshed.block;
      writeSlot(target.slotFile, block);
    }

    try {
      const { data, status } = await requestUsage(block.accessToken as string, deps.fetch);
      if (status === 429) {
        return keep({ error: 'usage endpoint busy', backoffUntil: new Date(now.getTime() + BACKOFF_MS).toISOString() });
      }
      if (status === 401) return keep({ status: target.active ? 'error' : 'relogin', error: 'login rejected' });
      if (!data) return keep({ error: `usage request failed with ${status}` });
      return { status: 'ok', ...parseUsage(data), fetchedAt: checkedAt, checkedAt, error: null, backoffUntil: null };
    } catch (error) {
      return keep({ error: errorMessage(error) });
    }
  }

  function slotChangedSince(target: ILiveUsageTarget, at: string | null): boolean {
    if (!at) return true;
    try {
      return fs.statSync(target.active ? target.credPath : target.slotFile).mtimeMs > Date.parse(at);
    } catch {
      return false;
    }
  }

  function isFresh(target: ILiveUsageTarget, entry: ILiveUsage | null, now: Date): boolean {
    if (!entry || !entry.checkedAt) return false;
    if (slotChangedSince(target, entry.checkedAt)) return false;
    if (entry.backoffUntil && Date.parse(entry.backoffUntil) > now.getTime()) return true;
    const wait = entry.status === 'relogin' ? RELOGIN_RETRY_MS : deps.minIntervalMs;
    return now.getTime() - Date.parse(entry.checkedAt) < wait;
  }

  async function refreshAll(targets: ILiveUsageTarget[], force = false): Promise<Record<string, ILiveUsage>> {
    const cache = readCache(deps.cacheFile);
    const now = deps.now();
    const results = await Promise.all(
      targets.map(async target => {
        const key = target.alias.toLowerCase();
        const previous = cache[key] ?? null;
        if (!force && isFresh(target, previous, now)) return [key, previous as ILiveUsage] as const;
        return [key, await fetchOne(target, previous)] as const;
      })
    );
    const next: Cache = { ...readCache(deps.cacheFile) };
    for (const [key, value] of results) next[key] = value;
    writeJsonFile(deps.cacheFile, next);
    return Object.fromEntries(results);
  }

  return { fetchOne, refreshAll, isFresh };
}
