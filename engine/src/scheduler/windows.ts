import { runCapture, succeeds } from '../core/exec';
import { IConfigContext, IScheduler, ISchedulerSummary } from '../core/interfaces';
import { logCounts } from '../core/logging/run-log';
import { fromPackageRoot } from '../core/paths';

const NOT_INSTALLED = 'Background task is not installed yet.';

function exists(context: IConfigContext): boolean {
  return succeeds('schtasks.exe', ['/Query', '/TN', context.config.taskName]);
}

function install(context: IConfigContext): void {
  runCapture('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    fromPackageRoot('scripts', 'windows', 'install-task.ps1'),
    '-ConfigPath',
    context.configPath,
  ]);
}

function parseField(output: string, label: string): string {
  const match = output.match(new RegExp(`^${label}:\\s*(.+)$`, 'mi'));
  return match ? (match[1] as string).trim() : '-';
}

function summary(context: IConfigContext): ISchedulerSummary {
  const counts = logCounts(context.logPath);
  if (!exists(context)) {
    return {
      installed: false,
      enabled: false,
      running: false,
      state: 'Not installed',
      lastRun: '-',
      nextRun: '-',
      lastResult: '-',
      counts,
    };
  }
  const output = runCapture('schtasks.exe', ['/Query', '/TN', context.config.taskName, '/V', '/FO', 'LIST']);
  const state = parseField(output, 'Status');
  const enabled = parseField(output, 'Scheduled Task State') === 'Enabled';
  return {
    installed: true,
    enabled,
    running: state === 'Running',
    state,
    lastRun: parseField(output, 'Last Run Time'),
    nextRun: enabled ? parseField(output, 'Next Run Time') : '-',
    lastResult: parseField(output, 'Last Result'),
    counts,
  };
}

function invokeWhenInstalled(context: IConfigContext, args: string[]): void {
  if (!exists(context)) throw new Error(NOT_INSTALLED);
  runCapture('schtasks.exe', args);
}

export const windowsScheduler: IScheduler = {
  name: 'windows',
  exists,
  install,
  summary,
  runNow: context => invokeWhenInstalled(context, ['/Run', '/TN', context.config.taskName]),
  stop: context => invokeWhenInstalled(context, ['/End', '/TN', context.config.taskName]),
  disable: context => invokeWhenInstalled(context, ['/Change', '/TN', context.config.taskName, '/DISABLE']),
  enable: context => invokeWhenInstalled(context, ['/Change', '/TN', context.config.taskName, '/ENABLE']),
};
