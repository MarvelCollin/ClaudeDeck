"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.windowsScheduler = void 0;
const exec_1 = require("../core/exec");
const schedule_1 = require("../core/config/schedule");
const run_log_1 = require("../core/logging/run-log");
const paths_1 = require("../core/paths");
const NOT_INSTALLED = 'Task is not installed.';
function exists(context) {
    return (0, exec_1.succeeds)('schtasks.exe', ['/Query', '/TN', context.config.taskName]);
}
function install(context) {
    (0, exec_1.runInherited)('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        (0, paths_1.fromPackageRoot)('scripts', 'windows', 'install-task.ps1'),
        '-ConfigPath',
        context.configPath,
    ]);
}
function parseField(output, label) {
    const match = output.match(new RegExp(`^${label}:\\s*(.+)$`, 'mi'));
    return match ? match[1].trim() : '-';
}
function summary(context) {
    const counts = (0, run_log_1.logCounts)(context.logPath);
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
    const output = (0, exec_1.runCapture)('schtasks.exe', ['/Query', '/TN', context.config.taskName, '/V', '/FO', 'LIST']);
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
function status(context) {
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
    console.log(`Config next run: ${(0, schedule_1.nextRunTime)(context.config)}`);
    console.log(`Configured schedule: ${(0, schedule_1.scheduleSummary)(context.config)}`);
    console.log(`Last result: ${info.lastResult}`);
    console.log(`Run count: ${info.counts.runs}`);
    console.log(`Success count: ${info.counts.success}`);
    console.log(`Failed count: ${info.counts.failed}`);
    console.log(`Incomplete count: ${info.counts.incomplete}`);
    console.log(`Log: ${context.logPath}`);
}
function invokeWhenInstalled(context, args) {
    if (!exists(context)) {
        console.log(NOT_INSTALLED);
        return;
    }
    (0, exec_1.runInherited)('schtasks.exe', args);
}
exports.windowsScheduler = {
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
    openLog: context => (0, exec_1.runInherited)('notepad.exe', [context.logPath]),
};
