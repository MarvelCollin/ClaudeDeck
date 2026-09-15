const fs = require('fs');
const os = require('os');
const path = require('path');

function statePath(platform = process.platform) {
  if (platform === 'win32') {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, 'ClaudeDeck', 'state.json');
  }
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'ClaudeDeck', 'state.json');
  return path.join(os.homedir(), '.claudedeck-state.json');
}

function readState() {
  const file = statePath();
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeState(configHash) {
  const file = statePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ configHash }, null, 2), 'utf8');
}

module.exports = {
  readState,
  writeState,
};
