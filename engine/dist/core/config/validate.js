"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSchedule = validateSchedule;
exports.validateConfig = validateConfig;
const schedule_1 = require("./schedule");
function requireString(value, name) {
    if (!value || typeof value !== 'string')
        throw new Error(`${name} is required.`);
    return value;
}
function requireBoolean(value, name) {
    if (typeof value !== 'boolean')
        throw new Error(`${name} is required.`);
    return value;
}
function validateSchedule(schedule) {
    if (!Array.isArray(schedule.days) || schedule.days.length === 0)
        throw new Error('Schedule days are required.');
    if (!Array.isArray(schedule.times) || schedule.times.length === 0)
        throw new Error('Schedule times are required.');
    for (const day of schedule.days) {
        if (!schedule_1.WEEKDAY_NAMES.has(day))
            throw new Error(`Invalid day: ${day}`);
    }
    for (const time of schedule.times) {
        if (!schedule_1.TIME_PATTERN.test(String(time)))
            throw new Error(`Invalid time: ${time}`);
    }
}
function validateConfig(value) {
    const config = value;
    requireString(config?.taskName, 'taskName');
    requireString(config.macLabel, 'macLabel');
    requireString(config.prompt, 'prompt');
    requireString(config.logFile, 'logFile');
    requireBoolean(config.wakeToRun, 'wakeToRun');
    requireBoolean(config.runWhenLocked, 'runWhenLocked');
    if (config.warmAllAccounts !== undefined)
        requireBoolean(config.warmAllAccounts, 'warmAllAccounts');
    if (config.model !== 'haiku')
        throw new Error('model must be haiku.');
    if (!Array.isArray(config.schedules) || config.schedules.length === 0)
        throw new Error('schedules is required.');
    for (const schedule of config.schedules)
        validateSchedule(schedule);
}
