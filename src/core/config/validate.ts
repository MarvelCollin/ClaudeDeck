import { IAppConfig, ISchedule } from '../interfaces';
import { TIME_PATTERN, WEEKDAY_NAMES } from './schedule';

function requireString(value: unknown, name: string): string {
  if (!value || typeof value !== 'string') throw new Error(`${name} is required.`);
  return value;
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${name} is required.`);
  return value;
}

export function validateSchedule(schedule: ISchedule): void {
  if (!Array.isArray(schedule.days) || schedule.days.length === 0) throw new Error('Schedule days are required.');
  if (!Array.isArray(schedule.times) || schedule.times.length === 0) throw new Error('Schedule times are required.');
  for (const day of schedule.days) {
    if (!WEEKDAY_NAMES.has(day)) throw new Error(`Invalid day: ${day}`);
  }
  for (const time of schedule.times) {
    if (!TIME_PATTERN.test(String(time))) throw new Error(`Invalid time: ${time}`);
  }
}

export function validateConfig(value: unknown): asserts value is IAppConfig {
  const config = value as IAppConfig;
  requireString(config?.taskName, 'taskName');
  requireString(config.macLabel, 'macLabel');
  requireString(config.prompt, 'prompt');
  requireString(config.logFile, 'logFile');
  requireBoolean(config.wakeToRun, 'wakeToRun');
  requireBoolean(config.runWhenLocked, 'runWhenLocked');
  if (config.model !== 'haiku') throw new Error('model must be haiku.');
  if (!Array.isArray(config.schedules) || config.schedules.length === 0) throw new Error('schedules is required.');
  for (const schedule of config.schedules) validateSchedule(schedule);
}
