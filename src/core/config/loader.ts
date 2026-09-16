import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { configTemplatePath, defaultConfigPath, resolveFromConfig } from '../paths';
import { IConfigContext } from '../interfaces';
import { validateConfig } from './validate';

function ensureDefaultConfig(file: string): void {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(configTemplatePath, file);
}

export function loadConfig(configPath?: string): IConfigContext {
  const resolvedConfigPath = path.resolve(configPath || defaultConfigPath);
  if (!configPath) ensureDefaultConfig(resolvedConfigPath);
  const raw = fs.readFileSync(resolvedConfigPath);
  const config: unknown = JSON.parse(raw.toString('utf8'));
  validateConfig(config);
  return {
    config,
    configPath: resolvedConfigPath,
    configHash: crypto.createHash('sha256').update(raw).digest('hex'),
    logPath: resolveFromConfig(config.logFile, resolvedConfigPath),
  };
}

export function saveConfig(context: IConfigContext, config: unknown): IConfigContext {
  validateConfig(config);
  fs.writeFileSync(context.configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return loadConfig(context.configPath);
}
