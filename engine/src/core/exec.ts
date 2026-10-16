import { spawn, spawnSync, SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import { packageRoot } from './paths';

export function runCapture(
  command: string,
  args: string[],
  options: Partial<SpawnSyncOptionsWithStringEncoding> = {}
): string {
  const result = spawnSync(command, args, { cwd: packageRoot, encoding: 'utf8', shell: false, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || `${command} failed with exit code ${result.status}`).trim();
    throw new Error(message);
  }
  return result.stdout || '';
}

export function runInherited(command: string, args: string[]): void {
  const result = spawnSync(command, args, { cwd: packageRoot, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}.`);
}

export function tryCapture(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return result.stdout ?? '';
}

export function succeeds(command: string, args: string[]): boolean {
  return spawnSync(command, args, { encoding: 'utf8' }).status === 0;
}

export function spawnDetached(command: string, args: string[]): number | undefined {
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return child.pid;
}
