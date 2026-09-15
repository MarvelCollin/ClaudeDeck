const ACCOUNT_COMMANDS = ['list', 'save', 'sync', 'switch', 'forget', 'share'];
const WEB_COMMANDS = ['web', 'profiles'];
const HELP_COMMANDS = ['help', '--help', '-h'];

function routeCommand(argv = []) {
  const [command, ...rest] = argv;
  if (!command) return { kind: 'panel', args: [] };
  if (HELP_COMMANDS.includes(command)) return { kind: 'help', args: [] };
  if (WEB_COMMANDS.includes(command)) return { kind: 'web', args: rest };
  if (ACCOUNT_COMMANDS.includes(command)) return { kind: 'web', args: [command, ...rest] };
  if (command === 'menu') return { kind: 'menu', args: [] };
  return { kind: 'task', args: [command, ...rest] };
}

module.exports = {
  ACCOUNT_COMMANDS,
  HELP_COMMANDS,
  WEB_COMMANDS,
  routeCommand,
};
