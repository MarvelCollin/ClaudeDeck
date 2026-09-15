const fs = require('fs');
const path = require('path');
const { copyItem } = require('./session');

const SHARED_DESKTOP_ITEMS = ['Local Storage', 'Session Storage'];
const SHARED_CODE_ITEMS = ['projects', 'history.jsonl', 'todos', 'statsig'];

function swappedItems(allItems, sharedList = SHARED_DESKTOP_ITEMS, enabled = true) {
  if (!enabled) return [...allItems];
  const skip = new Set(sharedList.map(item => item.toLowerCase()));
  return allItems.filter(item => !skip.has(item.toLowerCase()));
}

function capture(profileDir, storeDir, items = SHARED_DESKTOP_ITEMS) {
  const captured = [];
  if (!fs.existsSync(profileDir)) return captured;
  fs.mkdirSync(storeDir, { recursive: true });
  for (const item of items) {
    if (copyItem(path.join(profileDir, item), path.join(storeDir, item))) captured.push(item);
  }
  return captured;
}

function apply(storeDir, profileDir, items = SHARED_DESKTOP_ITEMS) {
  const applied = [];
  if (!fs.existsSync(storeDir)) return applied;
  fs.mkdirSync(profileDir, { recursive: true });
  for (const item of items) {
    const src = path.join(storeDir, item);
    if (!fs.existsSync(src)) continue;
    if (copyItem(src, path.join(profileDir, item))) applied.push(item);
  }
  return applied;
}

function clearFromSlots(slotDirs, items = SHARED_DESKTOP_ITEMS) {
  const removed = [];
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

module.exports = {
  SHARED_CODE_ITEMS,
  SHARED_DESKTOP_ITEMS,
  apply,
  capture,
  clearFromSlots,
  swappedItems,
};
