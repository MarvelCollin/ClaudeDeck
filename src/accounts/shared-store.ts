import fs from 'node:fs';
import path from 'node:path';
import { copyItem } from './session-store';

export const SHARED_DESKTOP_ITEMS = ['Local Storage', 'Session Storage'] as const;
export const SHARED_CODE_ITEMS = ['projects', 'history.jsonl', 'todos', 'statsig'] as const;

export function swappedItems(
  allItems: readonly string[],
  sharedList: readonly string[] = SHARED_DESKTOP_ITEMS,
  enabled = true
): string[] {
  if (!enabled) return [...allItems];
  const skip = new Set(sharedList.map(item => item.toLowerCase()));
  return allItems.filter(item => !skip.has(item.toLowerCase()));
}

export function capture(
  profileDir: string,
  storeDir: string,
  items: readonly string[] = SHARED_DESKTOP_ITEMS
): string[] {
  const captured: string[] = [];
  if (!fs.existsSync(profileDir)) return captured;
  fs.mkdirSync(storeDir, { recursive: true });
  for (const item of items) {
    if (copyItem(path.join(profileDir, item), path.join(storeDir, item))) captured.push(item);
  }
  return captured;
}

export function apply(
  storeDir: string,
  profileDir: string,
  items: readonly string[] = SHARED_DESKTOP_ITEMS
): string[] {
  const applied: string[] = [];
  if (!fs.existsSync(storeDir)) return applied;
  fs.mkdirSync(profileDir, { recursive: true });
  for (const item of items) {
    const src = path.join(storeDir, item);
    if (!fs.existsSync(src)) continue;
    if (copyItem(src, path.join(profileDir, item))) applied.push(item);
  }
  return applied;
}

export function clearFromSlots(
  slotDirs: readonly string[],
  items: readonly string[] = SHARED_DESKTOP_ITEMS
): string[] {
  const removed: string[] = [];
  for (const slotDir of slotDirs) {
    for (const item of items) {
      const target = path.join(slotDir, item);
      if (!fs.existsSync(target)) continue;
      fs.rmSync(target, { recursive: true, force: true });
      removed.push(target);
    }
  }
  return removed;
}
