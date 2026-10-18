"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handoffScriptPath = handoffScriptPath;
exports.handoffFolders = handoffFolders;
exports.handoffLaunch = handoffLaunch;
exports.startHandoff = startHandoff;
const node_path_1 = __importDefault(require("node:path"));
const console_1 = require("../core/console");
const exec_1 = require("../core/exec");
const paths_1 = require("../core/paths");
const paths_2 = require("./paths");
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DESKTOP_FOLDER = 'Claude';
function handoffScriptPath() {
    return node_path_1.default.join(paths_1.packageRoot, '..', 'scripts', 'handoff.ps1');
}
function handoffFolders(cwd, platform = process.platform, env = process.env) {
    const folders = [cwd];
    const desktopRoot = node_path_1.default.join((0, paths_2.roamingDir)(platform, env), DESKTOP_FOLDER);
    const packaged = (0, paths_2.packagedProfileDirs)(platform, env)[0];
    const inside = node_path_1.default.relative(desktopRoot, cwd);
    if (packaged && inside && !inside.startsWith('..') && !node_path_1.default.isAbsolute(inside))
        folders.push(node_path_1.default.join(packaged, inside));
    return folders;
}
function quoted(value) {
    return `'"${value.replace(/'/g, "''").replace(/"/g, '')}"'`;
}
function handoffLaunch(sessionId, folders, name, platform = process.platform, script = handoffScriptPath()) {
    if (platform === 'win32') {
        const args = ['powershell.exe', '-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-SessionId', sessionId, '-Name', name];
        if (folders[0])
            args.push('-Folder', folders[0]);
        if (folders[1])
            args.push('-AltFolder', folders[1]);
        return (0, console_1.newConsoleLaunch)(args);
    }
    if (platform === 'darwin') {
        const folder = (folders[0] ?? '').replace(/'/g, "'\\''");
        const shell = `cd '${folder}' && claude --resume ${sessionId} --fork-session`;
        return { command: 'osascript', args: ['-e', `tell application "Terminal" to do script ${JSON.stringify(shell)}`, '-e', 'tell application "Terminal" to activate'] };
    }
    throw new Error(`Continuing a session in a terminal is not supported on ${platform}.`);
}
function startHandoff(switcher, alias, sessionId, cwd, run = (command, args) => (0, exec_1.runCapture)(command, args, { windowsHide: true })) {
    if (!SESSION_ID.test(sessionId))
        throw new Error('This session has no id ClaudeDeck can continue.');
    const listed = switcher.listSessions().sessions.find(entry => entry.alias.toLowerCase() === alias.toLowerCase());
    if (!listed)
        throw new Error(`No saved session for "${alias}".`);
    const code = switcher.currentCodeIdentity();
    const movedCode = !code || code.email.toLowerCase() !== listed.email.toLowerCase();
    if (movedCode)
        switcher.switchCode(listed.alias);
    const folders = handoffFolders(cwd);
    const target = handoffLaunch(sessionId, folders, listed.name);
    run(target.command, target.args);
    return { alias: listed.alias, name: listed.name, sessionId, folders, movedCode };
}
