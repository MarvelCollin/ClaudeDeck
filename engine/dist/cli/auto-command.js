"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTO_USAGE = void 0;
exports.runAutoCommand = runAutoCommand;
const node_path_1 = __importDefault(require("node:path"));
const auto_switch_1 = require("../accounts/auto-switch");
const switcher_1 = require("../accounts/switcher");
const paths_1 = require("../core/paths");
const SETTING_KEYS = {
    threshold: 'threshold',
    landing: 'landing',
    cooldown: 'cooldownSeconds',
    interval: 'intervalSeconds',
};
exports.AUTO_USAGE = [
    '  auto               keep Claude Code on the best account, switching before a limit',
    '  auto once          check once and switch if needed',
    '  auto dry           show what auto switch would do, change nothing',
    '  auto status        show the auto switch settings and last decision',
    '  auto install       start auto switch at every sign in (Windows)',
    '  auto remove        stop starting auto switch at sign in',
    '  auto set <threshold|landing|cooldown|interval> <n>',
    '  next <alias>       use this account next, next clear to go back to the ranking',
    '  hold <alias>       keep an account out of auto switch, release <alias> undoes it',
];
function knownAliases() {
    return ((0, switcher_1.createSwitcher)().listSessions().sessions ?? []).map(entry => entry.alias);
}
function describe(entry) {
    const pct = (value) => (value === undefined ? 'n/a' : `${Math.round(value)}%`);
    const tags = [entry.active ? 'active' : '', entry.held ? 'held' : '', entry.hasRoom ? '' : 'no room'].filter(Boolean);
    return `${entry.alias}  5h ${pct(entry.fiveHour?.usedPercent)}  week ${pct(entry.sevenDay?.usedPercent)}  ${entry.tier}${tags.length ? `  ${tags.join(', ')}` : ''}`;
}
function printTick(result, verbose) {
    const { decision } = result;
    const verb = decision.action === 'switch' ? (result.switched ? 'switched to' : 'would switch to') : 'stay';
    console.log(`${decision.at}  ${verb}${decision.target ? ` ${decision.target}` : ''}: ${decision.reason}`);
    if (!verbose)
        return;
    for (const entry of result.accounts)
        console.log(`  ${describe(entry)}`);
    console.log(`  next pick: ${result.next?.alias ?? 'none with room'}`);
}
function binPath() {
    return node_path_1.default.resolve(__dirname, '..', '..', 'bin', 'claudedeck.js');
}
async function runAutoCommand(argv) {
    const [command, first, second] = argv;
    const now = new Date();
    if (command === 'next') {
        if (!first) {
            console.log(`Next account: ${(0, auto_switch_1.readAutoState)().preferredNext ?? 'picked by the ranking'}`);
            return;
        }
        const state = (0, auto_switch_1.setPreferredNext)(first === 'clear' ? null : first, knownAliases());
        console.log(state.preferredNext ? `${state.preferredNext} goes next when an account has room.` : 'The ranking picks the next account again.');
        return;
    }
    if (command === 'hold' || command === 'release') {
        if (!first)
            throw new Error(`Command "${command}" needs an account alias.`);
        const state = (0, auto_switch_1.setHeld)(first, command === 'hold', knownAliases());
        console.log(command === 'hold' ? `Held out of auto switch: ${state.held.join(', ')}` : `${first} is back in auto switch.`);
        return;
    }
    const auto = (0, auto_switch_1.createAutoSwitch)((0, auto_switch_1.defaultAutoDeps)((0, switcher_1.createSwitcher)()));
    if (!first) {
        console.log('Auto switch is watching Claude Code. Press Ctrl+C to stop.');
        const controller = new AbortController();
        process.once('SIGINT', () => controller.abort());
        await auto.run(result => printTick(result, false), controller.signal);
        return;
    }
    if (first === 'once' || first === 'dry') {
        printTick(await auto.tick({ dryRun: first === 'dry' }), true);
        return;
    }
    if (first === 'status') {
        const state = (0, auto_switch_1.readAutoState)();
        console.log(`Running: ${(0, auto_switch_1.isRunning)(state, now) ? `yes, process ${state.pid}` : 'no'}`);
        console.log(`Switch at ${state.settings.threshold}%, land below ${state.settings.landing}%, cooldown ${state.settings.cooldownSeconds}s, check every ${state.settings.intervalSeconds}s`);
        console.log(`Next account: ${state.preferredNext ?? 'picked by the ranking'}`);
        if (state.held.length)
            console.log(`Held: ${state.held.join(', ')}`);
        if (state.lastDecision)
            console.log(`Last: ${state.lastDecision.at} ${state.lastDecision.action} ${state.lastDecision.reason}`);
        return;
    }
    if (first === 'install') {
        const script = (0, auto_switch_1.installAutoTask)((0, paths_1.userDataDir)(), binPath());
        console.log(`Auto switch now starts at sign in and is running. Launcher: ${script}`);
        return;
    }
    if (first === 'remove') {
        console.log((0, auto_switch_1.removeAutoTask)() ? 'Auto switch no longer starts at sign in.' : 'Nothing to remove.');
        return;
    }
    if (first === 'set') {
        const key = SETTING_KEYS[second ?? ''];
        const value = Number(argv[3]);
        if (!key || !Number.isFinite(value))
            throw new Error('Use: auto set <threshold|landing|cooldown|interval> <number>');
        const state = (0, auto_switch_1.updateAutoState)(current => ({ ...current, settings: { ...current.settings, [key]: value } }));
        console.log(`Saved. Switch at ${state.settings.threshold}%, land below ${state.settings.landing}%.`);
        return;
    }
    console.log(['Usage:', ...exports.AUTO_USAGE].join('\n'));
}
