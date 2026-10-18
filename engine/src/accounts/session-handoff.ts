import path from 'node:path';
import { newConsoleLaunch } from '../core/console';
import { runCapture } from '../core/exec';
import { packageRoot } from '../core/paths';
import { IHandoffResult, ISwitcher } from './interfaces';
import { packagedProfileDirs, roamingDir } from './paths';

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DESKTOP_FOLDER = 'Claude';

export function handoffScriptPath(): string {
  return path.join(packageRoot, '..', 'scripts', 'handoff.ps1');
}

export function handoffFolders(cwd: string, platform: NodeJS.Platform = process.platform, env = process.env): string[] {
  const folders = [cwd];
  const desktopRoot = path.join(roamingDir(platform, env), DESKTOP_FOLDER);
  const packaged = packagedProfileDirs(platform, env)[0];
  const inside = path.relative(desktopRoot, cwd);
  if (packaged && inside && !inside.startsWith('..') && !path.isAbsolute(inside)) folders.push(path.join(packaged, inside));
  return folders;
}

function quoted(value: string): string {
  return `'"${value.replace(/'/g, "''").replace(/"/g, '')}"'`;
}

export function handoffLaunch(
  sessionId: string,
  folders: readonly string[],
  name: string,
  platform: NodeJS.Platform = process.platform,
  script: string = handoffScriptPath()
): { command: string; args: string[] } {
  if (platform === 'win32') {
    const args = ['powershell.exe', '-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-SessionId', sessionId, '-Name', name];
    if (folders[0]) args.push('-Folder', folders[0]);
    if (folders[1]) args.push('-AltFolder', folders[1]);
    return newConsoleLaunch(args);
  }
  if (platform === 'darwin') {
    const folder = (folders[0] ?? '').replace(/'/g, "'\\''");
    const shell = `cd '${folder}' && claude --resume ${sessionId} --fork-session`;
    return { command: 'osascript', args: ['-e', `tell application "Terminal" to do script ${JSON.stringify(shell)}`, '-e', 'tell application "Terminal" to activate'] };
  }
  throw new Error(`Continuing a session in a terminal is not supported on ${platform}.`);
}

export function startHandoff(
  switcher: ISwitcher,
  alias: string,
  sessionId: string,
  cwd: string,
  run: (command: string, args: string[]) => unknown = (command, args) => runCapture(command, args, { windowsHide: true })
): IHandoffResult {
  if (!SESSION_ID.test(sessionId)) throw new Error('This session has no id ClaudeDeck can continue.');
  const listed = switcher.listSessions().sessions.find(entry => entry.alias.toLowerCase() === alias.toLowerCase());
  if (!listed) throw new Error(`No saved session for "${alias}".`);
  const code = switcher.currentCodeIdentity();
  const movedCode = !code || code.email.toLowerCase() !== listed.email.toLowerCase();
  if (movedCode) switcher.switchCode(listed.alias);
  const folders = handoffFolders(cwd);
  const target = handoffLaunch(sessionId, folders, listed.name);
  run(target.command, target.args);
  return { alias: listed.alias, name: listed.name, sessionId, folders, movedCode };
}
