import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readJsonFile, writeJsonFile } from '../core/fs/json';
import { packageRoot } from '../core/paths';
import { tryCapture } from '../core/exec';
import { launch, launchArgs, locateApp } from './desktop-app';
import { IClaudeProcess, IDeeplinkDeps, IDeeplinkResult, IDeeplinkState, IHandlerResult } from './interfaces';
import { deeplinkStatePath, desktopConfigPath } from './paths';
import { listClaudeProcesses, samePath, userDataDirOf } from './processes';
import { hasAccountConfig } from './session-store';

export const PROTOCOL = 'claude';
export const HANDLER_KEY = 'HKCU\\Software\\Classes\\claude\\shell\\open\\command';
export const HANDLER_ROOT = 'HKCU\\Software\\Classes\\claude';
export const SHIM_SCRIPT = 'deeplink.vbs';
export const STATE_VERSION = 1;

const PROTOCOL_URL = /^claude:\/\//i;

export function emptyState(): IDeeplinkState {
  return { version: STATE_VERSION, alias: null, dir: null, at: null, handler: { command: null, fallbackCommand: null, created: false } };
}

export function normalizeState(value: Partial<IDeeplinkState> | null): IDeeplinkState {
  const base = emptyState();
  if (!value) return base;
  const handler = value.handler ?? base.handler;
  return {
    version: STATE_VERSION,
    alias: typeof value.alias === 'string' ? value.alias : null,
    dir: typeof value.dir === 'string' ? value.dir : null,
    at: typeof value.at === 'string' ? value.at : null,
    handler: {
      command: typeof handler.command === 'string' ? handler.command : null,
      fallbackCommand: typeof handler.fallbackCommand === 'string' ? handler.fallbackCommand : null,
      created: Boolean(handler.created),
    },
  };
}

export function readState(file: string = deeplinkStatePath()): IDeeplinkState {
  return normalizeState(readJsonFile<Partial<IDeeplinkState>>(file));
}

export function writeState(state: IDeeplinkState, file: string = deeplinkStatePath()): IDeeplinkState {
  const normalized = normalizeState(state);
  writeJsonFile(file, normalized);
  return normalized;
}

export function shimPath(): string {
  return path.join(packageRoot, 'scripts', 'windows', SHIM_SCRIPT);
}

export function cliPath(): string {
  return path.join(packageRoot, 'bin', 'claudedeck.js');
}

export function handlerCommand(shim: string = shimPath(), node: string = process.execPath, cli: string = cliPath()): string {
  return `wscript.exe "${shim}" "${node}" "${cli}" deeplink "%1"`;
}

export function isOurCommand(command: string | null): boolean {
  return Boolean(command && command.toLowerCase().includes(SHIM_SCRIPT.toLowerCase()));
}

export function isProtocolUrl(url: string): boolean {
  return PROTOCOL_URL.test(String(url ?? ''));
}

export function parseRegistryCommand(output: string | null): string | null {
  if (!output) return null;
  for (const line of output.split(/\r?\n/)) {
    const marker = line.indexOf('REG_SZ');
    if (marker === -1) continue;
    const value = line.slice(marker + 'REG_SZ'.length).trim();
    if (value) return value;
  }
  return null;
}

function powershellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function readRegistryCommand(): string | null {
  return parseRegistryCommand(tryCapture('reg.exe', ['query', HANDLER_KEY, '/ve']));
}

function runPowershell(command: string): void {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || `Could not update the ${PROTOCOL}:// handler.`).trim());
}

function writeRegistryCommand(command: string): void {
  const key = "HKCU:\\Software\\Classes\\claude\\shell\\open\\command";
  runPowershell(
    `New-Item -Path ${powershellLiteral(key)} -Force | Out-Null; ` +
      `Set-ItemProperty -LiteralPath ${powershellLiteral(key)} -Name '(Default)' -Value ${powershellLiteral(command)}`
  );
}

function restoreRegistryCommand(fallback: string | null, created: boolean): void {
  if (fallback) {
    writeRegistryCommand(fallback);
    return;
  }
  if (created) spawnSync('reg.exe', ['delete', HANDLER_ROOT, '/f'], { encoding: 'utf8' });
}

export function defaultDeeplinkDeps(): IDeeplinkDeps {
  return {
    platform: process.platform,
    readState: () => readState(),
    writeState: state => writeState(state),
    readCommand: readRegistryCommand,
    writeCommand: writeRegistryCommand,
    restoreCommand: restoreRegistryCommand,
    wantedCommand: () => handlerCommand(),
    listProcesses: listClaudeProcesses,
    signedOut: dir => !hasAccountConfig(desktopConfigPath(dir)),
    launch,
    locate: locateApp,
    now: () => new Date(),
  };
}

function withDeps(overrides: Partial<IDeeplinkDeps>): IDeeplinkDeps {
  return { ...defaultDeeplinkDeps(), ...overrides };
}

export function runningProfileDirs(processes: readonly IClaudeProcess[]): string[] {
  const dirs: string[] = [];
  for (const entry of processes) {
    const dir = userDataDirOf(entry.commandLine);
    if (dir && !dirs.some(known => samePath(known, dir))) dirs.push(dir);
  }
  return dirs;
}

export function pendingProfile(
  state: IDeeplinkState,
  dirs: readonly string[],
  signedOut: (dir: string) => boolean
): string | null {
  const waiting = dirs.filter(dir => signedOut(dir));
  if (!waiting.length) return null;
  return waiting.find(dir => samePath(dir, state.dir)) ?? (waiting[0] as string);
}

export function rememberOpen(alias: string, dir: string, overrides: Partial<IDeeplinkDeps> = {}): IDeeplinkState {
  const deps = withDeps(overrides);
  const state = deps.readState();
  return deps.writeState({ ...state, alias, dir, at: deps.now().toISOString() });
}

export function forward(url: string, overrides: Partial<IDeeplinkDeps> = {}): IDeeplinkResult {
  const deps = withDeps(overrides);
  if (!isProtocolUrl(url)) throw new Error(`"${url}" is not a ${PROTOCOL}:// link.`);
  const state = deps.readState();
  const target = pendingProfile(state, runningProfileDirs(deps.listProcesses()), deps.signedOut);
  const args = target ? [...launchArgs(target, false), url] : [url];
  const pid = deps.launch(deps.locate(), args);
  return {
    url,
    alias: target && samePath(target, state.dir) ? state.alias : null,
    dir: target,
    pid,
    routed: Boolean(target),
  };
}

export function handlerStatus(overrides: Partial<IDeeplinkDeps> = {}): IHandlerResult {
  const deps = withDeps(overrides);
  if (deps.platform !== 'win32') {
    return { supported: false, installed: false, changed: false, command: null, fallbackCommand: null };
  }
  const current = deps.readCommand();
  return {
    supported: true,
    installed: isOurCommand(current),
    changed: false,
    command: current,
    fallbackCommand: deps.readState().handler.fallbackCommand,
  };
}

export function installHandler(overrides: Partial<IDeeplinkDeps> = {}): IHandlerResult {
  const deps = withDeps(overrides);
  if (deps.platform !== 'win32') {
    return { supported: false, installed: false, changed: false, command: null, fallbackCommand: null };
  }
  const current = deps.readCommand();
  const wanted = deps.wantedCommand();
  if (current === wanted) {
    return { supported: true, installed: true, changed: false, command: wanted, fallbackCommand: deps.readState().handler.fallbackCommand };
  }
  const state = deps.readState();
  const fallbackCommand = isOurCommand(current) ? state.handler.fallbackCommand : current;
  const created = current === null ? true : state.handler.created && isOurCommand(current);
  deps.writeState({ ...state, handler: { command: wanted, fallbackCommand, created } });
  deps.writeCommand(wanted);
  return { supported: true, installed: true, changed: true, command: wanted, fallbackCommand };
}

export function removeHandler(overrides: Partial<IDeeplinkDeps> = {}): IHandlerResult {
  const deps = withDeps(overrides);
  if (deps.platform !== 'win32') {
    return { supported: false, installed: false, changed: false, command: null, fallbackCommand: null };
  }
  const state = deps.readState();
  const current = deps.readCommand();
  if (!isOurCommand(current)) {
    return { supported: true, installed: false, changed: false, command: current, fallbackCommand: state.handler.fallbackCommand };
  }
  deps.restoreCommand(state.handler.fallbackCommand, state.handler.created);
  deps.writeState({ ...state, handler: { command: null, fallbackCommand: null, created: false } });
  return { supported: true, installed: false, changed: true, command: state.handler.fallbackCommand, fallbackCommand: null };
}

export function ensureHandler(overrides: Partial<IDeeplinkDeps> = {}): IHandlerResult {
  try {
    return installHandler(overrides);
  } catch {
    return { supported: true, installed: false, changed: false, command: null, fallbackCommand: null };
  }
}
