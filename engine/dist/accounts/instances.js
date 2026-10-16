"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DESKTOP_SUBDIR = void 0;
exports.isSeeded = isSeeded;
exports.createInstances = createInstances;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const deeplink_1 = require("./deeplink");
const desktop_app_1 = require("./desktop-app");
const paths_1 = require("./paths");
const processes_1 = require("./processes");
const session_store_1 = require("./session-store");
const usage_1 = require("./usage");
exports.DESKTOP_SUBDIR = 'desktop';
function defaultDeps() {
    return {
        slotOf: alias => (0, paths_1.sessionSlot)(alias),
        dirOf: alias => (0, paths_1.profilePath)(alias),
        listProcesses: processes_1.listClaudeProcesses,
        kill: processes_1.killPids,
        launch: desktop_app_1.launch,
        locate: desktop_app_1.locateApp,
        defaultDir: (0, paths_1.desktopProfileDir)(),
        remember: (alias, dir) => (0, deeplink_1.rememberOpen)(alias, dir),
        routeLogins: () => (0, deeplink_1.startGuard)(),
    };
}
function isSeeded(dir) {
    try {
        return node_fs_1.default.readdirSync(dir).length > 0;
    }
    catch {
        return false;
    }
}
function createInstances(overrides = {}) {
    const deps = { ...defaultDeps(), ...overrides };
    function locationsFor(sessions) {
        return sessions.map(entry => ({ alias: entry.alias, dir: deps.dirOf(entry.alias) }));
    }
    function running(sessions) {
        return (0, processes_1.groupProcesses)(deps.listProcesses(), locationsFor(sessions), deps.defaultDir);
    }
    function usageOf(dir) {
        return isSeeded(dir) ? (0, usage_1.toUsage)((0, usage_1.latestSample)((0, usage_1.readSamples)(dir))) : null;
    }
    function signedIn(dir) {
        return (0, session_store_1.hasAccountConfig)((0, paths_1.desktopConfigPath)(dir));
    }
    function describe(sessions) {
        const groups = running(sessions);
        return sessions.map(entry => {
            const dir = deps.dirOf(entry.alias);
            const pids = groups.get(entry.alias) ?? [];
            return {
                alias: entry.alias,
                dir,
                seeded: isSeeded(dir),
                signedIn: signedIn(dir),
                running: pids.length > 0,
                pids,
                usage: usageOf(dir),
            };
        });
    }
    function seed(alias, dir) {
        const slot = deps.slotOf(alias);
        const desktopSlot = node_path_1.default.join(slot, exports.DESKTOP_SUBDIR);
        if (isSeeded(dir) && signedIn(dir))
            return null;
        const items = isSeeded(desktopSlot) && !isSeeded(dir) ? (0, session_store_1.restoreDesktop)(desktopSlot, dir) : [];
        const config = (0, session_store_1.restoreConfig)(node_path_1.default.join(slot, session_store_1.CONFIG_FILE), (0, paths_1.desktopConfigPath)(dir));
        return items.length || config ? slot : null;
    }
    function open(alias, sessions, options = {}) {
        (0, paths_1.assertValidAlias)(alias);
        const dir = deps.dirOf(alias);
        const pids = running(sessions).get(alias) ?? [];
        if (pids.length && !options.fresh) {
            return {
                alias,
                dir,
                pid: pids[0],
                seededFrom: null,
                wiped: false,
                signedIn: signedIn(dir),
                loginRouted: false,
                alreadyRunning: true,
            };
        }
        if (options.fresh) {
            deps.kill(pids);
            node_fs_1.default.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
        }
        const seededFrom = options.fresh ? null : seed(alias, dir);
        node_fs_1.default.mkdirSync(dir, { recursive: true });
        deps.remember(alias, dir);
        const loginRouted = signedIn(dir) ? false : deps.routeLogins();
        const pid = deps.launch(deps.locate(), (0, desktop_app_1.launchArgs)(dir, false));
        return { alias, dir, pid, seededFrom, wiped: Boolean(options.fresh), signedIn: signedIn(dir), loginRouted, alreadyRunning: false };
    }
    function stop(alias, sessions) {
        const pids = running(sessions).get(alias) ?? [];
        deps.kill(pids);
        return { alias, stopped: pids.length };
    }
    return { describe, open, stop, isSeeded };
}
