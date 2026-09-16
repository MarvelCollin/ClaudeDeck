import fs from 'node:fs';
import { errorMessage, writeJsonFile } from '../core/fs/json';
import {
  ICachedIdentity,
  IProfileEntry,
  IRegistry,
  IRegistrySettings,
  ISavedSession,
} from './interfaces';
import { assertValidAlias, isDefaultAlias, registryPath } from './paths';

export const VERSION = 1;
export const DEFAULT_SETTINGS: IRegistrySettings = { shareSession: true };

type SettingKey = keyof IRegistrySettings;

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

export function normalizeSettings(value: unknown): IRegistrySettings {
  const source = (value && typeof value === 'object' ? value : {}) as Partial<IRegistrySettings>;
  return {
    shareSession: typeof source.shareSession === 'boolean' ? source.shareSession : DEFAULT_SETTINGS.shareSession,
  };
}

export function emptyRegistry(): IRegistry {
  return { version: VERSION, profiles: [], identities: {}, sessions: [], settings: normalizeSettings(null) };
}

export function settingsOf(registry: IRegistry | null | undefined): IRegistrySettings {
  return normalizeSettings(registry?.settings);
}

export function setSetting<K extends SettingKey>(
  registry: IRegistry,
  key: K,
  value: IRegistrySettings[K]
): IRegistry {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) throw new Error(`Unknown setting "${String(key)}".`);
  if (typeof value !== typeof DEFAULT_SETTINGS[key]) {
    throw new Error(`Setting "${String(key)}" expects a ${typeof DEFAULT_SETTINGS[key]}.`);
  }
  return { ...registry, settings: { ...settingsOf(registry), [key]: value } };
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
    installs: normalizeInstalls(value.installs),
    savedAt: value.savedAt ?? null,
  };
}

export function normalizeIdentity(value: unknown): ICachedIdentity | null {
  const entry = value as Partial<ICachedIdentity> | null;
  if (!entry || typeof entry !== 'object' || typeof entry.email !== 'string') return null;
  return {
    email: entry.email,
    name: trimmedOr(entry.name, fallbackName(entry.email)),
    seenAt: entry.seenAt ?? null,
  };
}

function normalizeProfiles(entries: unknown[]): IProfileEntry[] {
  const seen = new Set<string>();
  const profiles: IProfileEntry[] = [];
  for (const raw of entries) {
    const entry = raw as Partial<IProfileEntry> | null;
    if (!entry || typeof entry.alias !== 'string') continue;
    const key = lower(entry.alias);
    if (seen.has(key)) continue;
    seen.add(key);
    profiles.push({
      alias: entry.alias,
      label: trimmedOr(entry.label, entry.alias),
      createdAt: entry.createdAt ?? null,
      lastLaunchedAt: entry.lastLaunchedAt ?? null,
    });
  }
  return profiles;
}

export function normalize(data: unknown): IRegistry {
  const source = data as Partial<IRegistry> | null;
  if (!source || typeof source !== 'object' || !Array.isArray(source.profiles)) return emptyRegistry();

  const identities: Record<string, ICachedIdentity> = {};
  if (source.identities && typeof source.identities === 'object') {
    for (const [alias, value] of Object.entries(source.identities)) {
      const identity = normalizeIdentity(value);
      if (identity) identities[lower(alias)] = identity;
    }
  }

  const sessions: ISavedSession[] = [];
  const seenSession = new Set<string>();
  if (Array.isArray(source.sessions)) {
    for (const entry of source.sessions) {
      const session = normalizeSession(entry);
      if (!session || seenSession.has(lower(session.alias))) continue;
      seenSession.add(lower(session.alias));
      sessions.push(session);
    }
  }

  return {
    version: VERSION,
    profiles: normalizeProfiles(source.profiles),
    identities,
    sessions,
    settings: normalizeSettings(source.settings),
  };
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

export function identityFor(registry: IRegistry, alias: string): ICachedIdentity | null {
  return registry.identities?.[lower(alias)] ?? null;
}

export function rememberIdentity(registry: IRegistry, alias: string, identity: unknown, now = new Date()): IRegistry {
  const value = normalizeIdentity(identity);
  if (!value) return registry;
  value.seenAt = now.toISOString();
  return { ...registry, identities: { ...(registry.identities ?? {}), [lower(alias)]: value } };
}

export function forgetIdentity(registry: IRegistry, alias: string): IRegistry {
  const identities = { ...(registry.identities ?? {}) };
  delete identities[lower(alias)];
  return { ...registry, identities };
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

export function find(registry: IRegistry, alias: string): IProfileEntry | null {
  const wanted = lower(alias);
  return registry.profiles.find(entry => lower(entry.alias) === wanted) ?? null;
}

export function add(registry: IRegistry, alias: string, label: string = alias, now = new Date()): IRegistry {
  assertValidAlias(alias);
  if (isDefaultAlias(alias)) throw new Error('Alias "default" is reserved for the existing Claude Desktop profile.');
  if (find(registry, alias)) throw new Error(`Profile "${alias}" already exists.`);
  const entry: IProfileEntry = {
    alias,
    label: String(label).trim() || alias,
    createdAt: now.toISOString(),
    lastLaunchedAt: null,
  };
  return { ...registry, profiles: [...registry.profiles, entry] };
}

export function setLabel(registry: IRegistry, alias: string, label: string): IRegistry {
  const text = String(label || '').trim();
  if (!text) throw new Error('Label cannot be empty.');
  if (!find(registry, alias)) throw new Error(`Profile "${alias}" not found.`);
  const wanted = lower(alias);
  return {
    ...registry,
    profiles: registry.profiles.map(entry => (lower(entry.alias) === wanted ? { ...entry, label: text } : entry)),
  };
}

export function remove(registry: IRegistry, alias: string): IRegistry {
  if (isDefaultAlias(alias)) throw new Error('Cannot remove the default Claude Desktop profile.');
  if (!find(registry, alias)) throw new Error(`Profile "${alias}" not found.`);
  const wanted = lower(alias);
  const identities = { ...(registry.identities ?? {}) };
  delete identities[wanted];
  return { ...registry, identities, profiles: registry.profiles.filter(entry => lower(entry.alias) !== wanted) };
}

export function touch(registry: IRegistry, alias: string, now = new Date()): IRegistry {
  const wanted = lower(alias);
  return {
    ...registry,
    profiles: registry.profiles.map(entry =>
      lower(entry.alias) === wanted ? { ...entry, lastLaunchedAt: now.toISOString() } : entry
    ),
  };
}
