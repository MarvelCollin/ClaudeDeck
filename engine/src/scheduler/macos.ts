import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nextRunTime, splitTime, weekdayIndex } from '../core/config/schedule';
import { runCapture, succeeds } from '../core/exec';
import { IConfigContext, IScheduler, ISchedulerSummary } from '../core/interfaces';
import { lastRunTime, logCounts } from '../core/logging/run-log';
import { packageRoot, runnerScriptPath } from '../core/paths';
import { Weekday } from '../core/types';

const NOT_LOADED = 'Background task is not loaded.';

function domain(): string {
  return `gui/${process.getuid?.() ?? 0}`;
}

function plistPath(context: IConfigContext): string {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${context.config.macLabel}.plist`);
}

function serviceTarget(context: IConfigContext): string {
  return `${domain()}/${context.config.macLabel}`;
}

function loaded(context: IConfigContext): boolean {
  return succeeds('launchctl', ['print', serviceTarget(context)]);
}

function disabled(context: IConfigContext): boolean {
  const output = runCapture('launchctl', ['print-disabled', domain()]);
  const label = context.config.macLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = output.match(new RegExp(`"${label}"\\s*=>\\s*(true|false)`));
  return match ? match[1] === 'true' : false;
}

function xmlEscape(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function calendarXml(context: IConfigContext): string {
  const items: string[] = [];
  for (const schedule of context.config.schedules) {
    for (const day of schedule.days as Weekday[]) {
      for (const time of schedule.times) {
        const parts = splitTime(time);
        items.push(`    <dict>
      <key>Weekday</key>
      <integer>${weekdayIndex(day)}</integer>
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

function plist(context: IConfigContext): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(context.config.macLabel)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(process.execPath)}</string>
    <string>${xmlEscape(runnerScriptPath())}</string>
    <string>--config</string>
    <string>${xmlEscape(context.configPath)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(packageRoot)}</string>
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

function exists(context: IConfigContext): boolean {
  return fs.existsSync(plistPath(context));
}

function install(context: IConfigContext): void {
  const file = plistPath(context);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, plist(context), 'utf8');
  if (loaded(context)) runCapture('launchctl', ['bootout', domain(), file]);
  runCapture('launchctl', ['bootstrap', domain(), file]);
  runCapture('launchctl', ['enable', serviceTarget(context)]);
}

function summary(context: IConfigContext): ISchedulerSummary {
  const installed = exists(context);
  const isLoaded = loaded(context);
  const isDisabled = installed ? disabled(context) : true;
  const counts = logCounts(context.logPath);
  let state = 'Not loaded';
  if (isLoaded) {
    const match = runCapture('launchctl', ['print', serviceTarget(context)]).match(/state = ([^\n]+)/);
    state = match ? (match[1] as string).trim() : 'Loaded';
  }
  const enabled = isLoaded && !isDisabled;
  return {
    installed,
    loaded: isLoaded,
    enabled,
    running: state.toLowerCase() === 'running',
    state,
    lastRun: lastRunTime(context.logPath),
    nextRun: enabled ? nextRunTime(context.config) : '-',
    counts,
  };
}

function invokeWhenLoaded(context: IConfigContext, args: string[]): void {
  if (!loaded(context)) throw new Error(NOT_LOADED);
  runCapture('launchctl', args);
}

export const macosScheduler: IScheduler = {
  name: 'macos',
  exists,
  install,
  summary,
  runNow: context => invokeWhenLoaded(context, ['kickstart', '-k', serviceTarget(context)]),
  stop: context => invokeWhenLoaded(context, ['kill', 'TERM', serviceTarget(context)]),
  disable: context => invokeWhenLoaded(context, ['disable', serviceTarget(context)]),
  enable: context => invokeWhenLoaded(context, ['enable', serviceTarget(context)]),
};
