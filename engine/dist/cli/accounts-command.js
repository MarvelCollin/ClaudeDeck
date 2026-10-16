"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USAGE = void 0;
exports.runAccountsCommand = runAccountsCommand;
const cswap_import_1 = require("../accounts/cswap-import");
const switcher_1 = require("../accounts/switcher");
const deeplink_1 = require("../accounts/deeplink");
const api_command_1 = require("./api-command");
const auto_command_1 = require("./auto-command");
const usage_command_1 = require("./usage-command");
exports.USAGE = [
    'Usage: claudedeck web [command]',
    '',
    '  (no command)       show this help',
    '  list               show every saved account and which one is active',
    '  list --json        the same as JSON, add --refresh to fetch live usage first',
    '  usage [refresh]    live 5h and weekly usage with reset times for every account',
    '  save               save the account you are signed into now',
    '  save code          save only the Claude Code login, Claude Desktop stays open',
    '  import cswap       bring in every account saved by claude-swap (cswap)',
    '  open <alias>       open a second Claude Desktop window on that account',
    '  open <alias> fresh wipe that profile first and open a plain sign in screen',
    '  close <alias>      close the window for that account',
    '  switch <alias>     restore a saved account and restart Claude Desktop',
    '  switch <alias> code  move only Claude Code to that account, Claude Desktop stays open',
    '  forget <alias>     delete a saved account session',
    '  share [on|off]     share local history and app state across every account',
    '  deeplink [status|install|remove|guard]  send claude:// sign in links to the window waiting for them',
    ...auto_command_1.AUTO_USAGE,
].join('\n');
function requireArg(value, command, what) {
    if (!value)
        throw new Error(`Command "${command}" needs ${what}.`);
    return value;
}
function usageText(usage) {
    if (!usage)
        return 'usage unknown';
    const parts = [];
    if (usage.session)
        parts.push(`5h ${usage.session.leftPercent}% left`);
    if (usage.weekly)
        parts.push(`week ${usage.weekly.leftPercent}% left`);
    return parts.join('  ');
}
function printList() {
    const { sessions, current, shareSession } = (0, switcher_1.createSwitcher)().listSessions();
    if (current)
        console.log(`Signed in now: ${current.name} <${current.email}>`);
    console.log(`Shared session history: ${shareSession ? 'on' : 'off'}`);
    if (!sessions.length) {
        console.log('No saved accounts yet. Run "claudedeck save" to keep the current one.');
        return;
    }
    const width = Math.max(...sessions.map(entry => entry.name.length), 7);
    const emailWidth = Math.max(...sessions.map(entry => entry.email.length), 5);
    for (const entry of sessions) {
        const marker = entry.instance.running ? '> ' : entry.active ? '* ' : '  ';
        const where = entry.instance.running ? 'open' : entry.instance.seeded ? 'ready' : 'not opened yet';
        console.log(`${marker}${entry.name.padEnd(width)}  ${entry.email.padEnd(emailWidth)}  ${where.padEnd(14)}  ${usageText(entry.usage)}`);
    }
}
function reportLoginRouting(guarding) {
    if (!(0, deeplink_1.handlerStatus)().supported) {
        console.log('That window has no saved sign in. Sign in there.');
        return;
    }
    console.log(guarding
        ? `That window has no saved sign in. Sign in there now: ClaudeDeck holds the sign in link for the next ${deeplink_1.GUARD_SECONDS / 60} minutes, even when Claude Desktop takes it back.`
        : 'That window has no saved sign in, and the sign in link is not held. Run "claudedeck deeplink guard" in another terminal, then sign in.');
}
async function runDeeplink(value, extra) {
    if (value === 'guard') {
        const seconds = Number(extra) > 0 ? Number(extra) : deeplink_1.GUARD_SECONDS;
        console.log(`Holding the claude:// handler for ${seconds}s. Sign in now.`);
        const held = await (0, deeplink_1.guardHandler)({}, { seconds });
        console.log(held.claims ? `Took the handler back ${held.claims} time(s).` : 'Nothing tried to take the handler.');
        return;
    }
    if (value && (0, deeplink_1.isProtocolUrl)(value)) {
        const routed = (0, deeplink_1.forward)(value);
        if (routed.routed)
            console.log(`Sent the sign in link to ${routed.alias ?? routed.dir}.`);
        else
            console.log('No account window was waiting to sign in, so the link went to Claude Desktop.');
        return;
    }
    if (!value || value === 'status') {
        const status = (0, deeplink_1.handlerStatus)();
        if (!status.supported) {
            console.log(`Routing ${deeplink_1.PROTOCOL}:// links is only needed on Windows.`);
            return;
        }
        console.log(`Sign in links are ${status.installed ? 'routed by ClaudeDeck' : 'handled by Claude Desktop'}.`);
        console.log(`Handler: ${status.command ?? 'not registered'}`);
        return;
    }
    if (value === 'install') {
        const installed = (0, deeplink_1.installHandler)();
        if (!installed.supported) {
            console.log(`Routing ${deeplink_1.PROTOCOL}:// links is only needed on Windows.`);
            return;
        }
        console.log(installed.changed ? 'ClaudeDeck now routes sign in links.' : 'ClaudeDeck already routes sign in links.');
        return;
    }
    if (value === 'remove') {
        const removed = (0, deeplink_1.removeHandler)();
        if (!removed.supported) {
            console.log(`Routing ${deeplink_1.PROTOCOL}:// links is only needed on Windows.`);
            return;
        }
        console.log(removed.changed ? 'Claude Desktop handles sign in links again.' : 'ClaudeDeck was not routing sign in links.');
        return;
    }
    throw new Error('Command "deeplink" needs "status", "install", "remove", "guard", or a claude:// link.');
}
function runShare(value) {
    const switcher = (0, switcher_1.createSwitcher)();
    if (!value) {
        console.log(`Shared session history is ${switcher.sharingEnabled() ? 'on' : 'off'}.`);
        return;
    }
    if (value !== 'on' && value !== 'off')
        throw new Error('Command "share" needs "on" or "off".');
    const result = switcher.setSharing(value === 'on');
    console.log(`Shared session history is ${result.shareSession ? 'on' : 'off'}.`);
}
async function runAccountsCommand(argv = []) {
    const [command, first] = argv;
    if (!command) {
        console.log(exports.USAGE.replace('claudedeck web [command]', 'claudedeck [command]'));
        return;
    }
    if (command === 'list') {
        if (argv.includes('--json')) {
            console.log(await (0, usage_command_1.listJson)(argv.includes('--refresh')));
            return;
        }
        printList();
        return;
    }
    if (command === 'api') {
        await (0, api_command_1.runApiCommand)(argv);
        return;
    }
    if (['auto', 'next', 'hold', 'release'].includes(command)) {
        await (0, auto_command_1.runAutoCommand)(argv);
        return;
    }
    if (command === 'usage') {
        await (0, usage_command_1.runUsageCommand)(first === 'refresh');
        return;
    }
    if (command === 'import') {
        if (first !== 'cswap')
            throw new Error('Command "import" needs "cswap".');
        const imported = (0, cswap_import_1.importEnvelope)((0, cswap_import_1.exportFromCswap)());
        const line = (label, list) => list.length && console.log(`${label}: ${list.join(', ')}`);
        line('Added', imported.added);
        line('Refreshed', imported.updated);
        line('Already newer here', imported.kept);
        line('Skipped', imported.skipped);
        if (imported.added.length || imported.updated.length) {
            console.log('Their Claude Desktop session is saved the next time you sign in to Desktop with them and run save.');
        }
        return;
    }
    if (command === 'save' || command === 'sync') {
        const saved = (0, switcher_1.createSwitcher)().sync({ codeOnly: first === 'code' });
        console.log(`Saved ${saved.name} <${saved.email}>.`);
        return;
    }
    if (command === 'open') {
        const [, , second] = argv;
        const fresh = second === 'fresh' || second === '--fresh';
        const opened = (0, switcher_1.createSwitcher)().openAccount(requireArg(first, 'open', 'an account alias'), { fresh });
        if (opened.alreadyRunning) {
            console.log(`${opened.alias} is already open.`);
            return;
        }
        if (opened.wiped)
            console.log(`Wiped the old profile for ${opened.alias}.`);
        console.log(`Opening ${opened.alias}${opened.seededFrom ? ' from its saved session' : ''}. Profile: ${opened.dir}`);
        if (!opened.signedIn)
            reportLoginRouting(opened.loginRouted);
        return;
    }
    if (command === 'close') {
        const closed = (0, switcher_1.createSwitcher)().closeAccount(requireArg(first, 'close', 'an account alias'));
        console.log(closed.stopped ? `Closed ${closed.alias}.` : `${closed.alias} was not open.`);
        return;
    }
    if (command === 'switch' && argv[2] === 'code') {
        const moved = (0, switcher_1.createSwitcher)().switchCode(requireArg(first, 'switch', 'an account alias'));
        console.log(`Claude Code is now on ${moved.name} <${moved.email}>. It picks up the login on its next message.`);
        return;
    }
    if (command === 'switch') {
        const result = (0, switcher_1.createSwitcher)().switchTo(requireArg(first, 'switch', 'an account alias'));
        console.log(`Switched to ${result.name} <${result.email}>. Claude Desktop is reopening.`);
        return;
    }
    if (command === 'share') {
        runShare(first);
        return;
    }
    if (command === 'deeplink') {
        await runDeeplink(first, argv[2]);
        return;
    }
    if (command === 'forget') {
        const forgotten = (0, switcher_1.createSwitcher)().forget(requireArg(first, 'forget', 'an account alias'));
        console.log(`Forgot ${forgotten.alias}.`);
        return;
    }
    console.log(exports.USAGE);
}
