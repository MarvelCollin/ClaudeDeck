"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.windowsCandidates = windowsCandidates;
exports.darwinCandidates = darwinCandidates;
exports.locateApp = locateApp;
exports.launchArgs = launchArgs;
exports.launch = launch;
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const exec_1 = require("../core/exec");
function windowsCandidates(env = process.env) {
    const local = env.LOCALAPPDATA || node_path_1.default.join(node_os_1.default.homedir(), 'AppData', 'Local');
    const programFiles = env.ProgramFiles || 'C:\\Program Files';
    return [
        node_path_1.default.join(local, 'AnthropicClaude', 'Claude.exe'),
        node_path_1.default.join(local, 'Programs', 'Claude', 'Claude.exe'),
        node_path_1.default.join(programFiles, 'Claude', 'Claude.exe'),
    ];
}
function darwinCandidates() {
    return [
        '/Applications/Claude.app/Contents/MacOS/Claude',
        node_path_1.default.join(node_os_1.default.homedir(), 'Applications', 'Claude.app', 'Contents', 'MacOS', 'Claude'),
    ];
}
function packagedWindowsPath() {
    const output = (0, exec_1.tryCapture)('powershell.exe', [
        '-NoProfile',
        '-Command',
        '(Get-AppxPackage -Name Claude | Select-Object -First 1).InstallLocation',
    ]);
    const location = (output ?? '').trim();
    if (!location)
        return null;
    const exe = node_path_1.default.join(location, 'app', 'Claude.exe');
    return node_fs_1.default.existsSync(exe) ? exe : null;
}
function locateApp(platform = process.platform, env = process.env) {
    if (platform === 'win32') {
        const packaged = packagedWindowsPath();
        if (packaged)
            return packaged;
        const found = windowsCandidates(env).find(candidate => node_fs_1.default.existsSync(candidate));
        if (found)
            return found;
        throw new Error('Claude Desktop not found. Checked the Claude appx package and the standard install paths.');
    }
    if (platform === 'darwin') {
        const found = darwinCandidates().find(candidate => node_fs_1.default.existsSync(candidate));
        if (found)
            return found;
        throw new Error('Claude Desktop not found at /Applications/Claude.app.');
    }
    throw new Error(`Launching Claude Desktop is not supported on ${platform}.`);
}
function launchArgs(profileDir, isDefault = false) {
    return isDefault ? [] : [`--user-data-dir=${profileDir}`];
}
function launch(exe, args) {
    return (0, exec_1.spawnDetached)(exe, args);
}
