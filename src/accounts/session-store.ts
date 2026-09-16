import fs from 'node:fs';
import path from 'node:path';
import { errorCode, readJsonFile } from '../core/fs/json';

export const DESKTOP_ITEMS = ['Local State', 'Network', 'Local Storage', 'Session Storage', 'IndexedDB'] as const;
export const CODE_KEY = 'claudeAiOauth';
export const CONFIG_KEYS = ['lastKnownAccountUuid'] as const;
export const CONFIG_PREFIXES = ['oauth:'] as const;

const BUSY_CODES = new Set(['EBUSY', 'EPERM', 'EPIPE', 'EACCES']);

export function copyItem(src: string, dst: string): boolean {
  if (!fs.existsSync(src)) return false;
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try {
    fs.cpSync(src, dst, { recursive: true });
  } catch (error) {
    if (BUSY_CODES.has(errorCode(error) ?? '')) {
      throw new Error('Claude Desktop still has its session files open. Close Claude Desktop and try again.');
    }
    throw error;
  }
  return true;
}

export function snapshotDesktop(
  profileDir: string,
  slotDir: string,
  items: readonly string[] = DESKTOP_ITEMS
): string[] {
  const saved: string[] = [];
  fs.mkdirSync(slotDir, { recursive: true });
  for (const item of items) {
    if (copyItem(path.join(profileDir, item), path.join(slotDir, item))) saved.push(item);
  }
  return saved;
}

export function restoreDesktop(
  slotDir: string,
  profileDir: string,
  items: readonly string[] = DESKTOP_ITEMS
): string[] {
  const restored: string[] = [];
  fs.mkdirSync(profileDir, { recursive: true });
  for (const item of items) {
    const src = path.join(slotDir, item);
    if (!fs.existsSync(src)) continue;
    if (copyItem(src, path.join(profileDir, item))) restored.push(item);
  }
  return restored;
}

export function readCredentials(credPath: string): Record<string, unknown> {
  if (!fs.existsSync(credPath)) return {};
  return JSON.parse(fs.readFileSync(credPath, 'utf8')) as Record<string, unknown>;
}

export function readCodeBlock(credPath: string): unknown {
  return readCredentials(credPath)[CODE_KEY] ?? null;
}

export function snapshotCode(credPath: string, slotFile: string): boolean {
  const block = readCodeBlock(credPath);
  if (!block) return false;
  fs.mkdirSync(path.dirname(slotFile), { recursive: true });
  fs.writeFileSync(slotFile, `${JSON.stringify(block, null, 2)}\n`, 'utf8');
  return true;
}

export function restoreCode(slotFile: string, credPath: string): boolean {
  if (!fs.existsSync(slotFile)) return false;
  const block: unknown = JSON.parse(fs.readFileSync(slotFile, 'utf8'));
  const data = readCredentials(credPath);
  if (fs.existsSync(credPath)) fs.copyFileSync(credPath, `${credPath}.claudedeck.bak`);
  data[CODE_KEY] = block;
  fs.mkdirSync(path.dirname(credPath), { recursive: true });
  fs.writeFileSync(credPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return true;
}

export function isAccountConfigKey(key: string): boolean {
  return (CONFIG_KEYS as readonly string[]).includes(key) || CONFIG_PREFIXES.some(prefix => key.startsWith(prefix));
}

export function accountConfigKeys(config: Record<string, unknown> | null | undefined): string[] {
  return Object.keys(config ?? {}).filter(isAccountConfigKey);
}

export function snapshotConfig(configPath: string, slotFile: string): boolean {
  const config = readJsonFile<Record<string, unknown>>(configPath);
  if (!config) return false;
  const picked: Record<string, unknown> = {};
  for (const key of accountConfigKeys(config)) picked[key] = config[key];
  fs.mkdirSync(path.dirname(slotFile), { recursive: true });
  fs.writeFileSync(slotFile, `${JSON.stringify(picked, null, 2)}\n`, 'utf8');
  return true;
}

export function restoreConfig(slotFile: string, configPath: string): boolean {
  const picked = readJsonFile<Record<string, unknown>>(slotFile);
  if (!picked) return false;
  const config = readJsonFile<Record<string, unknown>>(configPath) ?? {};
  for (const key of accountConfigKeys(config)) delete config[key];
  Object.assign(config, picked);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return true;
}
