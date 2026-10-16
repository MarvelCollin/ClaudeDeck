import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { errorCode } from '../core/fs/json';
import { tryCapture } from '../core/exec';
import { IClaudeProcess } from './interfaces';

export const SEPARATOR = '|::|';

const MACOS_BINARY = /Claude\.app\/Contents\/MacOS\/Claude/;
const QUOTED_EXECUTABLE = /^"([^"]+)"/;
const BARE_EXECUTABLE = /^(\S+?\.exe)(?:\s|$)/i;

function nonEmptyLines(text: string): string[] {
  return String(text)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

export function parseProcessLines(text: string): IClaudeProcess[] {
  const processes: IClaudeProcess[] = [];
  for (const line of nonEmptyLines(text)) {
    const fields = line.split(SEPARATOR);
    if (fields.length < 2) continue;
    const pid = Number((fields[0] as string).trim());
    if (!Number.isInteger(pid) || pid <= 0) continue;
    if (fields.length === 2) {
      processes.push({ pid, commandLine: (fields[1] as string).trim() });
      continue;
    }
    processes.push({
      pid,
      executablePath: (fields[1] as string).trim(),
      commandLine: fields.slice(2).join(SEPARATOR).trim(),
    });
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

export function executableOf(entry: IClaudeProcess): string | null {
  if (entry.executablePath) return entry.executablePath;
  const quoted = entry.commandLine.match(QUOTED_EXECUTABLE);
  if (quoted) return quoted[1] as string;
  const bare = entry.commandLine.match(BARE_EXECUTABLE);
  return bare ? (bare[1] as string) : null;
}

export function isDesktopExecutable(executable: string | null, exists: (file: string) => boolean = fs.existsSync): boolean {
  if (!executable) return false;
  return exists(path.win32.join(path.win32.dirname(executable), 'resources', 'app.asar'));
}

export function desktopOnly(
  processes: readonly IClaudeProcess[],
  exists: (file: string) => boolean = fs.existsSync
): IClaudeProcess[] {
  const known = new Map<string, boolean>();
  return processes.filter(entry => {
    const executable = executableOf(entry);
    const key = (executable ?? '').toLowerCase();
    if (!known.has(key)) known.set(key, isDesktopExecutable(executable, exists));
    return known.get(key) === true;
  });
}

export function listClaudeProcesses(platform: NodeJS.Platform = process.platform): IClaudeProcess[] {
  if (platform === 'win32') {
    const command = `Get-CimInstance Win32_Process -Filter "Name='claude.exe'" | ForEach-Object { "$($_.ProcessId)${SEPARATOR}$($_.ExecutablePath)${SEPARATOR}$($_.CommandLine)" }`;
    const output = tryCapture('powershell.exe', ['-NoProfile', '-Command', command]);
    return output === null ? [] : desktopOnly(parseProcessLines(output));
  }
  if (platform === 'darwin') {
    const output = tryCapture('ps', ['-ax', '-o', 'pid=,command=']);
    return output === null ? [] : parsePosixProcessLines(output).filter(entry => MACOS_BINARY.test(entry.commandLine));
  }
  return [];
}

export function killPids(pids: readonly number[], platform: NodeJS.Platform = process.platform): number {
  if (!pids.length) return 0;
  if (platform === 'win32') {
    const command = `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | Stop-Process -Force`;
    spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true });
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

export function pauseSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, ms));
}
