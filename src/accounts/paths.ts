import os from 'node:os';
import path from 'node:path';

export const DEFAULT_ALIAS = 'default';

const ALIAS_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,31}$/;

export function roamingDir(platform: NodeJS.Platform = process.platform, env = process.env): string {
  if (platform === 'win32') return env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support');
  return env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

export function desktopProfileDir(platform: NodeJS.Platform = process.platform, env = process.env): string {
  return path.join(roamingDir(platform, env), 'Claude');
}

function deckDir(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, ...parts: string[]): string {
  return path.join(roamingDir(platform, env), 'ClaudeDeck', ...parts);
}

export function profilesRoot(platform: NodeJS.Platform = process.platform, env = process.env): string {
  return deckDir(platform, env, 'profiles');
}

export function registryPath(platform: NodeJS.Platform = process.platform, env = process.env): string {
  return deckDir(platform, env, 'profiles.json');
}

export function sessionsRoot(platform: NodeJS.Platform = process.platform, env = process.env): string {
  return deckDir(platform, env, 'sessions');
}

export function sharedRoot(platform: NodeJS.Platform = process.platform, env = process.env): string {
  return deckDir(platform, env, 'shared');
}

export function sessionSlot(alias: string, platform: NodeJS.Platform = process.platform, env = process.env): string {
  assertValidAlias(alias);
  return path.join(sessionsRoot(platform, env), alias);
}

export function homeDir(env = process.env): string {
  return env.USERPROFILE || env.HOME || os.homedir();
}

export function codeCredentialsPath(env = process.env): string {
  return path.join(homeDir(env), '.claude', '.credentials.json');
}

export function codeAccountPath(env = process.env): string {
  return path.join(homeDir(env), '.claude.json');
}

export function desktopConfigPath(profileDir: string): string {
  return path.join(profileDir, 'config.json');
}

export function isDefaultAlias(alias: string): boolean {
  return String(alias).toLowerCase() === DEFAULT_ALIAS;
}

export function isValidAlias(alias: unknown): alias is string {
  return typeof alias === 'string' && ALIAS_PATTERN.test(alias);
}

export function assertValidAlias(alias: unknown): string {
  if (!isValidAlias(alias)) {
    throw new Error(`Invalid alias "${String(alias)}". Use 1-32 characters: letters, digits, dot, dash, underscore.`);
  }
  return alias;
}

export function deriveAlias(label: string): string {
  const alias = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[^a-z0-9]+$/, '')
    .slice(0, 32)
    .replace(/[^a-z0-9]+$/, '');
  if (!alias) throw new Error(`Cannot build a folder name from "${label}". Use letters or digits.`);
  return alias;
}

export function profilePath(alias: string, platform: NodeJS.Platform = process.platform, env = process.env): string {
  if (isDefaultAlias(alias)) return desktopProfileDir(platform, env);
  assertValidAlias(alias);
  return path.join(profilesRoot(platform, env), alias);
}
