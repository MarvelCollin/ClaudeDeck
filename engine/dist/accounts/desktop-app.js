"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.windowsCandidates = windowsCandidates;
exports.darwinCandidates = darwinCandidates;
exports.locateApp = locateApp;
exports.packagedAppId = packagedAppId;
exports.launchTarget = launchTarget;
exports.storeAliasPath = storeAliasPath;
exports.profileLaunchTarget = profileLaunchTarget;
exports.launch = launch;
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const exec_1 = require("../core/exec");
const PACKAGE_ROOT = 'windowsapps';
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
function readText(file) {
    return node_fs_1.default.readFileSync(file, 'utf8');
}
function packagedAppId(exe, readFile = readText) {
    const parts = exe.split(/[\\/]+/);
    const at = parts.findIndex(part => part.toLowerCase() === PACKAGE_ROOT);
    const folder = at >= 0 ? parts[at + 1] : undefined;
    if (!folder)
        return null;
    const pieces = folder.split('_');
    if (pieces.length < 5)
        return null;
    const family = `${pieces[0]}_${pieces[pieces.length - 1]}`;
    const root = parts.slice(0, at + 2).join(node_path_1.default.win32.sep);
    const relative = parts.slice(at + 2).join(node_path_1.default.win32.sep).toLowerCase();
    let manifest;
    try {
        manifest = readFile(node_path_1.default.win32.join(root, 'AppxManifest.xml'));
    }
    catch {
        return null;
    }
    for (const tag of manifest.match(/<Application\b[^>]*>/g) ?? []) {
        const id = tag.match(/\bId="([^"]+)"/)?.[1];
        const executable = tag.match(/\bExecutable="([^"]+)"/)?.[1];
        if (id && executable && executable.split(/[\\/]+/).join(node_path_1.default.win32.sep).toLowerCase() === relative) {
            return `${family}!${id}`;
        }
    }
    return null;
}
function launchTarget(exe, readFile) {
    const appId = packagedAppId(exe, readFile);
    if (appId)
        return { command: 'explorer.exe', args: [`shell:AppsFolder${node_path_1.default.win32.sep}${appId}`] };
    return { command: exe, args: [] };
}
function storeAliasPath(env = process.env) {
    return node_path_1.default.join(env.LOCALAPPDATA || node_path_1.default.join(node_os_1.default.homedir(), 'AppData', 'Local'), 'Microsoft', 'WindowsApps', 'claude-desktop.exe');
}
function profileLaunchTarget(exe, platform = process.platform, exists = node_fs_1.default.existsSync, env = process.env) {
    if (platform === 'darwin') {
        const app = exe.replace(/\/Contents\/MacOS\/Claude$/, '');
        return { command: 'open', args: ['-n', '-a', app, '--args'] };
    }
    if (platform === 'win32' && exe.split(/[\\/]+/).some(part => part.toLowerCase() === PACKAGE_ROOT)) {
        const alias = storeAliasPath(env);
        if (exists(alias))
            return { command: alias, args: [] };
    }
    return { command: exe, args: [] };
}
function launch(exe, args) {
    return (0, exec_1.spawnDetached)(exe, args);
}
