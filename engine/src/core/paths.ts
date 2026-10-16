import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { errorMessage } from './fs/json';

export const packageRoot = path.resolve(__dirname, '..', '..');
export const configTemplatePath = path.join(packageRoot, 'claudedeck.config.json');

function roamingBase(env: NodeJS.ProcessEnv): string {
  return env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
}

export const HOME_ENV = 'CLAUDEDECK_HOME';
export const HOME_FOLDER = '.claudedeck';

export function deckHome(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env[HOME_ENV];
  if (value) return path.resolve(value);
  if (value === '') return null;
  const folder = path.join(env.USERPROFILE || env.HOME || os.homedir(), HOME_FOLDER);
  return fs.existsSync(folder) ? folder : null;
}

export function userDataDir(platform: NodeJS.Platform = process.platform, env = process.env): string {
  const home = deckHome(env);
  if (home) return home;
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

export function runnerScriptPath(): string {
  return path.join(__dirname, '..', 'bin', `run-claude${path.extname(__filename)}`);
}

export function resolveFromConfig(value: string, configPath: string): string {
  return path.isAbsolute(value) ? value : path.join(path.dirname(configPath), value);
}
