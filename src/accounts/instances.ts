import fs from 'node:fs';
import path from 'node:path';
import { launch, launchArgs, locateApp } from './desktop-app';
import { IAccountInstance, IInstanceDeps, IOpenResult, IProfileLocation, ISavedSession } from './interfaces';
import { assertValidAlias, desktopProfileDir, profilePath, sessionSlot } from './paths';
import { groupProcesses, killPids, listClaudeProcesses } from './processes';
import { restoreDesktop } from './session-store';
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

  function describe(sessions: readonly ISavedSession[]): IAccountInstance[] {
    const groups = running(sessions);
    return sessions.map(entry => {
      const dir = deps.dirOf(entry.alias);
      const pids = groups.get(entry.alias) ?? [];
      return {
        alias: entry.alias,
        dir,
        seeded: isSeeded(dir),
        running: pids.length > 0,
        pids,
        usage: usageOf(dir),
      };
    });
  }

  function seed(alias: string, dir: string): string | null {
    const slot = path.join(deps.slotOf(alias), DESKTOP_SUBDIR);
    if (isSeeded(dir) || !isSeeded(slot)) return null;
    fs.mkdirSync(dir, { recursive: true });
    restoreDesktop(slot, dir);
    return slot;
  }

  function open(alias: string, sessions: readonly ISavedSession[]): IOpenResult {
    assertValidAlias(alias);
    const dir = deps.dirOf(alias);
    const pids = running(sessions).get(alias) ?? [];
    if (pids.length) return { alias, dir, pid: pids[0], seededFrom: null, alreadyRunning: true };
    const seededFrom = seed(alias, dir);
    fs.mkdirSync(dir, { recursive: true });
    const pid = deps.launch(deps.locate(), launchArgs(dir, false));
    return { alias, dir, pid, seededFrom, alreadyRunning: false };
  }

  function stop(alias: string, sessions: readonly ISavedSession[]): { alias: string; stopped: number } {
    const pids = running(sessions).get(alias) ?? [];
    deps.kill(pids);
    return { alias, stopped: pids.length };
  }

  return { describe, open, stop, isSeeded };
}
