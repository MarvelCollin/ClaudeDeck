import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnDetached, tryCapture } from '../core/exec';

export function windowsCandidates(env = process.env): string[] {
  const local = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const programFiles = env.ProgramFiles || 'C:\\Program Files';
  return [
    path.join(local, 'AnthropicClaude', 'Claude.exe'),
    path.join(local, 'Programs', 'Claude', 'Claude.exe'),
    path.join(programFiles, 'Claude', 'Claude.exe'),
  ];
}

export function darwinCandidates(): string[] {
  return [
    '/Applications/Claude.app/Contents/MacOS/Claude',
    path.join(os.homedir(), 'Applications', 'Claude.app', 'Contents', 'MacOS', 'Claude'),
  ];
}

function packagedWindowsPath(): string | null {
  const output = tryCapture('powershell.exe', [
    '-NoProfile',
    '-Command',
    '(Get-AppxPackage -Name Claude | Select-Object -First 1).InstallLocation',
  ]);
  const location = (output ?? '').trim();
  if (!location) return null;
  const exe = path.join(location, 'app', 'Claude.exe');
  return fs.existsSync(exe) ? exe : null;
}

export function locateApp(platform: NodeJS.Platform = process.platform, env = process.env): string {
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

export function launchArgs(profileDir: string, isDefault = false): string[] {
  return isDefault ? [] : [`--user-data-dir=${profileDir}`];
}

export function launch(exe: string, args: string[]): number | undefined {
  return spawnDetached(exe, args);
}

export function openUrl(url: string, platform: NodeJS.Platform = process.platform): void {
  if (platform === 'win32') {
    spawnDetached('cmd.exe', ['/c', 'start', '', url]);
    return;
  }
  spawnDetached(platform === 'darwin' ? 'open' : 'xdg-open', [url]);
}
