import { spawnSync } from 'node:child_process';

const NEEDS_QUOTES = /[\s"]/;

export function consoleCommandLine(args: readonly string[]): string {
  return args.map(arg => (!arg || NEEDS_QUOTES.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg)).join(' ');
}

export function newConsoleLaunch(args: readonly string[]): { command: string; args: string[] } {
  const line = consoleCommandLine(args).replace(/'/g, "''");
  return { command: 'powershell.exe', args: ['-NoProfile', '-Command', `Start-Process conhost.exe -ArgumentList '${line}'`] };
}

export function openConsole(args: readonly string[]): void {
  const target = newConsoleLaunch(args);
  const result = spawnSync(target.command, target.args, { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'Could not open a new console window.').trim());
}
