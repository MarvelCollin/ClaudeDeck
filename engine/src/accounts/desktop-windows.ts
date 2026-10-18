import path from 'node:path';
import { launch, launchTarget, locateApp, profileLaunchTarget } from './desktop-app';
import { readDesktopAccountUuid } from './identity';
import {
  IClaudeProcess,
  IDesktopWindow,
  IDesktopWindowsDeps,
  IRegistry,
  ISavedSession,
  IWindowOpenResult,
} from './interfaces';
import { assertValidAlias, desktopConfigPath, desktopProfileDir, desktopProfilesRoot, sessionSlot } from './paths';
import { listClaudeProcesses, pauseSync } from './processes';
import * as registry from './registry';
import * as session from './session-store';

export const REVEAL_TIMEOUT_MS = 20_000;
export const REVEAL_POLL_MS = 500;
export const REVEAL_SETTLE_MS = 4_000;

const CHILD_PROCESS_ARG = /\s--type=/;
const USER_DATA_ARG = /"--user-data-dir=([^"]+)"|--user-data-dir=(?:"([^"]+)"|(\S+))/;

export function userDataDirOf(commandLine: string): string | null {
  const match = commandLine.match(USER_DATA_ARG);
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

export function isMainProcess(entry: IClaudeProcess): boolean {
  return !CHILD_PROCESS_ARG.test(` ${entry.commandLine}`);
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function sameAlias(left: string | null, right: string): boolean {
  return Boolean(left) && (left as string).toLowerCase() === right.toLowerCase();
}

export function aliasOfProfile(profileDir: string, data: IRegistry, profilesRoot: string): string | null {
  const known = registry.sessionByUuid(data, readDesktopAccountUuid(profileDir));
  if (known) return known.alias;
  if (!samePath(path.dirname(profileDir), profilesRoot)) return null;
  return registry.findSession(data, path.basename(profileDir))?.alias ?? null;
}

export function defaultWindowDeps(): IDesktopWindowsDeps {
  return {
    defaultProfileDir: desktopProfileDir(),
    profilesRoot: desktopProfilesRoot(),
    registryFile: undefined,
    slotOf: alias => sessionSlot(alias),
    listProcesses: listClaudeProcesses,
    launch,
    launchDefault: () => {
      const target = launchTarget(locateApp());
      launch(target.command, target.args);
    },
    profileLauncher: () => profileLaunchTarget(locateApp()),
    pause: pauseSync,
    now: () => new Date(),
  };
}

export function createDesktopWindows(overrides: Partial<IDesktopWindowsDeps> = {}) {
  const deps: IDesktopWindowsDeps = { ...defaultWindowDeps(), ...overrides };
  const readRegistry = (): IRegistry => registry.read(deps.registryFile);

  function profileDirOf(alias: string): string {
    return path.join(deps.profilesRoot, assertValidAlias(alias));
  }

  function hasLogin(profileDir: string): boolean {
    return session.hasAccountConfig(desktopConfigPath(profileDir));
  }

  function defaultAlias(data: IRegistry = readRegistry()): string | null {
    return aliasOfProfile(deps.defaultProfileDir, data, deps.profilesRoot);
  }

  function list(data: IRegistry = readRegistry()): IDesktopWindow[] {
    return deps
      .listProcesses()
      .filter(isMainProcess)
      .map(entry => {
        const dir = userDataDirOf(entry.commandLine);
        const isDefault = !dir || samePath(dir, deps.defaultProfileDir);
        const profileDir = isDefault ? deps.defaultProfileDir : (dir as string);
        return { pid: entry.pid, profileDir, isDefault, alias: aliasOfProfile(profileDir, data, deps.profilesRoot) };
      });
  }

  function slotHasDesktop(alias: string): boolean {
    return session.hasAccountConfig(path.join(deps.slotOf(alias), session.CONFIG_FILE));
  }

  function ready(alias: string, data: IRegistry = readRegistry()): boolean {
    return sameAlias(defaultAlias(data), alias) || hasLogin(profileDirOf(alias)) || slotHasDesktop(alias);
  }

  function prepare(target: ISavedSession): boolean {
    const profileDir = profileDirOf(target.alias);
    if (hasLogin(profileDir)) return false;
    const slot = deps.slotOf(target.alias);
    const items = session.restoreDesktop(path.join(slot, session.SLOT_DESKTOP_DIR), profileDir);
    if (!items.length || !session.restoreConfig(path.join(slot, session.CONFIG_FILE), desktopConfigPath(profileDir))) {
      throw new Error(
        `${target.name} has no saved Claude Desktop login yet. Press Add Desktop account, sign in with it, then press Save Desktop login.`
      );
    }
    session.writeWindowMarker(slot, { profileDir, movedAt: deps.now().toISOString() });
    return true;
  }

  function launchProfile(profileDir: string): void {
    const target = deps.profileLauncher();
    deps.launch(target.command, [...target.args, `--user-data-dir=${profileDir}`]);
  }

  function reveal(profileDir: string): void {
    let waited = 0;
    while (!list().some(entry => samePath(entry.profileDir, profileDir))) {
      if (waited >= REVEAL_TIMEOUT_MS) return;
      deps.pause(REVEAL_POLL_MS);
      waited += REVEAL_POLL_MS;
    }
    deps.pause(REVEAL_SETTLE_MS);
    launchProfile(profileDir);
  }

  function open(alias: string): IWindowOpenResult {
    const data = readRegistry();
    const target = registry.findSession(data, alias);
    if (!target) throw new Error(`No saved session for "${alias}".`);
    const running = list(data).find(entry => sameAlias(entry.alias, target.alias)) ?? null;
    const base = { alias: target.alias, name: target.name };

    if (running?.isDefault || (!running && sameAlias(defaultAlias(data), target.alias))) {
      deps.launchDefault();
      return { ...base, profileDir: deps.defaultProfileDir, isDefault: true, action: running ? 'focused' : 'opened' };
    }

    const profileDir = running?.profileDir ?? profileDirOf(target.alias);
    const prepared = running ? false : prepare(target);
    launchProfile(profileDir);
    if (!running) reveal(profileDir);
    return { ...base, profileDir, isDefault: false, action: running ? 'focused' : prepared ? 'prepared' : 'opened' };
  }

  return { defaultAlias, list, open, profileDirOf, ready };
}
