"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIME_PATTERN = exports.WEEKDAY_NAMES = void 0;
exports.weekdayIndex = weekdayIndex;
exports.splitTime = splitTime;
exports.calendarEntryCount = calendarEntryCount;
exports.scheduleSummary = scheduleSummary;
exports.nextRunDate = nextRunDate;
exports.nextRunTime = nextRunTime;
const types_1 = require("../types");
exports.WEEKDAY_NAMES = new Set(types_1.WEEKDAYS);
exports.TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const WEEKDAY_INDEX = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
};
function weekdayIndex(day) {
    return WEEKDAY_INDEX[day];
}
function splitTime(value) {
    const match = String(value).match(exports.TIME_PATTERN);
    if (!match)
        throw new Error(`Invalid time: ${value}`);
    return { hour: Number(match[1]), minute: Number(match[2]) };
}
function calendarEntryCount(config) {
    return config.schedules.reduce((count, schedule) => count + schedule.days.length * schedule.times.length, 0);
}
function scheduleSummary(config) {
    return config.schedules
        .map(schedule => `${schedule.days.join(', ')} at ${schedule.times.join(', ')}`)
        .join(' | ');
}
function nextRunDate(config, now = new Date()) {
    let next = null;
    for (const schedule of config.schedules) {
        for (const day of schedule.days) {
            for (const time of schedule.times) {
                const parts = splitTime(time);
                for (let offset = 0; offset <= 7; offset += 1) {
                    const candidate = new Date(now);
                    candidate.setDate(now.getDate() + offset);
                    candidate.setHours(parts.hour, parts.minute, 0, 0);
                    if (candidate.getDay() !== weekdayIndex(day))
                        continue;
                    if (candidate <= now)
                        continue;
                    if (!next || candidate < next)
                        next = candidate;
                    break;
                }
            }
        }
    }
    return next;
}
function nextRunTime(config, now = new Date()) {
    const next = nextRunDate(config, now);
    return next ? next.toLocaleString() : '-';
}
