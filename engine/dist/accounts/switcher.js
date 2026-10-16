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
exports.SETTLE_MS = exports.EXIT_POLL_MS = exports.EXIT_TIMEOUT_MS = exports.CONFIG_FILE = exports.CODE_FILE = exports.DESKTOP_SUBDIR = void 0;
exports.createSwitcher = createSwitcher;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const desktop_app_1 = require("./desktop-app");
const identity_1 = require("./identity");
const installs_1 = require("./installs");
const paths_1 = require("./paths");
const processes_1 = require("./processes");
const usage = __importStar(require("./usage"));
const registry = __importStar(require("./registry"));
const session = __importStar(require("./session-store"));
exports.DESKTOP_SUBDIR = 'desktop';
exports.CODE_FILE = 'code.json';
exports.CONFIG_FILE = session.CONFIG_FILE;
exports.EXIT_TIMEOUT_MS = 20_000;
exports.EXIT_POLL_MS = 250;
exports.SETTLE_MS = 750;
function sameEmail(left, right) {
    return left.toLowerCase() === right.toLowerCase();
}
function defaultDeps() {
    return {
        profileDir: (0, paths_1.desktopProfileDir)(),
        credPath: (0, paths_1.codeCredentialsPath)(),
        accountPath: (0, paths_1.codeAccountPath)(),
        installs: (0, installs_1.claudeInstalls)(),
        slotOf: alias => (0, paths_1.sessionSlot)(alias),
        registryFile: undefined,
        readIdentity: identity_1.readIdentity,
        listProcesses: processes_1.listClaudeProcesses,
        kill: processes_1.killPids,
        launch: desktop_app_1.launch,
        locate: desktop_app_1.locateApp,
        pause: processes_1.pauseSync,
        now: () => new Date(),
    };
}
function createSwitcher(overrides = {}) {
    const deps = { ...defaultDeps(), ...overrides };
    const readRegistry = () => registry.read(deps.registryFile);
    const writeRegistry = (data) => registry.write(data, deps.registryFile);
    const lookupSavedAccount = (uuid) => registry.sessionByUuid(readRegistry(), uuid);
    const installs = [
        { id: installs_1.CODE_INSTALL, label: installs_1.PRIMARY_INSTALL_LABEL, accountPath: deps.accountPath, credPath: deps.credPath },
        ...(deps.installs ?? []).filter(entry => entry.id !== installs_1.CODE_INSTALL),
    ];
    function installFor(id) {
        const wanted = id || installs_1.CODE_INSTALL;
        const found = installs.find(entry => entry.id === wanted);
        if (!found)
            throw new Error(`Unknown Claude install "${wanted}".`);
        return found;
    }
    function accountOf(install) {
        return install.id === installs_1.CODE_INSTALL ? currentIdentity() : (0, identity_1.readCodeAccount)(install.accountPath);
    }
    function installStates(data) {
        return installs.map(install => {
            const account = accountOf(install);
            const saved = account ? registry.sessionByEmail(data, account.email) : null;
            return {
                id: install.id,
                label: install.label,
                signedIn: Boolean(account),
                email: account?.email ?? null,
                name: account?.name ?? null,
                accountUuid: account?.accountUuid ?? null,
                alias: saved?.alias ?? null,
                saved: Boolean(saved?.installs.includes(install.id)),
            };
        });
    }
    function currentIdentity() {
        return deps.readIdentity(deps.profileDir, { codeAccountPath: deps.accountPath, lookup: lookupSavedAccount });
    }
    function currentAccountUuid() {
        return (0, identity_1.readDesktopAccountUuid)(deps.profileDir);
    }
    function desktopRunning() {
        return deps.listProcesses().map(entry => entry.pid);
    }
    function emailOfAlias(alias, data) {
        return registry.findSession(data, alias)?.email ?? null;
    }
    function saveCodeInto(alias, data, install, email) {
        const slot = deps.slotOf(alias);
        return {
            codeSaved: session.snapshotCode(install.credPath, node_path_1.default.join(slot, (0, installs_1.installFileName)(install.id))),
            accountSaved: session.snapshotAccount(install.accountPath, node_path_1.default.join(slot, (0, installs_1.accountFileName)(install.id)), email ?? emailOfAlias(alias, data)),
        };
    }
    function saveDesktopInto(alias) {
        const slot = deps.slotOf(alias);
        return {
            desktopItems: session.snapshotDesktop(deps.profileDir, node_path_1.default.join(slot, exports.DESKTOP_SUBDIR)),
            configSaved: session.snapshotConfig((0, paths_1.desktopConfigPath)(deps.profileDir), node_path_1.default.join(slot, exports.CONFIG_FILE)),
        };
    }
    function saveInto(alias, data, install = installFor(installs_1.CODE_INSTALL), email = null) {
        const desktop = saveDesktopInto(alias);
        const code = saveCodeInto(alias, data, install, email);
        return {
            desktopItems: desktop.desktopItems,
            codeSaved: code.codeSaved,
            accountSaved: code.accountSaved,
            configSaved: desktop.configSaved,
        };
    }
    function currentCodeIdentity(install = installs_1.CODE_INSTALL) {
        return (0, identity_1.readCodeAccount)(installFor(install).accountPath);
    }
    function fallbackAccount(target) {
        const account = { emailAddress: target.email, displayName: target.name };
        if (target.accountUuid)
            account.accountUuid = target.accountUuid;
        if (target.orgUuid)
            account.organizationUuid = target.orgUuid;
        return account;
    }
    function restoreAccountFor(slot, install, target) {
        return session.restoreAccount(node_path_1.default.join(slot, (0, installs_1.accountFileName)(install.id)), install.accountPath, fallbackAccount(target));
    }
    function stopDesktop() {
        const pids = desktopRunning();
        if (!pids.length)
            return 0;
        deps.kill(pids);
        let waited = 0;
        while (desktopRunning().length) {
            if (waited >= exports.EXIT_TIMEOUT_MS)
                throw new Error('Claude Desktop did not close. Quit it from the tray and try again.');
            deps.pause(exports.EXIT_POLL_MS);
            waited += exports.EXIT_POLL_MS;
        }
        deps.pause(exports.SETTLE_MS);
        return pids.length;
    }
    function relaunchDesktop() {
        const target = (0, desktop_app_1.launchTarget)(deps.locate());
        deps.launch(target.command, target.args);
    }
    function syncCode(install) {
        const identity = (0, identity_1.readCodeAccount)(install.accountPath);
        if (!identity)
            throw new Error(`${install.label} is not signed in. Run "claude auth login" first, then save.`);
        const data = readRegistry();
        const known = registry.sessionByEmail(data, identity.email);
        const alias = known?.alias ?? (0, paths_1.deriveAlias)(identity.email);
        saveCodeInto(alias, data, install, identity.email);
        writeRegistry(registry.saveSession(data, {
            alias,
            email: identity.email,
            name: known?.name ?? identity.name,
            accountUuid: identity.accountUuid ?? known?.accountUuid ?? null,
            orgUuid: known?.orgUuid ?? null,
            installs: [install.id],
        }, deps.now()));
        return { alias, email: identity.email, name: known?.name ?? identity.name, accountUuid: identity.accountUuid, install: install.id, stopped: 0, relaunched: false };
    }
    function sync(options = {}) {
        const install = installFor(options.install);
        if (options.codeOnly)
            return syncCode(install);
        const identity = accountOf(install);
        if (!identity) {
            throw new Error(install.id === installs_1.CODE_INSTALL
                ? 'No Claude account detected. Sign in to Claude Desktop or Claude Code first, then save.'
                : `No account signed in to ${install.label}. Sign in there first, then save.`);
        }
        const data = readRegistry();
        const alias = registry.sessionByEmail(data, identity.email)?.alias ?? (0, paths_1.deriveAlias)(identity.email);
        const codeAccount = (0, identity_1.readCodeAccount)(install.accountPath);
        const codeMatches = !codeAccount || sameEmail(codeAccount.email, identity.email);
        const stopped = options.stop === false ? 0 : stopDesktop();
        const relaunched = Boolean(stopped) && options.relaunch !== false;
        try {
            saveDesktopInto(alias);
            if (codeMatches)
                saveCodeInto(alias, data, install, identity.email);
            writeRegistry(registry.saveSession(data, {
                alias,
                email: identity.email,
                name: identity.name,
                accountUuid: identity.accountUuid,
                orgUuid: activeOrgUuid() ?? registry.findSession(data, alias)?.orgUuid ?? null,
                installs: codeMatches ? [install.id] : registry.findSession(data, alias)?.installs ?? [],
            }, deps.now()));
        }
        finally {
            if (relaunched)
                relaunchDesktop();
        }
        return {
            alias,
            email: identity.email,
            name: identity.name,
            accountUuid: identity.accountUuid,
            install: install.id,
            stopped,
            relaunched,
        };
    }
    function desktopCaptured(alias) {
        try {
            return node_fs_1.default.readdirSync(node_path_1.default.join(deps.slotOf(alias), exports.DESKTOP_SUBDIR)).length > 0;
        }
        catch {
            return false;
        }
    }
    function checkDesktopSwitch(alias) {
        const target = registry.findSession(readRegistry(), alias);
        if (!target)
            throw new Error(`No saved session for "${alias}".`);
        if (!desktopCaptured(target.alias)) {
            throw new Error(`${target.name} has no saved Claude Desktop login yet. Sign in to Claude Desktop with it once and save it.`);
        }
        deps.locate();
        return target;
    }
    function checkDesktopSave() {
        const identity = currentIdentity();
        if (!identity)
            throw new Error('Claude Desktop is not signed in. Sign in first, then save its login.');
        deps.locate();
        return identity;
    }
    function autoSyncCode() {
        const identity = currentCodeIdentity() ?? currentIdentity();
        if (!identity)
            return null;
        const known = registry.sessionByEmail(readRegistry(), identity.email);
        if (!known)
            return null;
        const slotCode = node_path_1.default.join(deps.slotOf(known.alias), exports.CODE_FILE);
        try {
            const current = session.readCodeBlock(deps.credPath);
            if (!current)
                return null;
            const previous = node_fs_1.default.existsSync(slotCode) ? JSON.parse(node_fs_1.default.readFileSync(slotCode, 'utf8')) : null;
            if (JSON.stringify(previous) === JSON.stringify(current))
                return { alias: known.alias, updated: false };
            session.snapshotCode(deps.credPath, slotCode);
            session.snapshotAccount(deps.accountPath, node_path_1.default.join(deps.slotOf(known.alias), (0, installs_1.accountFileName)(installs_1.CODE_INSTALL)), known.email);
            return { alias: known.alias, updated: true };
        }
        catch {
            return null;
        }
    }
    function activeOrgUuid() {
        return usage.activeOrgUuid(usage.readSamples(deps.profileDir));
    }
    function rememberActiveOrg(data, activeAlias, orgUuid) {
        if (!activeAlias || !orgUuid)
            return data;
        const known = registry.findSession(data, activeAlias);
        if (!known || known.orgUuid === orgUuid)
            return data;
        return writeRegistry(registry.saveSession(data, { ...known, orgUuid }, deps.now()));
    }
    function listSessions() {
        autoSyncCode();
        let data = readRegistry();
        const identity = currentIdentity();
        const activeUuid = currentAccountUuid();
        const activeEmail = identity ? identity.email.toLowerCase() : null;
        const isActive = (entry) => activeUuid && entry.accountUuid ? entry.accountUuid === activeUuid : activeEmail === entry.email.toLowerCase();
        const samples = usage.readSamples(deps.profileDir);
        const liveOrg = usage.activeOrgUuid(samples);
        const activeAlias = (data.sessions ?? []).find(isActive)?.alias ?? null;
        data = rememberActiveOrg(data, activeAlias, liveOrg);
        return {
            running: desktopRunning().length > 0,
            current: identity,
            accountUuid: activeUuid,
            unknownAccount: Boolean(activeUuid && !identity),
            installs: installStates(data),
            sessions: (data.sessions ?? []).map(entry => ({
                ...entry,
                active: isActive(entry),
                desktopCaptured: desktopCaptured(entry.alias),
                usage: usage.usageFor(samples, entry.orgUuid),
            })),
        };
    }
    function restoreFrom(alias, data, target) {
        const slot = deps.slotOf(alias);
        if (!node_fs_1.default.existsSync(slot))
            throw new Error(`No saved session for "${alias}". Sync it first.`);
        const restoredInstalls = target.installs
            .filter(id => installs.some(entry => entry.id === id))
            .filter(id => session.restoreCode(node_path_1.default.join(slot, (0, installs_1.installFileName)(id)), installFor(id).credPath));
        for (const id of restoredInstalls)
            restoreAccountFor(slot, installFor(id), target);
        return {
            desktopItems: session.restoreDesktop(node_path_1.default.join(slot, exports.DESKTOP_SUBDIR), deps.profileDir),
            codeRestored: restoredInstalls.length > 0,
            configRestored: session.restoreConfig(node_path_1.default.join(slot, exports.CONFIG_FILE), (0, paths_1.desktopConfigPath)(deps.profileDir)),
        };
    }
    function installsSignedInAs(email) {
        const wanted = email.toLowerCase();
        return installs.filter(install => {
            const account = (0, identity_1.readCodeAccount)(install.accountPath);
            return Boolean(account && account.email.toLowerCase() === wanted);
        });
    }
    function switchTo(alias, options = {}) {
        const data = readRegistry();
        const target = registry.findSession(data, alias);
        if (!target)
            throw new Error(`No saved session for "${alias}".`);
        const identity = currentIdentity();
        const relaunched = options.relaunch !== false;
        const stopped = stopDesktop();
        try {
            return { ...swapLogins(target, identity, data, options), stopped, relaunched };
        }
        finally {
            if (relaunched)
                relaunchDesktop();
        }
    }
    function swapLogins(target, identity, saved, options) {
        let data = saved;
        const codeIdentity = currentCodeIdentity();
        const splitLogins = Boolean(codeIdentity && identity && !sameEmail(codeIdentity.email, identity.email));
        if (options.snapshotCurrent !== false && splitLogins) {
            const desktopKnown = identity && !sameEmail(identity.email, target.email) ? registry.sessionByEmail(data, identity.email) : null;
            if (desktopKnown)
                saveDesktopInto(desktopKnown.alias);
            const codeKnown = codeIdentity && !sameEmail(codeIdentity.email, target.email) ? registry.sessionByEmail(data, codeIdentity.email) : null;
            if (codeKnown)
                saveCodeInto(codeKnown.alias, data, installFor(installs_1.CODE_INSTALL), codeKnown.email);
        }
        else if (options.snapshotCurrent !== false && identity && !sameEmail(identity.email, target.email)) {
            const known = registry.sessionByEmail(data, identity.email);
            if (known) {
                const matching = installsSignedInAs(identity.email);
                const capture = matching.length ? matching : [installFor(installs_1.CODE_INSTALL)];
                for (const install of capture)
                    saveInto(known.alias, data, install, known.email);
                data = writeRegistry(registry.saveSession(data, { ...known, installs: capture.map(install => install.id) }, deps.now()));
            }
        }
        const restored = restoreFrom(target.alias, data, target);
        return { alias: target.alias, email: target.email, name: target.name, ...restored };
    }
    function switchCode(alias, options = {}) {
        const data = readRegistry();
        const target = registry.findSession(data, alias);
        if (!target)
            throw new Error(`No saved session for "${alias}".`);
        const install = installFor(options.install);
        const slot = deps.slotOf(target.alias);
        const slotFile = node_path_1.default.join(slot, (0, installs_1.installFileName)(install.id));
        if (!node_fs_1.default.existsSync(slotFile))
            throw new Error(`No saved Claude Code login for "${target.alias}".`);
        let previous = null;
        const current = (0, identity_1.readCodeAccount)(install.accountPath);
        if (current && !sameEmail(current.email, target.email)) {
            const known = registry.sessionByEmail(data, current.email);
            if (known) {
                saveCodeInto(known.alias, data, install, known.email);
                previous = known.alias;
            }
        }
        session.restoreCode(slotFile, install.credPath);
        const accountRestored = restoreAccountFor(slot, install, target);
        return { alias: target.alias, email: target.email, name: target.name, install: install.id, previous, accountRestored };
    }
    function forget(alias) {
        const data = readRegistry();
        if (!registry.findSession(data, alias))
            throw new Error(`No saved session for "${alias}".`);
        writeRegistry(registry.removeSession(data, alias));
        node_fs_1.default.rmSync(deps.slotOf(alias), { recursive: true, force: true });
        return { alias };
    }
    return {
        autoSyncCode,
        checkDesktopSave,
        checkDesktopSwitch,
        currentAccountUuid,
        currentIdentity,
        forget,
        listSessions,
        switchTo,
        switchCode,
        currentCodeIdentity,
        sync,
    };
}
