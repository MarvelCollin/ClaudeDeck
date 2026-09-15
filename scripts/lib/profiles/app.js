const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

function windowsCandidates(env = process.env) {
  const local = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const programFiles = env.ProgramFiles || 'C:\\Program Files';
  return [
    path.join(local, 'AnthropicClaude', 'Claude.exe'),
    path.join(local, 'Programs', 'Claude', 'Claude.exe'),
    path.join(programFiles, 'Claude', 'Claude.exe'),
  ];
}

function darwinCandidates() {
  return [
    '/Applications/Claude.app/Contents/MacOS/Claude',
    path.join(os.homedir(), 'Applications', 'Claude.app', 'Contents', 'MacOS', 'Claude'),
  ];
}

function packagedWindowsPath() {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', '(Get-AppxPackage -Name Claude | Select-Object -First 1).InstallLocation'],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) return null;
  const location = (result.stdout || '').trim();
  if (!location) return null;
  const exe = path.join(location, 'app', 'Claude.exe');
  return fs.existsSync(exe) ? exe : null;
}

function locateApp(platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    const packaged = packagedWindowsPath();
    if (packaged) return packaged;
    const found = windowsCandidates(env).find(candidate => fs.existsSync(candidate));
    if (found) return found;
    throw new Error('Claude Desktop not found. Checked the Claude appx package and the standard install paths.');
  }
  if (platform === 'darwin') {
    const found = darwinCandidates().find(candidate => fs.existsSync(candidate));
    if (found) return found;
    throw new Error('Claude Desktop not found at /Applications/Claude.app.');
  }
  throw new Error(`Launching Claude Desktop is not supported on ${platform}.`);
}

function launchArgs(profileDir, isDefault = false) {
  return isDefault ? [] : [`--user-data-dir=${profileDir}`];
}

function launch(exe, args) {
  const child = spawn(exe, args, { detached: true, stdio: 'ignore' });
  child.unref();
  return child.pid;
}

function openUrl(url, platform = process.platform) {
  if (platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

module.exports = {
  darwinCandidates,
  launch,
  launchArgs,
  locateApp,
  openUrl,
  windowsCandidates,
};
