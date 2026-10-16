"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JOB_ACTIONS = exports.JOB_DELAY_MS = exports.JOB_FILE = void 0;
exports.defaultJobDeps = defaultJobDeps;
exports.isJobAction = isJobAction;
exports.readDesktopJob = readDesktopJob;
exports.startDesktopJob = startDesktopJob;
exports.runDesktopJob = runDesktopJob;
const node_path_1 = __importDefault(require("node:path"));
const exec_1 = require("../core/exec");
const json_1 = require("../core/fs/json");
const paths_1 = require("../core/paths");
const processes_1 = require("./processes");
exports.JOB_FILE = 'desktop-job.json';
exports.JOB_DELAY_MS = 2000;
exports.JOB_ACTIONS = ['switch', 'save', 'add'];
function defaultJobDeps() {
    return {
        file: node_path_1.default.join((0, paths_1.userDataDir)(), exports.JOB_FILE),
        node: process.execPath,
        bin: node_path_1.default.resolve(__dirname, '..', '..', 'bin', 'claudedeck.js'),
        delayMs: exports.JOB_DELAY_MS,
        spawn: exec_1.spawnDetached,
        pause: processes_1.pauseSync,
        now: () => new Date(),
    };
}
function isJobAction(value) {
    return typeof value === 'string' && exports.JOB_ACTIONS.includes(value);
}
function readDesktopJob(overrides = {}) {
    const { file } = { ...defaultJobDeps(), ...overrides };
    return (0, json_1.readJsonFile)(file);
}
function startDesktopJob(action, alias, overrides = {}) {
    const deps = { ...defaultJobDeps(), ...overrides };
    const job = { action, alias, startedAt: deps.now().toISOString(), finishedAt: null, ok: null, error: null };
    (0, json_1.writeJsonFile)(deps.file, job);
    deps.spawn(deps.node, [deps.bin, 'desktop', action, ...(alias ? [alias] : [])]);
    return job;
}
function runDesktopJob(action, alias, switcher, overrides = {}) {
    const deps = { ...defaultJobDeps(), ...overrides };
    const started = (0, json_1.readJsonFile)(deps.file);
    const base = {
        action,
        alias,
        startedAt: started?.action === action ? started.startedAt : deps.now().toISOString(),
        finishedAt: null,
        ok: null,
        error: null,
    };
    deps.pause(deps.delayMs);
    let job;
    try {
        if (action === 'switch') {
            if (!alias)
                throw new Error('Which account should Claude Desktop use?');
            job = { ...base, alias: switcher.switchTo(alias).alias, ok: true };
        }
        else if (action === 'add') {
            job = { ...base, alias: switcher.freshDesktop().alias, ok: true };
        }
        else {
            job = { ...base, alias: switcher.sync().alias, ok: true };
        }
    }
    catch (error) {
        job = { ...base, ok: false, error: (0, json_1.errorMessage)(error) };
    }
    job.finishedAt = deps.now().toISOString();
    (0, json_1.writeJsonFile)(deps.file, job);
    return job;
}
