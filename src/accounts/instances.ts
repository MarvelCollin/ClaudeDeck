import fs from 'node:fs';
import path from 'node:path';
import { rememberOpen, startGuard } from './deeplink';
import { launch, launchArgs, locateApp } from './desktop-app';
import { IAccountInstance, IInstanceDeps, IOpenOptions, IOpenResult, IProfileLocation, ISavedSession } from './interfaces';
import { assertValidAlias, desktopConfigPath, desktopProfileDir, profilePath, sessionSlot } from './paths';
import { groupProcesses, killPids, listClaudeProcesses } from './processes';
import { CONFIG_FILE, hasAccountConfig, restoreConfig, restoreDesktop } from './session-store';
import { readSamples, toUsage, latestSample } from './usage';

export const DESKTOP_SUBDIR = 'desktop';

function defaultDeps(): IInstanceDeps {
  return {
    slotOf: alias => sessionSlot(alias),
    dirOf: alias => profilePath(alias),
    listProcesses: listClaudeProcesses,
    kill: killPids,
    launch,
    locate: locateApp,
    defaultDir: desktopProfileDir(),
    remember: (alias, dir) => rememberOpen(alias, dir),
    routeLogins: () => startGuard(),
  };
}

export function isSeeded(dir: string): boolean {
  try {
    return fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

export function createInstances(overrides: Partial<IInstanceDeps> = {}) {
  const deps: IInstanceDeps = { ...defaultDeps(), ...overrides };

  function locationsFor(sessions: readonly ISavedSession[]): IProfileLocation[] {
    return sessions.map(entry => ({ alias: entry.alias, dir: deps.dirOf(entry.alias) }));
  }

  function running(sessions: readonly ISavedSession[]): Map<string, number[]> {
    return groupProcesses(deps.listProcesses(), locationsFor(sessions), deps.defaultDir);
  }

  function usageOf(dir: string): IAccountInstance['usage'] {
    return isSeeded(dir) ? toUsage(latestSample(readSamples(dir))) : null;
  }

  function signedIn(dir: string): boolean {
    return hasAccountConfig(desktopConfigPath(dir));
  }

  function describe(sessions: readonly ISavedSession[]): IAccountInstance[] {
    const groups = running(sessions);
    return sessions.map(entry => {
      const dir = deps.dirOf(entry.alias);
      const pids = groups.get(entry.alias) ?? [];
      return {
        alias: entry.alias,
        dir,
        seeded: isSeeded(dir),
        signedIn: signedIn(dir),
        running: pids.length > 0,
        pids,
        usage: usageOf(dir),
      };
    });
  }

  function seed(alias: string, dir: string): string | null {
    const slot = deps.slotOf(alias);
    const desktopSlot = path.join(slot, DESKTOP_SUBDIR);
    if (isSeeded(dir) && signedIn(dir)) return null;
    const items = isSeeded(desktopSlot) && !isSeeded(dir) ? restoreDesktop(desktopSlot, dir) : [];
    const config = restoreConfig(path.join(slot, CONFIG_FILE), desktopConfigPath(dir));
    return items.length || config ? slot : null;
  }

  function open(alias: string, sessions: readonly ISavedSession[], options: IOpenOptions = {}): IOpenResult {
    assertValidAlias(alias);
    const dir = deps.dirOf(alias);
    const pids = running(sessions).get(alias) ?? [];
    if (pids.length && !options.fresh) {
      return {
        alias,
        dir,
        pid: pids[0],
        seededFrom: null,
        wiped: false,
        signedIn: signedIn(dir),
        loginRouted: false,
        alreadyRunning: true,
      };
    }
    if (options.fresh) {
      deps.kill(pids);
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    }
    const seededFrom = options.fresh ? null : seed(alias, dir);
    fs.mkdirSync(dir, { recursive: true });
    deps.remember(alias, dir);
    const loginRouted = signedIn(dir) ? false : deps.routeLogins();
    const pid = deps.launch(deps.locate(), launchArgs(dir, false));
    return { alias, dir, pid, seededFrom, wiped: Boolean(options.fresh), signedIn: signedIn(dir), loginRouted, alreadyRunning: false };
  }

  function stop(alias: string, sessions: readonly ISavedSession[]): { alias: string; stopped: number } {
    const pids = running(sessions).get(alias) ?? [];
    deps.kill(pids);
    return { alias, stopped: pids.length };
  }

  return { describe, open, stop, isSeeded };
}
