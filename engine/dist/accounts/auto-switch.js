"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASK_NAME = exports.HOT_INTERVAL_MS = exports.HOT_PERCENT = exports.DEFAULT_AUTO_SETTINGS = void 0;
exports.normalizeAutoState = normalizeAutoState;
exports.readAutoState = readAutoState;
exports.updateAutoState = updateAutoState;
exports.setPreferredNext = setPreferredNext;
exports.setHeld = setHeld;
exports.markManualSwitch = markManualSwitch;
exports.isRunning = isRunning;
exports.defaultAutoDeps = defaultAutoDeps;
exports.createAutoSwitch = createAutoSwitch;
exports.launcherScript = launcherScript;
exports.installAutoTask = installAutoTask;
exports.removeAutoTask = removeAutoTask;
exports.launcherBin = launcherBin;
exports.launcherIsStale = launcherIsStale;
exports.syncAutoLauncher = syncAutoLauncher;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const json_1 = require("../core/fs/json");
const auto_rank_1 = require("./auto-rank");
const cswap_sync_1 = require("./cswap-sync");
const live_usage_1 = require("./live-usage");
const paths_1 = require("./paths");
exports.DEFAULT_AUTO_SETTINGS = { threshold: 95, landing: 85, cooldownSeconds: 60, intervalSeconds: 20 };
exports.HOT_PERCENT = 80;
exports.HOT_INTERVAL_MS = 15_000;
exports.TASK_NAME = 'ClaudeDeck Auto Switch';
const LOG_LIMIT = 1_000_000;
function number(value, fallback, min, max) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
function normalizeAutoState(value) {
    const source = (value && typeof value === 'object' ? value : {});
    const settings = (source.settings ?? {});
    return {
        settings: {
            threshold: number(settings.threshold, exports.DEFAULT_AUTO_SETTINGS.threshold, 50, 100),
            landing: number(settings.landing, exports.DEFAULT_AUTO_SETTINGS.landing, 10, 99),
            cooldownSeconds: number(settings.cooldownSeconds, exports.DEFAULT_AUTO_SETTINGS.cooldownSeconds, 0, 3600),
            intervalSeconds: number(settings.intervalSeconds, exports.DEFAULT_AUTO_SETTINGS.intervalSeconds, 5, 600),
        },
        preferredNext: typeof source.preferredNext === 'string' && source.preferredNext ? source.preferredNext : null,
        held: Array.isArray(source.held) ? source.held.filter((alias) => typeof alias === 'string') : [],
        lastSwitchAt: typeof source.lastSwitchAt === 'string' ? source.lastSwitchAt : null,
        lastManualSwitchAt: typeof source.lastManualSwitchAt === 'string' ? source.lastManualSwitchAt : null,
        lastDesktopSwitchAt: typeof source.lastDesktopSwitchAt === 'string' ? source.lastDesktopSwitchAt : null,
        lastDecision: source.lastDecision ?? null,
        lastDesktopDecision: source.lastDesktopDecision ?? null,
        heartbeatAt: typeof source.heartbeatAt === 'string' ? source.heartbeatAt : null,
        pid: typeof source.pid === 'number' ? source.pid : null,
    };
}
function readAutoState(file = (0, paths_1.autoStatePath)()) {
    return normalizeAutoState((0, json_1.readJsonFile)(file));
}
function updateAutoState(change, file = (0, paths_1.autoStatePath)()) {
    const next = normalizeAutoState(change(readAutoState(file)));
    (0, json_1.writeJsonFile)(file, next);
    return next;
}
function setPreferredNext(alias, known, file) {
    if (alias && !known.some(entry => entry.toLowerCase() === alias.toLowerCase()))
        throw new Error(`No saved account "${alias}".`);
    const match = alias ? known.find(entry => entry.toLowerCase() === alias.toLowerCase()) ?? alias : null;
    return updateAutoState(state => ({ ...state, preferredNext: match }), file);
}
function setHeld(alias, hold, known, file) {
    const match = known.find(entry => entry.toLowerCase() === alias.toLowerCase());
    if (!match)
        throw new Error(`No saved account "${alias}".`);
    return updateAutoState(state => {
        const rest = state.held.filter(entry => entry.toLowerCase() !== match.toLowerCase());
        return {
            ...state,
            held: hold ? [...rest, match] : rest,
            preferredNext: hold && state.preferredNext?.toLowerCase() === match.toLowerCase() ? null : state.preferredNext,
        };
    }, file);
}
function markManualSwitch(now = new Date(), file) {
    return updateAutoState(state => ({ ...state, lastManualSwitchAt: now.toISOString() }), file);
}
function isRunning(state, now, selfPid = process.pid) {
    if (!state.pid || state.pid === selfPid || !state.heartbeatAt)
        return false;
    if (now.getTime() - Date.parse(state.heartbeatAt) > state.settings.intervalSeconds * 3000)
        return false;
    try {
        process.kill(state.pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
function defaultAutoDeps(switcher, logFile) {
    const file = logFile ?? node_path_1.default.join(node_path_1.default.dirname((0, paths_1.autoStatePath)()), 'auto.log');
    return {
        switcher,
        refresh: (targets, minIntervalMs) => (0, live_usage_1.createLiveUsage)({ minIntervalMs }).refreshAll(targets),
        stateFile: (0, paths_1.autoStatePath)(),
        credPath: (0, paths_1.codeCredentialsPath)(),
        slotFile: alias => node_path_1.default.join((0, paths_1.sessionSlot)(alias), 'code.json'),
        now: () => new Date(),
        cswap: (0, cswap_sync_1.cswapAvailable)() ? (0, cswap_sync_1.createCswapWatcher)((0, cswap_sync_1.defaultSyncDeps)()) : null,
        log: line => {
            try {
                if (node_fs_1.default.existsSync(file) && node_fs_1.default.statSync(file).size > LOG_LIMIT)
                    node_fs_1.default.renameSync(file, `${file}.1`);
                node_fs_1.default.mkdirSync(node_path_1.default.dirname(file), { recursive: true });
                node_fs_1.default.appendFileSync(file, `${new Date().toISOString()} ${line}\n`, 'utf8');
            }
            catch {
                return;
            }
        },
    };
}
function createAutoSwitch(deps) {
    function syncCswap() {
        if (!deps.cswap)
            return;
        try {
            const synced = deps.cswap.check();
            if (synced && (synced.pulled.length || synced.pushed.length)) {
                deps.log(`cswap sync: pulled ${synced.pulled.join(', ') || 'none'}, pushed ${synced.pushed.join(', ') || 'none'}`);
            }
        }
        catch (error) {
            deps.log(`cswap sync failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async function tick(options = {}) {
        if (!options.dryRun)
            syncCswap();
        const listing = deps.switcher.listSessions();
        const codeEmail = deps.switcher.currentCodeIdentity()?.email ?? null;
        const targets = (0, live_usage_1.targetsFor)(listing.sessions, codeEmail, deps.credPath, deps.slotFile);
        const state = readAutoState(deps.stateFile);
        const activeTarget = targets.find(target => target.active);
        const activeCached = activeTarget ? (0, live_usage_1.cachedUsage)(activeTarget.alias) : null;
        const activeUsed = Math.max(activeCached?.fiveHour?.usedPercent ?? 0, activeCached?.sevenDay?.usedPercent ?? 0);
        const live = {
            ...(await deps.refresh(targets.filter(target => !target.active), live_usage_1.MIN_INTERVAL_MS)),
            ...(activeTarget ? await deps.refresh([activeTarget], activeUsed >= exports.HOT_PERCENT ? exports.HOT_INTERVAL_MS : live_usage_1.MIN_INTERVAL_MS) : {}),
        };
        const now = deps.now();
        const entries = targets.map(target => ({
            alias: target.alias,
            email: listing.sessions.find(entry => entry.alias === target.alias)?.email ?? '',
            active: target.active,
        }));
        const accounts = (0, auto_rank_1.toRanked)(entries, live, state, now.getTime());
        const decision = (0, auto_rank_1.decide)(accounts, state, now);
        let switched = false;
        if (decision.action === 'switch' && decision.target && !options.dryRun) {
            deps.switcher.switchCode(decision.target);
            switched = true;
            deps.log(`switch ${decision.from ?? '?'} -> ${decision.target} (${decision.trigger}): ${decision.reason}`);
        }
        const after = switched ? accounts.map(entry => ({ ...entry, active: entry.alias === decision.target })) : accounts;
        const desktopAlias = listing.sessions.find(entry => entry.active)?.alias ?? null;
        const canDesktop = (alias) => Boolean(listing.sessions.find(entry => entry.alias === alias)?.desktopCaptured);
        const desktopDecision = (0, auto_rank_1.decideDesktop)(after, desktopAlias, canDesktop, state, now);
        const stored = updateAutoState(current => ({
            ...current,
            lastSwitchAt: switched ? now.toISOString() : current.lastSwitchAt,
            preferredNext: switched && current.preferredNext?.toLowerCase() === decision.target?.toLowerCase() ? null : current.preferredNext,
            lastDecision: decision,
            lastDesktopDecision: desktopDecision,
            heartbeatAt: options.dryRun ? current.heartbeatAt : now.toISOString(),
            pid: options.dryRun ? current.pid : process.pid,
        }), deps.stateFile);
        if (!options.dryRun)
            syncCswap();
        return { decision, accounts: after, next: (0, auto_rank_1.nextPick)(after, stored.preferredNext), switched, desktopDecision };
    }
    async function run(onTick, signal) {
        const start = readAutoState(deps.stateFile);
        if (isRunning(start, deps.now()))
            throw new Error(`Auto switch already runs as process ${start.pid}.`);
        deps.log('auto switch started');
        while (!signal?.aborted) {
            try {
                onTick(await tick());
            }
            catch (error) {
                deps.log(`tick failed: ${error instanceof Error ? error.message : String(error)}`);
            }
            const wait = readAutoState(deps.stateFile).settings.intervalSeconds * 1000;
            await new Promise(resolve => {
                const timer = setTimeout(resolve, wait);
                signal?.addEventListener('abort', () => {
                    clearTimeout(timer);
                    resolve();
                });
            });
        }
    }
    return { tick, run };
}
function launcherScript(nodePath, binPath) {
    return [
        'Set shell = CreateObject("WScript.Shell")',
        `shell.Run """${nodePath}"" ""${binPath}"" auto", 0, False`,
        '',
    ].join('\r\n');
}
function installAutoTask(dataDir, binPath, nodePath = process.execPath) {
    if (process.platform !== 'win32')
        throw new Error('Starting auto switch at sign in is only set up on Windows so far. Run "claudedeck auto" yourself.');
    const script = node_path_1.default.join(dataDir, 'auto-switch.vbs');
    node_fs_1.default.mkdirSync(dataDir, { recursive: true });
    node_fs_1.default.writeFileSync(script, launcherScript(nodePath, binPath), 'utf8');
    const ps = [
        `$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument '"${script}"'`,
        "$trigger = New-ScheduledTaskTrigger -AtLogOn -User \"$env:USERDOMAIN\\$env:USERNAME\"",
        '$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew',
        `Register-ScheduledTask -TaskName '${exports.TASK_NAME}' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null`,
        `Start-ScheduledTask -TaskName '${exports.TASK_NAME}'`,
    ].join('; ');
    const run = (0, node_child_process_1.spawnSync)('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true });
    if (run.status !== 0)
        throw new Error(`Could not register the task: ${(run.stderr || run.stdout).trim()}`);
    return script;
}
function removeAutoTask() {
    if (process.platform !== 'win32')
        return false;
    const run = (0, node_child_process_1.spawnSync)('powershell.exe', ['-NoProfile', '-Command', `Unregister-ScheduledTask -TaskName '${exports.TASK_NAME}' -Confirm:$false -ErrorAction SilentlyContinue`], { encoding: 'utf8', windowsHide: true });
    return run.status === 0;
}
function pluginVersion(binPath) {
    const manifest = (0, json_1.readJsonFile)(node_path_1.default.join(node_path_1.default.dirname(binPath), '..', '..', '.claude-plugin', 'plugin.json'));
    const version = typeof manifest?.version === 'string' ? manifest.version : null;
    return version ? version.split('.').map(part => Number.parseInt(part, 10) || 0) : null;
}
function newer(left, right) {
    if (!left)
        return false;
    if (!right)
        return true;
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        const diff = (left[index] ?? 0) - (right[index] ?? 0);
        if (diff !== 0)
            return diff > 0;
    }
    return false;
}
function launcherBin(script) {
    return /""([^"]+claudedeck\.js)""/.exec(script)?.[1] ?? null;
}
function launcherIsStale(script, binPath, exists = node_fs_1.default.existsSync) {
    const current = launcherBin(script);
    if (!current || node_path_1.default.resolve(current) === node_path_1.default.resolve(binPath))
        return false;
    return !exists(current) || newer(pluginVersion(binPath), pluginVersion(current));
}
function syncAutoLauncher(dataDir, binPath, nodePath = process.execPath, stateFile) {
    const script = node_path_1.default.join(dataDir, 'auto-switch.vbs');
    let text;
    try {
        text = node_fs_1.default.readFileSync(script, 'utf8');
    }
    catch {
        return false;
    }
    if (!launcherIsStale(text, binPath))
        return false;
    try {
        node_fs_1.default.writeFileSync(script, launcherScript(nodePath, binPath), 'utf8');
    }
    catch {
        return false;
    }
    const state = readAutoState(stateFile);
    if (state.pid && isRunning(state, new Date())) {
        try {
            process.kill(state.pid);
        }
        catch {
            return true;
        }
    }
    if (process.platform === 'win32')
        (0, node_child_process_1.spawnSync)('schtasks.exe', ['/Run', '/TN', exports.TASK_NAME], { windowsHide: true });
    return true;
}
