"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const schedule_1 = require("../core/config/schedule");
const loader_1 = require("../core/config/loader");
const paths_1 = require("../core/paths");
const POWERSHELL_FILES = ['scripts/windows/install-task.ps1', 'scripts/windows/run-claude.ps1'];
function checkPowerShell() {
    const command = POWERSHELL_FILES.map(file => `$null = [scriptblock]::Create((Get-Content -Raw '${file}'));`).join(' ');
    const result = (0, node_child_process_1.spawnSync)('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
        cwd: paths_1.packageRoot,
        encoding: 'utf8',
    });
    if (result.status !== 0)
        throw new Error(result.stderr || result.stdout || 'PowerShell parse failed.');
}
const context = (0, loader_1.loadConfig)(paths_1.configTemplatePath);
if (process.platform === 'win32')
    checkPowerShell();
console.log(`check ok: ${(0, schedule_1.calendarEntryCount)(context.config)} mac calendar entries`);
