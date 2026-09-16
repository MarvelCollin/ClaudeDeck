import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { errorMessage } from './fs/json';

export const packageRoot = path.resolve(__dirname, '..', '..');
export const configTemplatePath = path.join(packageRoot, 'claudedeck.config.json');

function roamingBase(env: NodeJS.ProcessEnv): string {
  return env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
}

export function userDataDir(platform: NodeJS.Platform = process.platform, env = process.env): string {
  if (platform === 'win32') return path.join(roamingBase(env), 'ClaudeDeck');
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'ClaudeDeck');
  return path.join(os.homedir(), '.config', 'claudedeck');
}

export function legacyUserDataDir(platform: NodeJS.Platform = process.platform, env = process.env): string {
  if (platform === 'win32') return path.join(roamingBase(env), 'ClaudeCron');
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'ClaudeCron');
  return path.join(os.homedir(), '.config', 'claudecron');
}

export function migrateLegacyData(platform: NodeJS.Platform = process.platform, env = process.env): string {
  const current = userDataDir(platform, env);
  const legacy = legacyUserDataDir(platform, env);
  if (current === legacy || fs.existsSync(current) || !fs.existsSync(legacy)) return current;
  fs.renameSync(legacy, current);
  const legacyConfig = path.join(current, 'claudecron.config.json');
  const currentConfig = path.join(current, 'claudedeck.config.json');
  if (fs.existsSync(legacyConfig) && !fs.existsSync(currentConfig)) fs.renameSync(legacyConfig, currentConfig);
  return current;
}

try {
  migrateLegacyData();
} catch (error) {
  console.error(`Could not move your ClaudeCron data to the ClaudeDeck folder: ${errorMessage(error)}`);
}

export const defaultConfigPath = path.join(userDataDir(), 'claudedeck.config.json');

export function fromPackageRoot(...parts: string[]): string {
  return path.join(packageRoot, ...parts);
}

export function resolveFromConfig(value: string, configPath: string): string {
  return path.isAbsolute(value) ? value : path.join(path.dirname(configPath), value);
}
