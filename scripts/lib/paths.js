const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const configTemplatePath = path.join(root, 'claudedeck.config.json');

function userDataDir(platform = process.platform) {
  if (platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'ClaudeDeck');
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'ClaudeDeck');
  return path.join(os.homedir(), '.config', 'claudedeck');
}

function legacyUserDataDir(platform = process.platform) {
  if (platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'ClaudeCron');
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'ClaudeCron');
  return path.join(os.homedir(), '.config', 'claudecron');
}

function migrateLegacyData(platform = process.platform) {
  const current = userDataDir(platform);
  const legacy = legacyUserDataDir(platform);
  if (current === legacy || fs.existsSync(current) || !fs.existsSync(legacy)) return current;
  fs.renameSync(legacy, current);
  const legacyConfig = path.join(current, 'claudecron.config.json');
  const currentConfig = path.join(current, 'claudedeck.config.json');
  if (fs.existsSync(legacyConfig) && !fs.existsSync(currentConfig)) fs.renameSync(legacyConfig, currentConfig);
  return current;
}

try {
  migrateLegacyData();
} catch (err) {
  console.error(`Could not move your ClaudeCron data to the ClaudeDeck folder: ${err.message}`);
}

const defaultConfigPath = path.join(userDataDir(), 'claudedeck.config.json');

function fromRoot(...parts) {
  return path.join(root, ...parts);
}

function resolveFromConfig(value, configPath) {
  return path.isAbsolute(value) ? value : path.join(path.dirname(configPath), value);
}

module.exports = {
  root,
  configTemplatePath,
  defaultConfigPath,
  fromRoot,
  legacyUserDataDir,
  migrateLegacyData,
  resolveFromConfig,
  userDataDir,
};
