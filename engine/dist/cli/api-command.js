"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.desktopSeat = desktopSeat;
exports.desktopNudge = desktopNudge;
exports.deckState = deckState;
exports.runApi = runApi;
exports.runApiCommand = runApiCommand;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const auto_rank_1 = require("../accounts/auto-rank");
const auto_switch_1 = require("../accounts/auto-switch");
const cswap_import_1 = require("../accounts/cswap-import");
const desktop_job_1 = require("../accounts/desktop-job");
const desktop_windows_1 = require("../accounts/desktop-windows");
const live_usage_1 = require("../accounts/live-usage");
const session_handoff_1 = require("../accounts/session-handoff");
const paths_1 = require("../accounts/paths");
const switcher_1 = require("../accounts/switcher");
const json_1 = require("../core/fs/json");
const paths_2 = require("../core/paths");
const schedule_service_1 = require("../service/schedule-service");
const live_refresh_1 = require("./live-refresh");
function aliasOf(body, question) {
    if (typeof body.alias !== 'string' || !body.alias)
        throw new Error(question);
    return body.alias;
}
function textOf(body, key, question) {
    const value = body[key];
    if (typeof value !== 'string' || !value)
        throw new Error(question);
    return value;
}
function desktopSeat(sessions, env = process.env) {
    if (env.CLAUDE_CODE_ENTRYPOINT !== 'claude-desktop')
        return null;
    const uuid = env.CLAUDE_CODE_ACCOUNT_UUID || null;
    const email = env.CLAUDE_CODE_USER_EMAIL?.toLowerCase() || null;
    return sessions.find(entry => (uuid && entry.accountUuid === uuid) || (email && entry.email.toLowerCase() === email)) ?? null;
}
function desktopNudge(ranked, seatAlias, ready, auto, now) {
    if (!seatAlias)
        return null;
    const decision = (0, auto_rank_1.decideDesktop)(ranked, seatAlias, ready, { ...auto, lastDesktopSwitchAt: null }, now);
    if (decision.action !== 'switch' || !decision.target)
        return null;
    return { from: seatAlias, target: decision.target, reason: decision.reason };
}
function binPath() {
    return node_path_1.default.resolve(__dirname, '..', '..', 'bin', 'claudedeck.js');
}
async function deckState(refresh) {
    const switcher = (0, switcher_1.createSwitcher)();
    const listing = switcher.listSessions();
    const windows = (0, desktop_windows_1.createDesktopWindows)();
    const open = windows.list();
    const seat = desktopSeat(listing.sessions);
    const ready = (alias) => windows.ready(alias);
    const code = switcher.currentCodeIdentity();
    const codeEmail = code?.email.toLowerCase() ?? null;
    const fresh = await (0, live_refresh_1.refreshLiveUsage)(listing.sessions, refresh);
    const live = {};
    for (const entry of listing.sessions) {
        live[entry.alias] = fresh[entry.alias.toLowerCase()] ?? (0, live_usage_1.cachedUsage)(entry.alias);
    }
    const auto = (0, auto_switch_1.readAutoState)();
    const now = new Date();
    const ranked = (0, auto_rank_1.toRanked)(listing.sessions.map(entry => ({ alias: entry.alias, email: entry.email, active: entry.email.toLowerCase() === codeEmail })), Object.fromEntries(Object.entries(live).map(([alias, value]) => [alias.toLowerCase(), value])), auto, now.getTime());
    return {
        now: now.toISOString(),
        code: code ? { email: code.email, name: code.name, alias: ranked.find(entry => entry.active)?.alias ?? null } : null,
        desktop: seat ? { email: seat.email, name: seat.name } : listing.current ? { email: listing.current.email, name: listing.current.name } : null,
        desktopRunning: listing.running,
        desktopHome: !seat || seat.alias === windows.defaultAlias(),
        desktopJob: (0, desktop_job_1.readDesktopJob)(),
        sessions: listing.sessions.map(entry => ({
            alias: entry.alias,
            email: entry.email,
            name: entry.name,
            desktopActive: seat ? entry.alias === seat.alias : entry.active,
            desktopCaptured: entry.desktopCaptured,
            windowOpen: open.some(window => window.alias?.toLowerCase() === entry.alias.toLowerCase()),
            windowReady: ready(entry.alias),
            desktopUsage: entry.usage,
        })),
        live,
        ranked,
        next: (0, auto_rank_1.nextPick)(ranked, auto.preferredNext)?.alias ?? null,
        desktopNudge: desktopNudge(ranked, seat?.alias ?? null, ready, auto, now),
        auto: {
            running: (0, auto_switch_1.isRunning)(auto, now),
            settings: auto.settings,
            preferredNext: auto.preferredNext,
            held: auto.held,
            lastDecision: auto.lastDecision,
            lastSwitchAt: auto.lastSwitchAt,
            lastDesktopDecision: auto.lastDesktopDecision,
        },
    };
}
function knownAliases() {
    return (0, switcher_1.createSwitcher)().listSessions().sessions.map(entry => entry.alias);
}
function forgetAccount(alias) {
    const windows = (0, desktop_windows_1.createDesktopWindows)();
    const open = windows.list().find(entry => entry.alias?.toLowerCase() === alias.toLowerCase());
    if (open && !open.isDefault)
        throw new Error('Close the Claude Desktop window of this account first, then forget it.');
    const forgotten = (0, switcher_1.createSwitcher)().forget(alias);
    if ((0, paths_1.isValidAlias)(forgotten.alias))
        node_fs_1.default.rmSync(windows.profileDirOf(forgotten.alias), { recursive: true, force: true });
    return forgotten;
}
function startAuto() {
    if ((0, auto_switch_1.isRunning)((0, auto_switch_1.readAutoState)(), new Date()))
        return { started: false };
    const child = (0, node_child_process_1.spawn)(process.execPath, [binPath(), 'auto'], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return { started: true };
}
async function runApi(route, body = {}) {
    switch (route) {
        case 'state':
            (0, auto_switch_1.syncAutoLauncher)((0, paths_2.userDataDir)(), binPath());
            return deckState(body.refresh === true);
        case 'schedule':
            return (0, schedule_service_1.createScheduleService)().scheduleState();
        case 'schedule/save':
            return (0, schedule_service_1.createScheduleService)().saveSchedule(body);
        case 'schedule/start':
            return (0, schedule_service_1.createScheduleService)().startBackground();
        case 'schedule/stop':
            return (0, schedule_service_1.createScheduleService)().stopBackground();
        case 'schedule/run':
            return (0, schedule_service_1.createScheduleService)().runNow();
        case 'schedule/log':
            return (0, schedule_service_1.createScheduleService)().readLog(typeof body.limit === 'number' ? body.limit : 200);
        case 'accounts/save':
            if (body.codeOnly === true) {
                return (0, switcher_1.createSwitcher)().sync({ install: typeof body.install === 'string' ? body.install : undefined, codeOnly: true });
            }
            (0, switcher_1.createSwitcher)().checkDesktopSave();
            return (0, desktop_job_1.startDesktopJob)('save', null);
        case 'accounts/add-desktop':
            (0, switcher_1.createSwitcher)().checkDesktopAdd();
            return (0, desktop_job_1.startDesktopJob)('add', null);
        case 'accounts/switch': {
            if (body.code === true) {
                const moved = (0, switcher_1.createSwitcher)().switchCode(aliasOf(body, 'Which account should Claude Code use?'));
                (0, auto_switch_1.markManualSwitch)();
                return moved;
            }
            const target = (0, switcher_1.createSwitcher)().checkDesktopSwitch(aliasOf(body, 'Which account should I switch to?'));
            return (0, desktop_job_1.startDesktopJob)('switch', target.alias);
        }
        case 'accounts/window':
            return (0, desktop_windows_1.createDesktopWindows)().open(aliasOf(body, 'Which account should get a Claude Desktop window?'));
        case 'session/handoff': {
            const handed = (0, session_handoff_1.startHandoff)((0, switcher_1.createSwitcher)(), aliasOf(body, 'Which account should continue this session?'), textOf(body, 'sessionId', 'Which session should continue?'), textOf(body, 'cwd', 'Which folder is the session in?'));
            if (handed.movedCode)
                (0, auto_switch_1.markManualSwitch)();
            return handed;
        }
        case 'accounts/forget':
            return forgetAccount(aliasOf(body, 'Which account should I forget?'));
        case 'accounts/import':
            return (0, cswap_import_1.importEnvelope)((0, cswap_import_1.exportFromCswap)());
        case 'auto/next':
            return (0, auto_switch_1.setPreferredNext)(typeof body.alias === 'string' && body.alias ? body.alias : null, knownAliases());
        case 'auto/hold':
            return (0, auto_switch_1.setHeld)(aliasOf(body, 'Which account?'), body.hold !== false, knownAliases());
        case 'auto/settings':
            return (0, auto_switch_1.updateAutoState)(state => ({
                ...state,
                settings: {
                    ...state.settings,
                    ...Object.fromEntries(['threshold', 'landing', 'cooldownSeconds', 'intervalSeconds']
                        .filter(key => typeof body[key] === 'number')
                        .map(key => [key, body[key]])),
                },
            }));
        case 'auto/start':
            return startAuto();
        case 'auto/install':
            return { script: (0, auto_switch_1.installAutoTask)((0, paths_2.userDataDir)(), binPath()) };
        case 'auto/remove':
            return { removed: (0, auto_switch_1.removeAutoTask)() };
        default:
            throw new Error(`Unknown api route "${route}".`);
    }
}
function readStdin() {
    try {
        return node_fs_1.default.readFileSync(0, 'utf8');
    }
    catch {
        return '';
    }
}
async function runApiCommand(argv) {
    const [route = 'state', raw] = argv;
    try {
        const text = (raw === '-' ? readStdin() : raw ?? '').replace(/^﻿/, '');
        const body = text.trim() ? JSON.parse(text) : {};
        const data = await runApi(route, body);
        process.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
    }
    catch (error) {
        process.stdout.write(`${JSON.stringify({ ok: false, error: (0, json_1.errorMessage)(error) })}\n`);
    }
}
