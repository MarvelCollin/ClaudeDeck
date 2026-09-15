const fs = require('fs');
const path = require('path');

const DESKTOP_ITEMS = ['Local State', 'Network', 'Local Storage', 'Session Storage', 'IndexedDB'];
const CODE_KEY = 'claudeAiOauth';

function copyItem(src, dst) {
  if (!fs.existsSync(src)) return false;
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try {
    fs.cpSync(src, dst, { recursive: true });
  } catch (err) {
    if (['EBUSY', 'EPERM', 'EPIPE', 'EACCES'].includes(err.code)) {
      throw new Error('Claude Desktop still has its session files open. Close Claude Desktop and try again.');
    }
    throw err;
  }
  return true;
}

function snapshotDesktop(profileDir, slotDir, items = DESKTOP_ITEMS) {
  const saved = [];
  fs.mkdirSync(slotDir, { recursive: true });
  for (const item of items) {
    if (copyItem(path.join(profileDir, item), path.join(slotDir, item))) saved.push(item);
  }
  return saved;
}

function restoreDesktop(slotDir, profileDir, items = DESKTOP_ITEMS) {
  const restored = [];
  fs.mkdirSync(profileDir, { recursive: true });
  for (const item of items) {
    const src = path.join(slotDir, item);
    if (!fs.existsSync(src)) continue;
    if (copyItem(src, path.join(profileDir, item))) restored.push(item);
  }
  return restored;
}

function readCredentials(credPath) {
  if (!fs.existsSync(credPath)) return {};
  return JSON.parse(fs.readFileSync(credPath, 'utf8'));
}

function readCodeBlock(credPath) {
  const data = readCredentials(credPath);
  return data[CODE_KEY] || null;
}

function snapshotCode(credPath, slotFile) {
  const block = readCodeBlock(credPath);
  if (!block) return false;
  fs.mkdirSync(path.dirname(slotFile), { recursive: true });
  fs.writeFileSync(slotFile, `${JSON.stringify(block, null, 2)}\n`, 'utf8');
  return true;
}

function restoreCode(slotFile, credPath) {
  if (!fs.existsSync(slotFile)) return false;
  const block = JSON.parse(fs.readFileSync(slotFile, 'utf8'));
  const data = readCredentials(credPath);
  if (fs.existsSync(credPath)) {
    fs.copyFileSync(credPath, `${credPath}.claudedeck.bak`);
  }
  data[CODE_KEY] = block;
  fs.mkdirSync(path.dirname(credPath), { recursive: true });
  fs.writeFileSync(credPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return true;
}

module.exports = {
  CODE_KEY,
  DESKTOP_ITEMS,
  copyItem,
  readCodeBlock,
  readCredentials,
  restoreCode,
  restoreDesktop,
  snapshotCode,
  snapshotDesktop,
};
