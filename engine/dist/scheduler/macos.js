"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.macosScheduler = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const schedule_1 = require("../core/config/schedule");
const exec_1 = require("../core/exec");
const run_log_1 = require("../core/logging/run-log");
const paths_1 = require("../core/paths");
const NOT_LOADED = 'Background task is not loaded.';
function domain() {
    return `gui/${process.getuid?.() ?? 0}`;
}
function plistPath(context) {
    return node_path_1.default.join(node_os_1.default.homedir(), 'Library', 'LaunchAgents', `${context.config.macLabel}.plist`);
}
function serviceTarget(context) {
    return `${domain()}/${context.config.macLabel}`;
}
function loaded(context) {
    return (0, exec_1.succeeds)('launchctl', ['print', serviceTarget(context)]);
}
function disabled(context) {
    const output = (0, exec_1.runCapture)('launchctl', ['print-disabled', domain()]);
    const label = context.config.macLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = output.match(new RegExp(`"${label}"\\s*=>\\s*(true|false)`));
    return match ? match[1] === 'true' : false;
}
function xmlEscape(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
function calendarXml(context) {
    const items = [];
    for (const schedule of context.config.schedules) {
        for (const day of schedule.days) {
            for (const time of schedule.times) {
                const parts = (0, schedule_1.splitTime)(time);
                items.push(`    <dict>
      <key>Weekday</key>
      <integer>${(0, schedule_1.weekdayIndex)(day)}</integer>
      <key>Hour</key>
      <integer>${parts.hour}</integer>
      <key>Minute</key>
      <integer>${parts.minute}</integer>
    </dict>`);
            }
        }
    }
    return items.join('\n');
}
function plist(context) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(context.config.macLabel)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(process.execPath)}</string>
    <string>${xmlEscape((0, paths_1.runnerScriptPath)())}</string>
    <string>--config</string>
    <string>${xmlEscape(context.configPath)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(paths_1.packageRoot)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xmlEscape(process.env.PATH || '')}</string>
  </dict>
  <key>StartCalendarInterval</key>
  <array>
${calendarXml(context)}
  </array>
  <key>StandardOutPath</key>
  <string>${xmlEscape(context.logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(context.logPath)}</string>
</dict>
</plist>
`;
}
function exists(context) {
    return node_fs_1.default.existsSync(plistPath(context));
}
function install(context) {
    const file = plistPath(context);
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(file), { recursive: true });
    node_fs_1.default.writeFileSync(file, plist(context), 'utf8');
    if (loaded(context))
        (0, exec_1.runCapture)('launchctl', ['bootout', domain(), file]);
    (0, exec_1.runCapture)('launchctl', ['bootstrap', domain(), file]);
    (0, exec_1.runCapture)('launchctl', ['enable', serviceTarget(context)]);
}
function summary(context) {
    const installed = exists(context);
    const isLoaded = loaded(context);
    const isDisabled = installed ? disabled(context) : true;
    const counts = (0, run_log_1.logCounts)(context.logPath);
    let state = 'Not loaded';
    if (isLoaded) {
        const match = (0, exec_1.runCapture)('launchctl', ['print', serviceTarget(context)]).match(/state = ([^\n]+)/);
        state = match ? match[1].trim() : 'Loaded';
    }
    const enabled = isLoaded && !isDisabled;
    return {
        installed,
        loaded: isLoaded,
        enabled,
        running: state.toLowerCase() === 'running',
        state,
        lastRun: (0, run_log_1.lastRunTime)(context.logPath),
        nextRun: enabled ? (0, schedule_1.nextRunTime)(context.config) : '-',
        counts,
    };
}
function invokeWhenLoaded(context, args) {
    if (!loaded(context))
        throw new Error(NOT_LOADED);
    (0, exec_1.runCapture)('launchctl', args);
}
exports.macosScheduler = {
    name: 'macos',
    exists,
    install,
    summary,
    runNow: context => invokeWhenLoaded(context, ['kickstart', '-k', serviceTarget(context)]),
    stop: context => invokeWhenLoaded(context, ['kill', 'TERM', serviceTarget(context)]),
    disable: context => invokeWhenLoaded(context, ['disable', serviceTarget(context)]),
    enable: context => invokeWhenLoaded(context, ['enable', serviceTarget(context)]),
};
