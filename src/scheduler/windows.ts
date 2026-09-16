import { runCapture, runInherited, succeeds } from '../core/exec';
import { nextRunTime, scheduleSummary } from '../core/config/schedule';
import { IConfigContext, IScheduler, ISchedulerSummary } from '../core/interfaces';
import { logCounts } from '../core/logging/run-log';
import { fromPackageRoot } from '../core/paths';

const NOT_INSTALLED = 'Task is not installed.';

function exists(context: IConfigContext): boolean {
  return succeeds('schtasks.exe', ['/Query', '/TN', context.config.taskName]);
}

function install(context: IConfigContext): void {
  runInherited('powershell.exe', [
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

function status(context: IConfigContext): void {
  const info = summary(context);
  if (!info.installed) {
    console.log(NOT_INSTALLED);
    return;
  }
  console.log('');
  console.log('Installed: Yes');
  console.log(`Enabled: ${info.enabled}`);
  console.log(`Current state: ${info.state}`);
  console.log(`Last run: ${info.lastRun}`);
  console.log(`Next run: ${info.nextRun}`);
  console.log(`Config next run: ${nextRunTime(context.config)}`);
  console.log(`Configured schedule: ${scheduleSummary(context.config)}`);
  console.log(`Last result: ${info.lastResult}`);
  console.log(`Run count: ${info.counts.runs}`);
  console.log(`Success count: ${info.counts.success}`);
  console.log(`Failed count: ${info.counts.failed}`);
  console.log(`Incomplete count: ${info.counts.incomplete}`);
  console.log(`Log: ${context.logPath}`);
}

function invokeWhenInstalled(context: IConfigContext, args: string[]): void {
  if (!exists(context)) {
    console.log(NOT_INSTALLED);
    return;
  }
  runInherited('schtasks.exe', args);
}

export const windowsScheduler: IScheduler = {
  name: 'windows',
  exists,
  install,
  summary,
  status,
  runNow: context => invokeWhenInstalled(context, ['/Run', '/TN', context.config.taskName]),
  stop: context => invokeWhenInstalled(context, ['/End', '/TN', context.config.taskName]),
  disable: context => invokeWhenInstalled(context, ['/Change', '/TN', context.config.taskName, '/DISABLE']),
  enable: context => invokeWhenInstalled(context, ['/Change', '/TN', context.config.taskName, '/ENABLE']),
  deleteTask: context => invokeWhenInstalled(context, ['/Delete', '/TN', context.config.taskName, '/F']),
  openLog: context => runInherited('notepad.exe', [context.logPath]),
};
