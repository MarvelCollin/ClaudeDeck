"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEPARATOR = void 0;
exports.parseProcessLines = parseProcessLines;
exports.parsePosixProcessLines = parsePosixProcessLines;
exports.executableOf = executableOf;
exports.isDesktopExecutable = isDesktopExecutable;
exports.desktopOnly = desktopOnly;
exports.listClaudeProcesses = listClaudeProcesses;
exports.killPids = killPids;
exports.pauseSync = pauseSync;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const json_1 = require("../core/fs/json");
const exec_1 = require("../core/exec");
exports.SEPARATOR = '|::|';
const MACOS_BINARY = /Claude\.app\/Contents\/MacOS\/Claude/;
const QUOTED_EXECUTABLE = /^"([^"]+)"/;
const BARE_EXECUTABLE = /^(\S+?\.exe)(?:\s|$)/i;
function nonEmptyLines(text) {
    return String(text)
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
}
function parseProcessLines(text) {
    const processes = [];
    for (const line of nonEmptyLines(text)) {
        const fields = line.split(exports.SEPARATOR);
        if (fields.length < 2)
            continue;
        const pid = Number(fields[0].trim());
        if (!Number.isInteger(pid) || pid <= 0)
            continue;
        if (fields.length === 2) {
            processes.push({ pid, commandLine: fields[1].trim() });
            continue;
        }
        processes.push({
            pid,
            executablePath: fields[1].trim(),
            commandLine: fields.slice(2).join(exports.SEPARATOR).trim(),
        });
    }
    return processes;
}
function parsePosixProcessLines(text) {
    const processes = [];
    for (const line of nonEmptyLines(text)) {
        const match = line.match(/^(\d+)\s+(.*)$/);
        if (!match)
            continue;
        processes.push({ pid: Number(match[1]), commandLine: match[2] });
    }
    return processes;
}
function executableOf(entry) {
    if (entry.executablePath)
        return entry.executablePath;
    const quoted = entry.commandLine.match(QUOTED_EXECUTABLE);
    if (quoted)
        return quoted[1];
    const bare = entry.commandLine.match(BARE_EXECUTABLE);
    return bare ? bare[1] : null;
}
function isDesktopExecutable(executable, exists = node_fs_1.default.existsSync) {
    if (!executable)
        return false;
    return exists(node_path_1.default.win32.join(node_path_1.default.win32.dirname(executable), 'resources', 'app.asar'));
}
function desktopOnly(processes, exists = node_fs_1.default.existsSync) {
    const known = new Map();
    return processes.filter(entry => {
        const executable = executableOf(entry);
        const key = (executable ?? '').toLowerCase();
        if (!known.has(key))
            known.set(key, isDesktopExecutable(executable, exists));
        return known.get(key) === true;
    });
}
function listClaudeProcesses(platform = process.platform) {
    if (platform === 'win32') {
        const command = `Get-CimInstance Win32_Process -Filter "Name='claude.exe'" | ForEach-Object { "$($_.ProcessId)${exports.SEPARATOR}$($_.ExecutablePath)${exports.SEPARATOR}$($_.CommandLine)" }`;
        const output = (0, exec_1.tryCapture)('powershell.exe', ['-NoProfile', '-Command', command]);
        return output === null ? [] : desktopOnly(parseProcessLines(output));
    }
    if (platform === 'darwin') {
        const output = (0, exec_1.tryCapture)('ps', ['-ax', '-o', 'pid=,command=']);
        return output === null ? [] : parsePosixProcessLines(output).filter(entry => MACOS_BINARY.test(entry.commandLine));
    }
    return [];
}
function killPids(pids, platform = process.platform) {
    if (!pids.length)
        return 0;
    if (platform === 'win32') {
        const command = `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | Stop-Process -Force`;
        (0, node_child_process_1.spawnSync)('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true });
        return pids.length;
    }
    for (const pid of pids) {
        try {
            process.kill(pid, 'SIGTERM');
        }
        catch (error) {
            if ((0, json_1.errorCode)(error) !== 'ESRCH')
                throw error;
        }
    }
    return pids.length;
}
function pauseSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, ms));
}
