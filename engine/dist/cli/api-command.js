"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deckState = deckState;
exports.runApi = runApi;
exports.runApiCommand = runApiCommand;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const auto_rank_1 = require("../accounts/auto-rank");
const auto_switch_1 = require("../accounts/auto-switch");
const live_usage_1 = require("../accounts/live-usage");
const switcher_1 = require("../accounts/switcher");
const json_1 = require("../core/fs/json");
const paths_1 = require("../core/paths");
const service_1 = require("../service/service");
const usage_command_1 = require("./usage-command");
function aliasOf(body, question) {
    if (typeof body.alias !== 'string' || !body.alias)
        throw new Error(question);
    return body.alias;
}
function binPath() {
    return node_path_1.default.resolve(__dirname, '..', '..', 'bin', 'claudedeck.js');
}
async function deckState(refresh) {
    const switcher = (0, switcher_1.createSwitcher)();
    const listing = switcher.listSessions();
    const code = switcher.currentCodeIdentity();
    const codeEmail = code?.email.toLowerCase() ?? null;
    const fresh = refresh ? await (0, usage_command_1.refreshLiveUsage)(listing.sessions, true) : {};
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
        desktop: listing.current ? { email: listing.current.email, name: listing.current.name } : null,
        desktopRunning: listing.running,
        shareSession: listing.shareSession,
        sessions: listing.sessions.map(entry => ({
            alias: entry.alias,
            email: entry.email,
            name: entry.name,
            desktopActive: entry.active,
            desktopCaptured: entry.desktopCaptured,
            windowOpen: entry.instance.running,
            desktopUsage: entry.usage,
        })),
        live,
        ranked,
        next: (0, auto_rank_1.nextPick)(ranked, auto.preferredNext)?.alias ?? null,
        auto: {
            running: (0, auto_switch_1.isRunning)(auto, now),
            settings: auto.settings,
            preferredNext: auto.preferredNext,
            held: auto.held,
            lastDecision: auto.lastDecision,
            lastSwitchAt: auto.lastSwitchAt,
        },
    };
}
function knownAliases() {
    return (0, switcher_1.createSwitcher)().listSessions().sessions.map(entry => entry.alias);
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
            return deckState(body.refresh === true);
        case 'schedule':
            return (0, service_1.createService)().scheduleState();
        case 'schedule/save':
            return (0, service_1.createService)().saveSchedule(body);
        case 'schedule/start':
            return (0, service_1.createService)().startBackground();
        case 'schedule/stop':
            return (0, service_1.createService)().stopBackground();
        case 'schedule/run':
            return (0, service_1.createService)().runNow();
        case 'schedule/log':
            return (0, service_1.createService)().readLog(typeof body.limit === 'number' ? body.limit : 200);
        case 'accounts/save':
            return (0, switcher_1.createSwitcher)().sync({
                install: typeof body.install === 'string' ? body.install : undefined,
                codeOnly: body.codeOnly === true,
            });
        case 'accounts/switch':
            return body.code === true
                ? (0, switcher_1.createSwitcher)().switchCode(aliasOf(body, 'Which account should Claude Code use?'))
                : (0, switcher_1.createSwitcher)().switchTo(aliasOf(body, 'Which account should I switch to?'));
        case 'accounts/forget':
            return (0, switcher_1.createSwitcher)().forget(aliasOf(body, 'Which account should I forget?'));
        case 'accounts/open':
            return (0, switcher_1.createSwitcher)().openAccount(aliasOf(body, 'Which account should I open?'), { fresh: body.fresh === true });
        case 'accounts/close':
            return (0, switcher_1.createSwitcher)().closeAccount(aliasOf(body, 'Which account should I close?'));
        case 'accounts/sharing':
            if (typeof body.enabled !== 'boolean')
                throw new Error('Should shared history be on or off?');
            return (0, switcher_1.createSwitcher)().setSharing(body.enabled);
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
            return { script: (0, auto_switch_1.installAutoTask)((0, paths_1.userDataDir)(), binPath()) };
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
    const [, route = 'state', raw] = argv;
    try {
        const text = raw === '-' ? readStdin() : raw ?? '';
        const body = text.trim() ? JSON.parse(text) : {};
        const data = await runApi(route, body);
        process.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
    }
    catch (error) {
        process.stdout.write(`${JSON.stringify({ ok: false, error: (0, json_1.errorMessage)(error) })}\n`);
    }
}
