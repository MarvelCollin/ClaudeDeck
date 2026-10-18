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
exports.TEMP_PREFIX = exports.DROPPED_ENV = exports.CONFIG_DIR_ENV = void 0;
exports.hasLiveWindow = hasLiveWindow;
exports.skipReason = skipReason;
exports.warmEnv = warmEnv;
exports.writeConfigDir = writeConfigDir;
exports.readConfigBlock = readConfigBlock;
exports.warmOne = warmOne;
exports.warmAccounts = warmAccounts;
exports.warmLogLines = warmLogLines;
exports.spawnClaude = spawnClaude;
exports.defaultWarmDeps = defaultWarmDeps;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const auto_switch_1 = require("../accounts/auto-switch");
const identity_1 = require("../accounts/identity");
const installs_1 = require("../accounts/installs");
const live_usage_1 = require("../accounts/live-usage");
const paths_1 = require("../accounts/paths");
const registry = __importStar(require("../accounts/registry"));
const session_store_1 = require("../accounts/session-store");
const json_1 = require("../core/fs/json");
const paths_2 = require("../core/paths");
exports.CONFIG_DIR_ENV = 'CLAUDE_CONFIG_DIR';
exports.DROPPED_ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'];
exports.TEMP_PREFIX = 'claudedeck-warm-';
const RUN_TIMEOUT_MS = 3 * 60 * 1000;
function hasLiveWindow(usage, now) {
    const resetsAt = usage?.fiveHour?.resetsAt;
    return Boolean(resetsAt && Date.parse(resetsAt) > now.getTime());
}
function skipReason(usage, held, now) {
    if (held)
        return 'held out of auto switch';
    if (usage?.status === 'relogin')
        return 'login expired, sign in again';
    if (usage?.status === 'no-login')
        return 'no saved Claude Code login';
    if (hasLiveWindow(usage, now))
        return `5h window already running until ${usage?.fiveHour?.resetsAt}`;
    if ((usage?.sevenDay?.usedPercent ?? 0) >= 100)
        return 'weekly limit reached';
    return null;
}
function warmEnv(base, configDir) {
    const env = { ...base, [exports.CONFIG_DIR_ENV]: configDir };
    for (const key of exports.DROPPED_ENV)
        delete env[key];
    return env;
}
function writeConfigDir(dir, block, account) {
    (0, json_1.writeJsonFile)(node_path_1.default.join(dir, '.credentials.json'), { [session_store_1.CODE_KEY]: block });
    (0, json_1.writeJsonFile)(node_path_1.default.join(dir, '.claude.json'), { [session_store_1.ACCOUNT_KEY]: account, hasCompletedOnboarding: true });
}
function readConfigBlock(dir) {
    const block = (0, json_1.readJsonFile)(node_path_1.default.join(dir, '.credentials.json'))?.[session_store_1.CODE_KEY];
    return block && typeof block === 'object' ? block : null;
}
function lastLine(text) {
    return text.trim().split(/\r?\n/).filter(Boolean).pop() ?? '';
}
function failure(run) {
    if (run.error)
        return run.error;
    return lastLine(run.stderr) || lastLine(run.stdout) || `claude exited with ${run.status ?? 'no code'}`;
}
async function warmOne(account, deps) {
    const slot = deps.slotDir(account.alias);
    const slotFile = node_path_1.default.join(slot, (0, installs_1.installFileName)(installs_1.CODE_INSTALL));
    const result = (action, reason, rotated = false) => ({
        alias: account.alias,
        action,
        reason,
        rotated,
    });
    let block = (0, json_1.readJsonFile)(slotFile);
    if (!block || typeof block !== 'object')
        return result('skipped', 'no saved Claude Code login');
    let rotated = false;
    if ((0, live_usage_1.needsRefresh)(block, deps.now())) {
        const refreshed = await (0, live_usage_1.refreshSlot)(slotFile, deps.fetch, deps.now());
        if (refreshed.dead)
            return result('failed', 'login expired, sign in again');
        if (!refreshed.block)
            return result('failed', refreshed.error ?? 'token refresh failed');
        block = refreshed.block;
        rotated = refreshed.rotated;
    }
    const saved = (0, json_1.readJsonFile)(node_path_1.default.join(slot, (0, installs_1.accountFileName)(installs_1.CODE_INSTALL)));
    const oauthAccount = saved && typeof saved === 'object' ? saved : { emailAddress: account.email };
    node_fs_1.default.mkdirSync(deps.tempRoot, { recursive: true });
    const dir = node_fs_1.default.mkdtempSync(node_path_1.default.join(deps.tempRoot, exports.TEMP_PREFIX));
    try {
        writeConfigDir(dir, block, oauthAccount);
        const run = deps.run(deps.invocation(), warmEnv(process.env, dir));
        const after = readConfigBlock(dir);
        if (after && JSON.stringify(after) !== JSON.stringify(block)) {
            (0, json_1.writeJsonFile)(slotFile, after);
            rotated = true;
        }
        if (run.status === 0 && !run.error)
            return result('warmed', 'started the 5h window', rotated);
        return result('failed', failure(run), rotated);
    }
    catch (error) {
        return result('failed', (0, json_1.errorMessage)(error), rotated);
    }
    finally {
        node_fs_1.default.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
}
async function warmAccounts(deps) {
    const accounts = deps.accounts();
    const codeEmail = deps.codeEmail();
    const targets = (0, live_usage_1.targetsFor)(accounts, codeEmail, deps.credPath, alias => node_path_1.default.join(deps.slotDir(alias), (0, installs_1.installFileName)(installs_1.CODE_INSTALL)));
    const idle = targets.filter(target => !target.active);
    const live = idle.length ? await deps.refresh(idle) : {};
    const held = new Set(deps.held().map(alias => alias.toLowerCase()));
    const results = [];
    for (const target of targets) {
        if (target.active) {
            results.push({ alias: target.alias, action: 'skipped', reason: 'Claude Code uses it, the main run covers it', rotated: false });
            continue;
        }
        const usage = live[target.alias.toLowerCase()] ?? null;
        const reason = skipReason(usage, held.has(target.alias.toLowerCase()), deps.now());
        if (reason) {
            results.push({ alias: target.alias, action: 'skipped', reason, rotated: false });
            continue;
        }
        const account = accounts.find(entry => entry.alias === target.alias);
        results.push(await warmOne(account, deps));
    }
    return results;
}
function warmLogLines(results) {
    const warmed = results.filter(entry => entry.action === 'warmed').length;
    const failed = results.filter(entry => entry.action === 'failed').length;
    return [
        ...results.map(entry => `warm ${entry.alias}: ${entry.action}, ${entry.reason}${entry.rotated ? ' (token saved)' : ''}`),
        `warm done: ${warmed} warmed, ${failed} failed, ${results.length - warmed - failed} skipped`,
    ];
}
function spawnClaude(invocation, env, timeout = RUN_TIMEOUT_MS) {
    const run = (0, node_child_process_1.spawnSync)(invocation.command, invocation.args, {
        cwd: paths_2.packageRoot,
        encoding: 'utf8',
        shell: false,
        env,
        timeout,
        windowsHide: true,
    });
    return {
        status: typeof run.status === 'number' ? run.status : null,
        stdout: run.stdout ?? '',
        stderr: run.stderr ?? '',
        error: run.error ? (0, json_1.errorMessage)(run.error) : null,
    };
}
function defaultWarmDeps(invocation) {
    return {
        accounts: () => registry.read().sessions.map(entry => ({ alias: entry.alias, email: entry.email })),
        codeEmail: () => (0, identity_1.readCodeAccount)((0, paths_1.codeAccountPath)())?.email ?? null,
        held: () => (0, auto_switch_1.readAutoState)().held,
        refresh: targets => (0, live_usage_1.createLiveUsage)().refreshAll(targets),
        credPath: (0, paths_1.codeCredentialsPath)(),
        slotDir: alias => (0, paths_1.sessionSlot)(alias),
        tempRoot: node_os_1.default.tmpdir(),
        fetch: globalThis.fetch,
        now: () => new Date(),
        invocation,
        run: (invocation, env) => spawnClaude(invocation, env),
    };
}
