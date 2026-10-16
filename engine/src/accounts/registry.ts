import fs from 'node:fs';
import { errorMessage, writeJsonFile } from '../core/fs/json';
import { IRegistry, ISavedSession } from './interfaces';
import { registryPath } from './paths';

export const VERSION = 1;

function lower(value: string): string {
  return String(value).toLowerCase();
}

function fallbackName(email: string): string {
  return email.split('@')[0] ?? email;
}

function trimmedOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export function emptyRegistry(): IRegistry {
  return { version: VERSION, sessions: [] };
}

export const LEGACY_INSTALL = 'code';

function normalizeInstalls(value: unknown): string[] {
  if (!Array.isArray(value)) return [LEGACY_INSTALL];
  const ids = value.filter((id): id is string => typeof id === 'string' && Boolean(id));
  return ids.length ? [...new Set(ids)] : [LEGACY_INSTALL];
}

export function normalizeSession(entry: unknown): ISavedSession | null {
  const value = entry as Partial<ISavedSession> | null;
  if (!value || typeof value.alias !== 'string' || typeof value.email !== 'string') return null;
  return {
    alias: value.alias,
    email: value.email,
    name: trimmedOr(value.name, fallbackName(value.email)),
    accountUuid: nullableString(value.accountUuid),
    orgUuid: nullableString(value.orgUuid),
    installs: normalizeInstalls(value.installs),
    savedAt: value.savedAt ?? null,
  };
}

export function normalize(data: unknown): IRegistry {
  const source = data as Partial<IRegistry> | null;
  if (!source || typeof source !== 'object') return emptyRegistry();
  const sessions: ISavedSession[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(source.sessions) ? source.sessions : []) {
    const session = normalizeSession(entry);
    if (!session || seen.has(lower(session.alias))) continue;
    seen.add(lower(session.alias));
    sessions.push(session);
  }
  return { version: VERSION, sessions };
}

export function findSession(registry: IRegistry, alias: string): ISavedSession | null {
  const wanted = lower(alias);
  return (registry.sessions ?? []).find(entry => lower(entry.alias) === wanted) ?? null;
}

export function sessionByEmail(registry: IRegistry, email: string): ISavedSession | null {
  const wanted = lower(email);
  return (registry.sessions ?? []).find(entry => lower(entry.email) === wanted) ?? null;
}

export function sessionByUuid(registry: IRegistry, accountUuid: string | null): ISavedSession | null {
  if (!accountUuid) return null;
  return (registry.sessions ?? []).find(entry => entry.accountUuid === accountUuid) ?? null;
}

export function saveSession(registry: IRegistry, session: unknown, now = new Date()): IRegistry {
  const value = normalizeSession(session);
  if (!value) throw new Error('A saved session needs an alias and an email.');
  value.savedAt = now.toISOString();
  const previous = findSession(registry, value.alias);
  if (previous) value.installs = [...new Set([...previous.installs, ...value.installs])];
  const rest = (registry.sessions ?? []).filter(entry => lower(entry.alias) !== lower(value.alias));
  return { ...registry, sessions: [...rest, value] };
}

export function removeSession(registry: IRegistry, alias: string): IRegistry {
  const wanted = lower(alias);
  return { ...registry, sessions: (registry.sessions ?? []).filter(entry => lower(entry.alias) !== wanted) };
}

export function read(file = registryPath()): IRegistry {
  if (!fs.existsSync(file)) return emptyRegistry();
  try {
    return normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (error) {
    throw new Error(`Profile registry at ${file} is not valid JSON: ${errorMessage(error)}`);
  }
}

export function write(registry: IRegistry, file = registryPath()): IRegistry {
  const data = normalize(registry);
  writeJsonFile(file, data);
  return data;
}
