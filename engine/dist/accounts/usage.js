"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEEKLY_KEY = exports.SESSION_KEY = exports.USAGE_FILE = void 0;
exports.usagePath = usagePath;
exports.readSamples = readSamples;
exports.latestSample = latestSample;
exports.activeOrgUuid = activeOrgUuid;
exports.latestSampleFor = latestSampleFor;
exports.toUsage = toUsage;
exports.usageFor = usageFor;
const node_path_1 = __importDefault(require("node:path"));
const json_1 = require("../core/fs/json");
exports.USAGE_FILE = 'plan-usage-history.json';
exports.SESSION_KEY = 'fh';
exports.WEEKLY_KEY = 'sd';
function toWindow(value) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return null;
    const usedPercent = Math.min(100, Math.max(0, Math.round(value)));
    return { usedPercent, leftPercent: 100 - usedPercent };
}
function isSample(value) {
    const sample = value;
    return Boolean(sample && typeof sample === 'object' && typeof sample.t === 'number' && typeof sample.org === 'string' && sample.org);
}
function usagePath(profileDir) {
    return node_path_1.default.join(profileDir, exports.USAGE_FILE);
}
function readSamples(profileDir) {
    const raw = (0, json_1.readJsonFile)(usagePath(profileDir));
    if (!raw || !Array.isArray(raw.samples))
        return [];
    return raw.samples.filter(isSample).sort((left, right) => left.t - right.t);
}
function latestSample(samples) {
    return samples.length ? samples[samples.length - 1] : null;
}
function activeOrgUuid(samples) {
    return latestSample(samples)?.org ?? null;
}
function latestSampleFor(samples, orgUuid) {
    if (!orgUuid)
        return null;
    for (let index = samples.length - 1; index >= 0; index -= 1) {
        const sample = samples[index];
        if (sample.org === orgUuid)
            return sample;
    }
    return null;
}
function toUsage(sample) {
    if (!sample)
        return null;
    const session = toWindow(sample.u?.[exports.SESSION_KEY]);
    const weekly = toWindow(sample.u?.[exports.WEEKLY_KEY]);
    if (!session && !weekly)
        return null;
    return {
        orgUuid: sample.org,
        sampledAt: new Date(sample.t).toISOString(),
        session,
        weekly,
    };
}
function usageFor(samples, orgUuid) {
    return toUsage(latestSampleFor(samples, orgUuid));
}
