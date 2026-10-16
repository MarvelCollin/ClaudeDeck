import path from 'node:path';
import { spawnDetached } from '../core/exec';
import { errorMessage, readJsonFile, writeJsonFile } from '../core/fs/json';
import { userDataDir } from '../core/paths';
import { DesktopJobAction, IDesktopJob, IDesktopJobDeps, ISwitcher } from './interfaces';
import { pauseSync } from './processes';

export const JOB_FILE = 'desktop-job.json';
export const JOB_DELAY_MS = 2000;
export const JOB_ACTIONS: readonly DesktopJobAction[] = ['switch', 'save'];

export function defaultJobDeps(): IDesktopJobDeps {
  return {
    file: path.join(userDataDir(), JOB_FILE),
    node: process.execPath,
    bin: path.resolve(__dirname, '..', '..', 'bin', 'claudedeck.js'),
    delayMs: JOB_DELAY_MS,
    spawn: spawnDetached,
    pause: pauseSync,
    now: () => new Date(),
  };
}

export function isJobAction(value: unknown): value is DesktopJobAction {
  return typeof value === 'string' && (JOB_ACTIONS as readonly string[]).includes(value);
}

export function readDesktopJob(overrides: Partial<IDesktopJobDeps> = {}): IDesktopJob | null {
  const { file } = { ...defaultJobDeps(), ...overrides };
  return readJsonFile<IDesktopJob>(file);
}

export function startDesktopJob(
  action: DesktopJobAction,
  alias: string | null,
  overrides: Partial<IDesktopJobDeps> = {}
): IDesktopJob {
  const deps = { ...defaultJobDeps(), ...overrides };
  const job: IDesktopJob = { action, alias, startedAt: deps.now().toISOString(), finishedAt: null, ok: null, error: null };
  writeJsonFile(deps.file, job);
  deps.spawn(deps.node, [deps.bin, 'desktop', action, ...(alias ? [alias] : [])]);
  return job;
}

export function runDesktopJob(
  action: DesktopJobAction,
  alias: string | null,
  switcher: ISwitcher,
  overrides: Partial<IDesktopJobDeps> = {}
): IDesktopJob {
  const deps = { ...defaultJobDeps(), ...overrides };
  const started = readJsonFile<IDesktopJob>(deps.file);
  const base: IDesktopJob = {
    action,
    alias,
    startedAt: started?.action === action ? started.startedAt : deps.now().toISOString(),
    finishedAt: null,
    ok: null,
    error: null,
  };
  deps.pause(deps.delayMs);
  let job: IDesktopJob;
  try {
    if (action === 'switch') {
      if (!alias) throw new Error('Which account should Claude Desktop use?');
      job = { ...base, alias: switcher.switchTo(alias).alias, ok: true };
    } else {
      job = { ...base, alias: switcher.sync().alias, ok: true };
    }
  } catch (error) {
    job = { ...base, ok: false, error: errorMessage(error) };
  }
  job.finishedAt = deps.now().toISOString();
  writeJsonFile(deps.file, job);
  return job;
}
