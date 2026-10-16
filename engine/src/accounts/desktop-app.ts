import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnDetached, tryCapture } from '../core/exec';

const PACKAGE_ROOT = 'windowsapps';

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

function readText(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

export function packagedAppId(exe: string, readFile: (file: string) => string = readText): string | null {
  const parts = exe.split(/[\\/]+/);
  const at = parts.findIndex(part => part.toLowerCase() === PACKAGE_ROOT);
  const folder = at >= 0 ? parts[at + 1] : undefined;
  if (!folder) return null;
  const pieces = folder.split('_');
  if (pieces.length < 5) return null;
  const family = `${pieces[0]}_${pieces[pieces.length - 1]}`;
  const root = parts.slice(0, at + 2).join(path.win32.sep);
  const relative = parts.slice(at + 2).join(path.win32.sep).toLowerCase();
  let manifest: string;
  try {
    manifest = readFile(path.win32.join(root, 'AppxManifest.xml'));
  } catch {
    return null;
  }
  for (const tag of manifest.match(/<Application\b[^>]*>/g) ?? []) {
    const id = tag.match(/\bId="([^"]+)"/)?.[1];
    const executable = tag.match(/\bExecutable="([^"]+)"/)?.[1];
    if (id && executable && executable.split(/[\\/]+/).join(path.win32.sep).toLowerCase() === relative) {
      return `${family}!${id}`;
    }
  }
  return null;
}

export function launchTarget(exe: string, readFile?: (file: string) => string): { command: string; args: string[] } {
  const appId = packagedAppId(exe, readFile);
  if (appId) return { command: 'explorer.exe', args: [`shell:AppsFolder${path.win32.sep}${appId}`] };
  return { command: exe, args: [] };
}

export function launch(exe: string, args: string[]): number | undefined {
  return spawnDetached(exe, args);
}
