"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendLog = appendLog;
exports.logCounts = logCounts;
exports.lastRunTime = lastRunTime;
exports.readLogLines = readLogLines;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const EMPTY_COUNTS = { runs: 0, success: 0, failed: 0, incomplete: 0 };
function readText(file) {
    return node_fs_1.default.readFileSync(file, 'utf8').replace(/\0/g, '');
}
function appendLog(file, text) {
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(file), { recursive: true });
    node_fs_1.default.appendFileSync(file, text, 'utf8');
}
function logCounts(file) {
    if (!node_fs_1.default.existsSync(file))
        return { ...EMPTY_COUNTS };
    const text = readText(file);
    const runs = (text.match(/^\[.+\] start\r?$/gm) || []).length;
    const success = (text.match(/^\[.+\] exit 0\r?$/gm) || []).length;
    const failed = (text.match(/^\[.+\] exit (?!0\r?$)\d+\r?$/gm) || []).length;
    return { runs, success, failed, incomplete: runs - success - failed };
}
function lastRunTime(file) {
    if (!node_fs_1.default.existsSync(file))
        return '-';
    const matches = [...readText(file).matchAll(/^\[(.+)\] start\r?$/gm)];
    const latest = matches[matches.length - 1]?.[1];
    if (!latest)
        return '-';
    const date = new Date(latest);
    return Number.isNaN(date.getTime()) ? latest : date.toLocaleString();
}
function readLogLines(file, limit = 400) {
    if (!node_fs_1.default.existsSync(file))
        return [];
    return readText(file).split(/\r?\n/).filter(Boolean).slice(-limit);
}
