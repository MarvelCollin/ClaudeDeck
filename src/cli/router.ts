import { IRoute } from './interfaces';

export const ACCOUNT_COMMANDS = ['list', 'save', 'sync', 'switch', 'forget', 'share'];
export const WEB_COMMANDS = ['web', 'profiles'];
export const HELP_COMMANDS = ['help', '--help', '-h'];

export function routeCommand(argv: string[] = []): IRoute {
  const [command, ...rest] = argv;
  if (!command) return { kind: 'panel', args: [] };
  if (HELP_COMMANDS.includes(command)) return { kind: 'help', args: [] };
  if (WEB_COMMANDS.includes(command)) return { kind: 'web', args: rest };
  if (ACCOUNT_COMMANDS.includes(command)) return { kind: 'web', args: [command, ...rest] };
  if (command === 'menu') return { kind: 'menu', args: [] };
  return { kind: 'task', args: [command, ...rest] };
}
