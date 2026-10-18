"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consoleCommandLine = consoleCommandLine;
exports.newConsoleLaunch = newConsoleLaunch;
exports.openConsole = openConsole;
const node_child_process_1 = require("node:child_process");
const NEEDS_QUOTES = /[\s"]/;
function consoleCommandLine(args) {
    return args.map(arg => (!arg || NEEDS_QUOTES.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg)).join(' ');
}
function newConsoleLaunch(args) {
    const line = consoleCommandLine(args).replace(/'/g, "''");
    return { command: 'powershell.exe', args: ['-NoProfile', '-Command', `Start-Process conhost.exe -ArgumentList '${line}'`] };
}
function openConsole(args) {
    const target = newConsoleLaunch(args);
    const result = (0, node_child_process_1.spawnSync)(target.command, target.args, { encoding: 'utf8', windowsHide: true });
    if (result.error)
        throw result.error;
    if (result.status !== 0)
        throw new Error((result.stderr || result.stdout || 'Could not open a new console window.').trim());
}
