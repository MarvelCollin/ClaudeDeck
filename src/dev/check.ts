import { spawnSync } from 'node:child_process';
import { calendarEntryCount } from '../core/config/schedule';
import { loadConfig } from '../core/config/loader';
import { configTemplatePath, packageRoot } from '../core/paths';

const POWERSHELL_FILES = ['scripts/windows/install-task.ps1', 'scripts/windows/run-claude.ps1'];

function checkPowerShell(): void {
  const command = POWERSHELL_FILES.map(file => `$null = [scriptblock]::Create((Get-Content -Raw '${file}'));`).join(' ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'PowerShell parse failed.');
}

const context = loadConfig(configTemplatePath);
if (process.platform === 'win32') checkPowerShell();
console.log(`check ok: ${calendarEntryCount(context.config)} mac calendar entries`);
