"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOG_FILE = exports.GUARD_INTERVAL_MS = exports.GUARD_SECONDS = exports.STATE_VERSION = exports.SHIM_SCRIPT = exports.HANDLER_ROOT = exports.HANDLER_KEY = exports.PROTOCOL = void 0;
exports.emptyState = emptyState;
exports.normalizeState = normalizeState;
exports.readState = readState;
exports.writeState = writeState;
exports.shimPath = shimPath;
exports.cliPath = cliPath;
exports.handlerCommand = handlerCommand;
exports.isOurCommand = isOurCommand;
exports.isProtocolUrl = isProtocolUrl;
exports.parseRegistryCommand = parseRegistryCommand;
exports.defaultDeeplinkDeps = defaultDeeplinkDeps;
exports.runningProfileDirs = runningProfileDirs;
exports.pendingProfile = pendingProfile;
exports.rememberOpen = rememberOpen;
exports.forward = forward;
exports.handlerStatus = handlerStatus;
exports.installHandler = installHandler;
exports.removeHandler = removeHandler;
exports.ensureHandler = ensureHandler;
exports.logPath = logPath;
exports.log = log;
exports.guardHandler = guardHandler;
exports.startGuard = startGuard;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const json_1 = require("../core/fs/json");
const paths_1 = require("../core/paths");
const exec_1 = require("../core/exec");
const desktop_app_1 = require("./desktop-app");
const paths_2 = require("./paths");
const processes_1 = require("./processes");
const session_store_1 = require("./session-store");
exports.PROTOCOL = 'claude';
exports.HANDLER_KEY = 'HKCU\\Software\\Classes\\claude\\shell\\open\\command';
exports.HANDLER_ROOT = 'HKCU\\Software\\Classes\\claude';
exports.SHIM_SCRIPT = 'deeplink.vbs';
exports.STATE_VERSION = 1;
exports.GUARD_SECONDS = 300;
exports.GUARD_INTERVAL_MS = 1000;
exports.LOG_FILE = 'deeplink.log';
const PROTOCOL_URL = /^claude:\/\//i;
function emptyState() {
    return { version: exports.STATE_VERSION, alias: null, dir: null, at: null, handler: { command: null, fallbackCommand: null, created: false } };
}
function normalizeState(value) {
    const base = emptyState();
    if (!value)
        return base;
    const handler = value.handler ?? base.handler;
    return {
        version: exports.STATE_VERSION,
        alias: typeof value.alias === 'string' ? value.alias : null,
        dir: typeof value.dir === 'string' ? value.dir : null,
        at: typeof value.at === 'string' ? value.at : null,
        handler: {
            command: typeof handler.command === 'string' ? handler.command : null,
            fallbackCommand: typeof handler.fallbackCommand === 'string' ? handler.fallbackCommand : null,
            created: Boolean(handler.created),
        },
    };
}
function readState(file = (0, paths_2.deeplinkStatePath)()) {
    return normalizeState((0, json_1.readJsonFile)(file));
}
function writeState(state, file = (0, paths_2.deeplinkStatePath)()) {
    const normalized = normalizeState(state);
    (0, json_1.writeJsonFile)(file, normalized);
    return normalized;
}
function shimPath() {
    return node_path_1.default.join(paths_1.packageRoot, 'scripts', 'windows', exports.SHIM_SCRIPT);
}
function cliPath() {
    return node_path_1.default.join(paths_1.packageRoot, 'bin', 'claudedeck.js');
}
function handlerCommand(shim = shimPath(), node = process.execPath, cli = cliPath()) {
    return `wscript.exe "${shim}" "${node}" "${cli}" deeplink "%1"`;
}
function isOurCommand(command) {
    return Boolean(command && command.toLowerCase().includes(exports.SHIM_SCRIPT.toLowerCase()));
}
function isProtocolUrl(url) {
    return PROTOCOL_URL.test(String(url ?? ''));
}
function parseRegistryCommand(output) {
    if (!output)
        return null;
    for (const line of output.split(/\r?\n/)) {
        const marker = line.indexOf('REG_SZ');
        if (marker === -1)
            continue;
        const value = line.slice(marker + 'REG_SZ'.length).trim();
        if (value)
            return value;
    }
    return null;
}
function powershellLiteral(value) {
    return `'${value.replace(/'/g, "''")}'`;
}
function readRegistryCommand() {
    return parseRegistryCommand((0, exec_1.tryCapture)('reg.exe', ['query', exports.HANDLER_KEY, '/ve']));
}
function runPowershell(command) {
    const result = (0, node_child_process_1.spawnSync)('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' });
    if (result.error)
        throw result.error;
    if (result.status !== 0)
        throw new Error((result.stderr || `Could not update the ${exports.PROTOCOL}:// handler.`).trim());
}
function writeRegistryCommand(command) {
    const key = "HKCU:\\Software\\Classes\\claude\\shell\\open\\command";
    runPowershell(`New-Item -Path ${powershellLiteral(key)} -Force | Out-Null; ` +
        `Set-ItemProperty -LiteralPath ${powershellLiteral(key)} -Name '(Default)' -Value ${powershellLiteral(command)}`);
}
function restoreRegistryCommand(fallback, created) {
    if (fallback) {
        writeRegistryCommand(fallback);
        return;
    }
    if (created)
        (0, node_child_process_1.spawnSync)('reg.exe', ['delete', exports.HANDLER_ROOT, '/f'], { encoding: 'utf8' });
}
function defaultDeeplinkDeps() {
    return {
        platform: process.platform,
        readState: () => readState(),
        writeState: state => writeState(state),
        readCommand: readRegistryCommand,
        writeCommand: writeRegistryCommand,
        restoreCommand: restoreRegistryCommand,
        wantedCommand: () => handlerCommand(),
        listProcesses: processes_1.listClaudeProcesses,
        signedOut: dir => !(0, session_store_1.hasAccountConfig)((0, paths_2.desktopConfigPath)(dir)),
        launch: desktop_app_1.launch,
        log: line => log(line),
        locate: desktop_app_1.locateApp,
        now: () => new Date(),
    };
}
function withDeps(overrides) {
    return { ...defaultDeeplinkDeps(), ...overrides };
}
function runningProfileDirs(processes) {
    const dirs = [];
    for (const entry of processes) {
        const dir = (0, processes_1.userDataDirOf)(entry.commandLine);
        if (dir && !dirs.some(known => (0, processes_1.samePath)(known, dir)))
            dirs.push(dir);
    }
    return dirs;
}
function pendingProfile(state, dirs, signedOut) {
    const waiting = dirs.filter(dir => signedOut(dir));
    const remembered = dirs.find(dir => (0, processes_1.samePath)(dir, state.dir)) ?? null;
    return waiting.find(dir => (0, processes_1.samePath)(dir, state.dir)) ?? waiting[0] ?? remembered;
}
function rememberOpen(alias, dir, overrides = {}) {
    const deps = withDeps(overrides);
    const state = deps.readState();
    return deps.writeState({ ...state, alias, dir, at: deps.now().toISOString() });
}
function forward(url, overrides = {}) {
    const deps = withDeps(overrides);
    if (!isProtocolUrl(url))
        throw new Error(`"${url}" is not a ${exports.PROTOCOL}:// link.`);
    const state = deps.readState();
    const target = pendingProfile(state, runningProfileDirs(deps.listProcesses()), deps.signedOut);
    const args = target ? [...(0, desktop_app_1.launchArgs)(target, false), url] : [url];
    const pid = deps.launch(deps.locate(), args);
    deps.log(`link ${url.split('?')[0]} -> ${target ?? 'Claude Desktop'}`);
    return {
        url,
        alias: target && (0, processes_1.samePath)(target, state.dir) ? state.alias : null,
        dir: target,
        pid,
        routed: Boolean(target),
    };
}
function handlerStatus(overrides = {}) {
    const deps = withDeps(overrides);
    if (deps.platform !== 'win32') {
        return { supported: false, installed: false, changed: false, command: null, fallbackCommand: null };
    }
    const current = deps.readCommand();
    return {
        supported: true,
        installed: isOurCommand(current),
        changed: false,
        command: current,
        fallbackCommand: deps.readState().handler.fallbackCommand,
    };
}
function installHandler(overrides = {}) {
    const deps = withDeps(overrides);
    if (deps.platform !== 'win32') {
        return { supported: false, installed: false, changed: false, command: null, fallbackCommand: null };
    }
    const current = deps.readCommand();
    const wanted = deps.wantedCommand();
    if (current === wanted) {
        return { supported: true, installed: true, changed: false, command: wanted, fallbackCommand: deps.readState().handler.fallbackCommand };
    }
    const state = deps.readState();
    const fallbackCommand = isOurCommand(current) ? state.handler.fallbackCommand : current;
    const created = current === null ? true : state.handler.created && isOurCommand(current);
    deps.writeState({ ...state, handler: { command: wanted, fallbackCommand, created } });
    deps.writeCommand(wanted);
    return { supported: true, installed: true, changed: true, command: wanted, fallbackCommand };
}
function removeHandler(overrides = {}) {
    const deps = withDeps(overrides);
    if (deps.platform !== 'win32') {
        return { supported: false, installed: false, changed: false, command: null, fallbackCommand: null };
    }
    const state = deps.readState();
    const current = deps.readCommand();
    if (!isOurCommand(current)) {
        return { supported: true, installed: false, changed: false, command: current, fallbackCommand: state.handler.fallbackCommand };
    }
    deps.restoreCommand(state.handler.fallbackCommand, state.handler.created);
    deps.writeState({ ...state, handler: { command: null, fallbackCommand: null, created: false } });
    return { supported: true, installed: false, changed: true, command: state.handler.fallbackCommand, fallbackCommand: null };
}
function ensureHandler(overrides = {}) {
    try {
        return installHandler(overrides);
    }
    catch {
        return { supported: true, installed: false, changed: false, command: null, fallbackCommand: null };
    }
}
function logPath() {
    return node_path_1.default.join((0, paths_1.userDataDir)(), exports.LOG_FILE);
}
function log(line, file = logPath()) {
    try {
        node_fs_1.default.mkdirSync(node_path_1.default.dirname(file), { recursive: true });
        node_fs_1.default.appendFileSync(file, `${new Date().toISOString()} ${line}\n`, 'utf8');
    }
    catch {
        return;
    }
}
function pause(ms) {
    return new Promise(resolve => { setTimeout(resolve, ms); });
}
async function guardHandler(overrides = {}, options = {}) {
    const deps = withDeps(overrides);
    const seconds = options.seconds ?? exports.GUARD_SECONDS;
    const intervalMs = options.intervalMs ?? exports.GUARD_INTERVAL_MS;
    const sleep = options.sleep ?? pause;
    if (deps.platform !== 'win32')
        return { seconds: 0, claims: 0 };
    const deadline = deps.now().getTime() + seconds * 1000;
    let claims = 0;
    for (let tick = 0;; tick += 1) {
        if (tick > 0 && deps.readState().handler.command === null) {
            deps.log('stopped guarding the claude:// handler because it was given back');
            return { seconds, claims };
        }
        if (deps.readCommand() !== deps.wantedCommand()) {
            ensureHandler(deps);
            claims += 1;
            deps.log('claimed the claude:// handler back from Claude Desktop');
        }
        if (deps.now().getTime() >= deadline)
            return { seconds, claims };
        await sleep(intervalMs);
    }
}
function startGuard(seconds = exports.GUARD_SECONDS, platform = process.platform) {
    if (platform !== 'win32')
        return false;
    const pid = (0, exec_1.spawnDetached)(process.execPath, [cliPath(), 'deeplink', 'guard', String(seconds)]);
    log(`guarding the claude:// handler for ${seconds}s (pid ${pid ?? 'unknown'})`);
    return pid !== undefined;
}
