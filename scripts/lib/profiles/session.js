const fs = require('fs');
const path = require('path');

const DESKTOP_ITEMS = ['Local State', 'Network', 'Local Storage', 'Session Storage', 'IndexedDB'];
const CODE_KEY = 'claudeAiOauth';
const CONFIG_KEYS = ['lastKnownAccountUuid'];
const CONFIG_PREFIXES = ['oauth:'];

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

function isAccountConfigKey(key) {
  return CONFIG_KEYS.includes(key) || CONFIG_PREFIXES.some(prefix => key.startsWith(prefix));
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return null;
  }
}

function accountConfigKeys(config) {
  return Object.keys(config || {}).filter(isAccountConfigKey);
}

function snapshotConfig(configPath, slotFile) {
  const config = readJson(configPath);
  if (!config) return false;
  const picked = {};
  for (const key of accountConfigKeys(config)) picked[key] = config[key];
  fs.mkdirSync(path.dirname(slotFile), { recursive: true });
  fs.writeFileSync(slotFile, `${JSON.stringify(picked, null, 2)}\n`, 'utf8');
  return true;
}

function restoreConfig(slotFile, configPath) {
  const picked = readJson(slotFile);
  if (!picked) return false;
  const config = readJson(configPath) || {};
  for (const key of accountConfigKeys(config)) delete config[key];
  Object.assign(config, picked);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return true;
}

module.exports = {
  CODE_KEY,
  CONFIG_KEYS,
  CONFIG_PREFIXES,
  DESKTOP_ITEMS,
  accountConfigKeys,
  copyItem,
  isAccountConfigKey,
  readCodeBlock,
  readCredentials,
  restoreCode,
  restoreConfig,
  restoreDesktop,
  snapshotCode,
  snapshotConfig,
  snapshotDesktop,
};
