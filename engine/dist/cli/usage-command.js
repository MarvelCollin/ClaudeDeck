"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.codeSlotFile = codeSlotFile;
exports.defaultCodeSlotDeps = defaultCodeSlotDeps;
exports.refreshLiveUsage = refreshLiveUsage;
exports.windowText = windowText;
exports.liveText = liveText;
exports.listJson = listJson;
exports.runUsageCommand = runUsageCommand;
const node_path_1 = __importDefault(require("node:path"));
const identity_1 = require("../accounts/identity");
const live_usage_1 = require("../accounts/live-usage");
const paths_1 = require("../accounts/paths");
const switcher_1 = require("../accounts/switcher");
function codeSlotFile(alias) {
    return node_path_1.default.join((0, paths_1.sessionSlot)(alias), 'code.json');
}
function defaultCodeSlotDeps() {
    return {
        codeEmail: () => (0, identity_1.readCodeAccount)((0, paths_1.codeAccountPath)())?.email ?? null,
        credPath: (0, paths_1.codeCredentialsPath)(),
        slotFile: codeSlotFile,
    };
}
async function refreshLiveUsage(sessions, force = false, deps = defaultCodeSlotDeps()) {
    const targets = (0, live_usage_1.targetsFor)(sessions, deps.codeEmail(), deps.credPath, deps.slotFile);
    return (0, live_usage_1.createLiveUsage)().refreshAll(targets, force);
}
function windowText(label, window, now = Date.now()) {
    if (!window)
        return `${label} n/a`;
    const left = Math.round(100 - window.usedPercent);
    if (!window.resetsAt)
        return `${label} ${left}% left`;
    const minutes = Math.max(0, Math.round((Date.parse(window.resetsAt) - now) / 60000));
    const until = minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
    return `${label} ${left}% left, resets in ${until}`;
}
function liveText(usage) {
    if (!usage)
        return 'not checked yet';
    if (usage.status === 'relogin')
        return 'login expired, sign in again';
    if (usage.status === 'no-login')
        return 'no Claude Code login saved';
    const parts = [windowText('5h', usage.fiveHour), windowText('week', usage.sevenDay)].join('  ');
    return usage.status === 'ok' || usage.fetchedAt ? parts : `${parts}  (${usage.error ?? 'not available'})`;
}
async function listJson(refresh) {
    const listing = (0, switcher_1.createSwitcher)().listSessions();
    const live = refresh ? await refreshLiveUsage(listing.sessions) : {};
    const codeEmail = defaultCodeSlotDeps().codeEmail()?.toLowerCase() ?? null;
    const accounts = listing.sessions.map(entry => ({
        alias: entry.alias,
        email: entry.email,
        name: entry.name,
        codeActive: entry.email.toLowerCase() === codeEmail,
        desktopActive: entry.active,
        desktopCaptured: entry.desktopCaptured,
        windowOpen: entry.instance.running,
        live: live[entry.alias.toLowerCase()] ?? (0, live_usage_1.cachedUsage)(entry.alias),
        desktopUsage: entry.usage,
    }));
    const code = accounts.find(entry => entry.codeActive)?.alias ?? null;
    const desktop = accounts.find(entry => entry.desktopActive)?.alias ?? null;
    return JSON.stringify({ version: 1, codeAccount: code, desktopAccount: desktop, accounts }, null, 2);
}
async function runUsageCommand(force) {
    const listing = (0, switcher_1.createSwitcher)().listSessions();
    if (!listing.sessions.length) {
        console.log('No saved accounts yet. Run "claudedeck save" to keep the current one.');
        return;
    }
    const live = await refreshLiveUsage(listing.sessions, force);
    const codeEmail = defaultCodeSlotDeps().codeEmail()?.toLowerCase() ?? null;
    const width = Math.max(...listing.sessions.map(entry => entry.alias.length), 5);
    for (const entry of listing.sessions) {
        const marker = entry.email.toLowerCase() === codeEmail ? '* ' : '  ';
        const usage = live[entry.alias.toLowerCase()] ?? (0, live_usage_1.cachedUsage)(entry.alias);
        console.log(`${marker}${entry.alias.padEnd(width)}  ${liveText(usage)}`);
    }
}
