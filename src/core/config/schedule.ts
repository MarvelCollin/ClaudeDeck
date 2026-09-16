import { IAppConfig, ITimeOfDay } from '../interfaces';
import { Weekday, WEEKDAYS } from '../types';

export const WEEKDAY_NAMES: ReadonlySet<string> = new Set(WEEKDAYS);
export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const WEEKDAY_INDEX: Record<Weekday, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

export function weekdayIndex(day: Weekday): number {
  return WEEKDAY_INDEX[day];
}

export function splitTime(value: string): ITimeOfDay {
  const match = String(value).match(TIME_PATTERN);
  if (!match) throw new Error(`Invalid time: ${value}`);
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function calendarEntryCount(config: IAppConfig): number {
  return config.schedules.reduce((count, schedule) => count + schedule.days.length * schedule.times.length, 0);
}

export function scheduleSummary(config: IAppConfig): string {
  return config.schedules
    .map(schedule => `${schedule.days.join(', ')} at ${schedule.times.join(', ')}`)
    .join(' | ');
}

export function nextRunDate(config: IAppConfig, now = new Date()): Date | null {
  let next: Date | null = null;
  for (const schedule of config.schedules) {
    for (const day of schedule.days) {
      for (const time of schedule.times) {
        const parts = splitTime(time);
        for (let offset = 0; offset <= 7; offset += 1) {
          const candidate = new Date(now);
          candidate.setDate(now.getDate() + offset);
          candidate.setHours(parts.hour, parts.minute, 0, 0);
          if (candidate.getDay() !== weekdayIndex(day)) continue;
          if (candidate <= now) continue;
          if (!next || candidate < next) next = candidate;
          break;
        }
      }
    }
  }
  return next;
}

export function nextRunTime(config: IAppConfig, now = new Date()): string {
  const next = nextRunDate(config, now);
  return next ? next.toLocaleString() : '-';
}
