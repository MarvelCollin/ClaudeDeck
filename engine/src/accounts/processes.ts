import { spawnSync } from 'node:child_process';
import { errorCode } from '../core/fs/json';
import { tryCapture } from '../core/exec';
import { IClaudeProcess, IProfileLocation } from './interfaces';
import { DEFAULT_ALIAS } from './paths';

export const SEPARATOR = '|::|';

const MACOS_BINARY = /Claude\.app\/Contents\/MacOS\/Claude/;

function nonEmptyLines(text: string): string[] {
  return String(text)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

export function parseProcessLines(text: string): IClaudeProcess[] {
  const processes: IClaudeProcess[] = [];
  for (const line of nonEmptyLines(text)) {
    const index = line.indexOf(SEPARATOR);
    if (index === -1) continue;
    const pid = Number(line.slice(0, index).trim());
    if (!Number.isInteger(pid) || pid <= 0) continue;
    processes.push({ pid, commandLine: line.slice(index + SEPARATOR.length).trim() });
  }
  return processes;
}

export function parsePosixProcessLines(text: string): IClaudeProcess[] {
  const processes: IClaudeProcess[] = [];
  for (const line of nonEmptyLines(text)) {
    const match = line.match(/^(\d+)\s+(.*)$/);
    if (!match) continue;
    processes.push({ pid: Number(match[1]), commandLine: match[2] as string });
  }
  return processes;
}

export function userDataDirOf(commandLine: string): string | null {
  const quoted = commandLine.match(/--user-data-dir="([^"]+)"/);
  if (quoted) return quoted[1] as string;
  const bare = commandLine.match(/--user-data-dir=(\S+)/);
  return bare ? (bare[1] as string) : null;
}

export function samePath(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  const clean = (value: string): string => String(value).replace(/[\\/]+$/, '').toLowerCase();
  return clean(left) === clean(right);
}

export function aliasForCommandLine(
  commandLine: string,
  profiles: readonly IProfileLocation[],
  defaultDir: string
): string | null {
  const dir = userDataDirOf(commandLine);
  if (!dir) return DEFAULT_ALIAS;
  const match = profiles.find(profile => samePath(profile.dir, dir));
  if (match) return match.alias;
  if (samePath(dir, defaultDir)) return DEFAULT_ALIAS;
  return null;
}

export function listClaudeProcesses(platform: NodeJS.Platform = process.platform): IClaudeProcess[] {
  if (platform === 'win32') {
    const command = `Get-CimInstance Win32_Process -Filter "Name='claude.exe'" | ForEach-Object { "$($_.ProcessId)${SEPARATOR}$($_.CommandLine)" }`;
    const output = tryCapture('powershell.exe', ['-NoProfile', '-Command', command]);
    return output === null ? [] : parseProcessLines(output);
  }
  if (platform === 'darwin') {
    const output = tryCapture('ps', ['-ax', '-o', 'pid=,command=']);
    return output === null ? [] : parsePosixProcessLines(output).filter(entry => MACOS_BINARY.test(entry.commandLine));
  }
  return [];
}

export function groupProcesses(
  processes: readonly IClaudeProcess[],
  profiles: readonly IProfileLocation[],
  defaultDir: string
): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const entry of processes) {
    const alias = aliasForCommandLine(entry.commandLine, profiles, defaultDir);
    if (!alias) continue;
    const pids = groups.get(alias) ?? [];
    pids.push(entry.pid);
    groups.set(alias, pids);
  }
  return groups;
}

export function killPids(pids: readonly number[], platform: NodeJS.Platform = process.platform): number {
  if (!pids.length) return 0;
  if (platform === 'win32') {
    const command = `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | Stop-Process -Force`;
    spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' });
    return pids.length;
  }
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if (errorCode(error) !== 'ESRCH') throw error;
    }
  }
  return pids.length;
}
