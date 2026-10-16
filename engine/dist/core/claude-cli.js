"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claudeCommand = claudeCommand;
const node_child_process_1 = require("node:child_process");
const POWERSHELL_FLAGS = ['-NoProfile', '-ExecutionPolicy', 'Bypass'];
function windowsClaudeScript() {
    const result = (0, node_child_process_1.spawnSync)('powershell.exe', [...POWERSHELL_FLAGS, '-Command', '(Get-Command claude -ErrorAction Stop).Source'], { encoding: 'utf8' });
    if (result.error)
        throw result.error;
    if (result.status !== 0)
        throw new Error((result.stderr || result.stdout || 'claude command was not found.').trim());
    return result.stdout.trim();
}
function claudeCommand(prompt, model, platform = process.platform) {
    if (platform !== 'win32')
        return { command: 'claude', args: ['-p', prompt, '--model', model] };
    return {
        command: 'powershell.exe',
        args: [...POWERSHELL_FLAGS, '-File', windowsClaudeScript(), '-p', prompt, '--model', model],
    };
}
