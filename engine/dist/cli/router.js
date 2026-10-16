"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HELP_COMMANDS = exports.WEB_COMMANDS = exports.ACCOUNT_COMMANDS = void 0;
exports.routeCommand = routeCommand;
exports.ACCOUNT_COMMANDS = ['list', 'usage', 'import', 'api', 'auto', 'next', 'hold', 'release', 'save', 'sync', 'switch', 'forget', 'share', 'open', 'close', 'deeplink'];
exports.WEB_COMMANDS = ['web', 'profiles'];
exports.HELP_COMMANDS = ['help', '--help', '-h'];
function routeCommand(argv = []) {
    const [command, ...rest] = argv;
    if (!command)
        return { kind: 'help', args: [] };
    if (exports.HELP_COMMANDS.includes(command))
        return { kind: 'help', args: [] };
    if (exports.WEB_COMMANDS.includes(command))
        return { kind: 'web', args: rest };
    if (exports.ACCOUNT_COMMANDS.includes(command))
        return { kind: 'web', args: [command, ...rest] };
    return { kind: 'task', args: [command, ...rest] };
}
