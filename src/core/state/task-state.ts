import os from 'node:os';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from '../fs/json';
import { userDataDir } from '../paths';

export interface TaskState {
  configHash?: string;
}

export function statePath(platform: NodeJS.Platform = process.platform, env = process.env): string {
  if (platform === 'linux') return path.join(os.homedir(), '.claudedeck-state.json');
  return path.join(userDataDir(platform, env), 'state.json');
}

export function readState(file = statePath()): TaskState {
  return readJsonFile<TaskState>(file) ?? {};
}

export function writeState(configHash: string, file = statePath()): void {
  writeJsonFile(file, { configHash });
}
