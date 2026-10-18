"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REVEAL_SETTLE_MS = exports.REVEAL_POLL_MS = exports.REVEAL_TIMEOUT_MS = void 0;
exports.userDataDirOf = userDataDirOf;
exports.isMainProcess = isMainProcess;
exports.aliasOfProfile = aliasOfProfile;
exports.defaultWindowDeps = defaultWindowDeps;
exports.createDesktopWindows = createDesktopWindows;
const node_path_1 = __importDefault(require("node:path"));
const desktop_app_1 = require("./desktop-app");
const identity_1 = require("./identity");
const paths_1 = require("./paths");
const processes_1 = require("./processes");
const registry = __importStar(require("./registry"));
const session = __importStar(require("./session-store"));
exports.REVEAL_TIMEOUT_MS = 20_000;
exports.REVEAL_POLL_MS = 500;
exports.REVEAL_SETTLE_MS = 4_000;
const CHILD_PROCESS_ARG = /\s--type=/;
const USER_DATA_ARG = /"--user-data-dir=([^"]+)"|--user-data-dir=(?:"([^"]+)"|(\S+))/;
function userDataDirOf(commandLine) {
    const match = commandLine.match(USER_DATA_ARG);
    return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}
function isMainProcess(entry) {
    return !CHILD_PROCESS_ARG.test(` ${entry.commandLine}`);
}
function samePath(left, right) {
    return node_path_1.default.resolve(left).toLowerCase() === node_path_1.default.resolve(right).toLowerCase();
}
function sameAlias(left, right) {
    return Boolean(left) && left.toLowerCase() === right.toLowerCase();
}
function aliasOfProfile(profileDir, data, profilesRoot) {
    const known = registry.sessionByUuid(data, (0, identity_1.readDesktopAccountUuid)(profileDir));
    if (known)
        return known.alias;
    if (!samePath(node_path_1.default.dirname(profileDir), profilesRoot))
        return null;
    return registry.findSession(data, node_path_1.default.basename(profileDir))?.alias ?? null;
}
function defaultWindowDeps() {
    return {
        defaultProfileDir: (0, paths_1.desktopProfileDir)(),
        profilesRoot: (0, paths_1.desktopProfilesRoot)(),
        registryFile: undefined,
        slotOf: alias => (0, paths_1.sessionSlot)(alias),
        listProcesses: processes_1.listClaudeProcesses,
        launch: desktop_app_1.launch,
        launchDefault: () => {
            const target = (0, desktop_app_1.launchTarget)((0, desktop_app_1.locateApp)());
            (0, desktop_app_1.launch)(target.command, target.args);
        },
        profileLauncher: () => (0, desktop_app_1.profileLaunchTarget)((0, desktop_app_1.locateApp)()),
        pause: processes_1.pauseSync,
        now: () => new Date(),
    };
}
function createDesktopWindows(overrides = {}) {
    const deps = { ...defaultWindowDeps(), ...overrides };
    const readRegistry = () => registry.read(deps.registryFile);
    function profileDirOf(alias) {
        return node_path_1.default.join(deps.profilesRoot, (0, paths_1.assertValidAlias)(alias));
    }
    function hasLogin(profileDir) {
        return session.hasAccountConfig((0, paths_1.desktopConfigPath)(profileDir));
    }
    function defaultAlias(data = readRegistry()) {
        return aliasOfProfile(deps.defaultProfileDir, data, deps.profilesRoot);
    }
    function list(data = readRegistry()) {
        return deps
            .listProcesses()
            .filter(isMainProcess)
            .map(entry => {
            const dir = userDataDirOf(entry.commandLine);
            const isDefault = !dir || samePath(dir, deps.defaultProfileDir);
            const profileDir = isDefault ? deps.defaultProfileDir : dir;
            return { pid: entry.pid, profileDir, isDefault, alias: aliasOfProfile(profileDir, data, deps.profilesRoot) };
        });
    }
    function slotHasDesktop(alias) {
        return session.hasAccountConfig(node_path_1.default.join(deps.slotOf(alias), session.CONFIG_FILE));
    }
    function ready(alias, data = readRegistry()) {
        return sameAlias(defaultAlias(data), alias) || hasLogin(profileDirOf(alias)) || slotHasDesktop(alias);
    }
    function prepare(target) {
        const profileDir = profileDirOf(target.alias);
        if (hasLogin(profileDir))
            return false;
        const slot = deps.slotOf(target.alias);
        const items = session.restoreDesktop(node_path_1.default.join(slot, session.SLOT_DESKTOP_DIR), profileDir);
        if (!items.length || !session.restoreConfig(node_path_1.default.join(slot, session.CONFIG_FILE), (0, paths_1.desktopConfigPath)(profileDir))) {
            throw new Error(`${target.name} has no saved Claude Desktop login yet. Press Add Desktop account, sign in with it, then press Save Desktop login.`);
        }
        session.writeWindowMarker(slot, { profileDir, movedAt: deps.now().toISOString() });
        return true;
    }
    function launchProfile(profileDir) {
        const target = deps.profileLauncher();
        deps.launch(target.command, [...target.args, `--user-data-dir=${profileDir}`]);
    }
    function reveal(profileDir) {
        let waited = 0;
        while (!list().some(entry => samePath(entry.profileDir, profileDir))) {
            if (waited >= exports.REVEAL_TIMEOUT_MS)
                return;
            deps.pause(exports.REVEAL_POLL_MS);
            waited += exports.REVEAL_POLL_MS;
        }
        deps.pause(exports.REVEAL_SETTLE_MS);
        launchProfile(profileDir);
    }
    function open(alias) {
        const data = readRegistry();
        const target = registry.findSession(data, alias);
        if (!target)
            throw new Error(`No saved session for "${alias}".`);
        const running = list(data).find(entry => sameAlias(entry.alias, target.alias)) ?? null;
        const base = { alias: target.alias, name: target.name };
        if (running?.isDefault || (!running && sameAlias(defaultAlias(data), target.alias))) {
            deps.launchDefault();
            return { ...base, profileDir: deps.defaultProfileDir, isDefault: true, action: running ? 'focused' : 'opened' };
        }
        const profileDir = running?.profileDir ?? profileDirOf(target.alias);
        const prepared = running ? false : prepare(target);
        launchProfile(profileDir);
        if (!running)
            reveal(profileDir);
        return { ...base, profileDir, isDefault: false, action: running ? 'focused' : prepared ? 'prepared' : 'opened' };
    }
    return { defaultAlias, list, open, profileDirOf, ready };
}
