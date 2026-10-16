"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEPARATOR = void 0;
exports.parseProcessLines = parseProcessLines;
exports.parsePosixProcessLines = parsePosixProcessLines;
exports.listClaudeProcesses = listClaudeProcesses;
exports.killPids = killPids;
const node_child_process_1 = require("node:child_process");
const json_1 = require("../core/fs/json");
const exec_1 = require("../core/exec");
exports.SEPARATOR = '|::|';
const MACOS_BINARY = /Claude\.app\/Contents\/MacOS\/Claude/;
function nonEmptyLines(text) {
    return String(text)
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
}
function parseProcessLines(text) {
    const processes = [];
    for (const line of nonEmptyLines(text)) {
        const index = line.indexOf(exports.SEPARATOR);
        if (index === -1)
            continue;
        const pid = Number(line.slice(0, index).trim());
        if (!Number.isInteger(pid) || pid <= 0)
            continue;
        processes.push({ pid, commandLine: line.slice(index + exports.SEPARATOR.length).trim() });
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
function listClaudeProcesses(platform = process.platform) {
    if (platform === 'win32') {
        const command = `Get-CimInstance Win32_Process -Filter "Name='claude.exe'" | ForEach-Object { "$($_.ProcessId)${exports.SEPARATOR}$($_.CommandLine)" }`;
        const output = (0, exec_1.tryCapture)('powershell.exe', ['-NoProfile', '-Command', command]);
        return output === null ? [] : parseProcessLines(output);
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
        (0, node_child_process_1.spawnSync)('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' });
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
