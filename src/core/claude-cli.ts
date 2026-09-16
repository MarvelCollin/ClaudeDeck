import { spawnSync } from 'node:child_process';
import { Invocation } from './exec';
import { ClaudeModel } from './types';

const POWERSHELL_FLAGS = ['-NoProfile', '-ExecutionPolicy', 'Bypass'];

function windowsClaudeScript(): string {
  const result = spawnSync(
    'powershell.exe',
    [...POWERSHELL_FLAGS, '-Command', '(Get-Command claude -ErrorAction Stop).Source'],
    { encoding: 'utf8' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'claude command was not found.').trim());
  return result.stdout.trim();
}

export function claudeCommand(
  prompt: string,
  model: ClaudeModel,
  platform: NodeJS.Platform = process.platform
): Invocation {
  if (platform !== 'win32') return { command: 'claude', args: ['-p', prompt, '--model', model] };
  return {
    command: 'powershell.exe',
    args: [...POWERSHELL_FLAGS, '-File', windowsClaudeScript(), '-p', prompt, '--model', model],
  };
}
