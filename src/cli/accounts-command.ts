import { IAccountUsage } from '../accounts/interfaces';
import { createSwitcher } from '../accounts/switcher';
import { forward, handlerStatus, installHandler, isProtocolUrl, PROTOCOL, removeHandler } from '../accounts/deeplink';
import { openUrl } from '../accounts/desktop-app';
import { startServer } from '../web/server';

export const USAGE = [
  'Usage: claudedeck web [command]',
  '',
  '  (no command)       open the control panel in your browser',
  '  list               show every saved account and which one is active',
  '  save               save the account you are signed into now',
  '  open <alias>       open a second Claude Desktop window on that account',
  '  open <alias> fresh wipe that profile first and open a plain sign in screen',
  '  close <alias>      close the window for that account',
  '  switch <alias>     restore a saved account and restart Claude Desktop',
  '  forget <alias>     delete a saved account session',
  '  share [on|off]     share local history and app state across every account',
  '  deeplink [status|install|remove]  send claude:// sign in links to the window waiting for them',
].join('\n');

function requireArg(value: string | undefined, command: string, what: string): string {
  if (!value) throw new Error(`Command "${command}" needs ${what}.`);
  return value;
}

function usageText(usage: IAccountUsage | null): string {
  if (!usage) return 'usage unknown';
  const parts: string[] = [];
  if (usage.session) parts.push(`5h ${usage.session.leftPercent}% left`);
  if (usage.weekly) parts.push(`week ${usage.weekly.leftPercent}% left`);
  return parts.join('  ');
}

function printList(): void {
  const { sessions, current, shareSession } = createSwitcher().listSessions();
  if (current) console.log(`Signed in now: ${current.name} <${current.email}>`);
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
    console.log(
      `${marker}${entry.name.padEnd(width)}  ${entry.email.padEnd(emailWidth)}  ${where.padEnd(14)}  ${usageText(entry.usage)}`
    );
  }
}

export async function openUi(): Promise<void> {
  const panel = startServer();
  const session = await panel.listen();
  console.log(`ClaudeDeck control panel: ${session.url}`);
  console.log('Close the browser tab to stop the server.');
  openUrl(session.url);
  await new Promise<void>(resolve => session.server.once('close', () => resolve()));
  if (panel.connected()) {
    console.log('Control panel closed.');
    return;
  }
  console.log('Nothing opened the panel, so the server stopped. Copy the URL above into a browser and run the command again.');
}

export const CLAIM_WAIT_MS = 12000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, ms); });
}

async function holdLoginRouting(wait = CLAIM_WAIT_MS): Promise<void> {
  if (!handlerStatus().supported) {
    console.log('That window has no saved sign in. Sign in there.');
    return;
  }
  console.log('That window has no saved sign in. Waiting for Claude Desktop to register itself for sign in links...');
  await sleep(wait);
  const claimed = installHandler();
  console.log(
    claimed.installed
      ? 'Sign in links now come back to that window. Sign in there now, before another Claude Desktop starts.'
      : 'Could not take over sign in links. Run "claudedeck deeplink install" and try again.'
  );
}

function runDeeplink(value: string | undefined): void {
  if (value && isProtocolUrl(value)) {
    const routed = forward(value);
    if (routed.routed) console.log(`Sent the sign in link to ${routed.alias ?? routed.dir}.`);
    else console.log('No account window was waiting to sign in, so the link went to Claude Desktop.');
    return;
  }
  if (!value || value === 'status') {
    const status = handlerStatus();
    if (!status.supported) {
      console.log(`Routing ${PROTOCOL}:// links is only needed on Windows.`);
      return;
    }
    console.log(`Sign in links are ${status.installed ? 'routed by ClaudeDeck' : 'handled by Claude Desktop'}.`);
    console.log(`Handler: ${status.command ?? 'not registered'}`);
    return;
  }
  if (value === 'install') {
    const installed = installHandler();
    if (!installed.supported) {
      console.log(`Routing ${PROTOCOL}:// links is only needed on Windows.`);
      return;
    }
    console.log(installed.changed ? 'ClaudeDeck now routes sign in links.' : 'ClaudeDeck already routes sign in links.');
    return;
  }
  if (value === 'remove') {
    const removed = removeHandler();
    if (!removed.supported) {
      console.log(`Routing ${PROTOCOL}:// links is only needed on Windows.`);
      return;
    }
    console.log(removed.changed ? 'Claude Desktop handles sign in links again.' : 'ClaudeDeck was not routing sign in links.');
    return;
  }
  throw new Error('Command "deeplink" needs "status", "install", "remove", or a claude:// link.');
}

function runShare(value: string | undefined): void {
  const switcher = createSwitcher();
  if (!value) {
    console.log(`Shared session history is ${switcher.sharingEnabled() ? 'on' : 'off'}.`);
    return;
  }
  if (value !== 'on' && value !== 'off') throw new Error('Command "share" needs "on" or "off".');
  const result = switcher.setSharing(value === 'on');
  console.log(`Shared session history is ${result.shareSession ? 'on' : 'off'}.`);
}

export async function runAccountsCommand(argv: string[] = []): Promise<void> {
  const [command, first] = argv;

  if (!command) return openUi();

  if (command === 'list') {
    printList();
    return;
  }
  if (command === 'save' || command === 'sync') {
    const saved = createSwitcher().sync();
    console.log(`Saved ${saved.name} <${saved.email}>.`);
    return;
  }
  if (command === 'open') {
    const [, , second] = argv;
    const fresh = second === 'fresh' || second === '--fresh';
    const opened = createSwitcher().openAccount(requireArg(first, 'open', 'an account alias'), { fresh });
    if (opened.alreadyRunning) {
      console.log(`${opened.alias} is already open.`);
      return;
    }
    if (opened.wiped) console.log(`Wiped the old profile for ${opened.alias}.`);
    console.log(`Opening ${opened.alias}${opened.seededFrom ? ' from its saved session' : ''}. Profile: ${opened.dir}`);
    if (!opened.signedIn) await holdLoginRouting();
    return;
  }
  if (command === 'close') {
    const closed = createSwitcher().closeAccount(requireArg(first, 'close', 'an account alias'));
    console.log(closed.stopped ? `Closed ${closed.alias}.` : `${closed.alias} was not open.`);
    return;
  }
  if (command === 'switch') {
    const result = createSwitcher().switchTo(requireArg(first, 'switch', 'an account alias'));
    console.log(`Switched to ${result.name} <${result.email}>. Claude Desktop is reopening.`);
    return;
  }
  if (command === 'share') {
    runShare(first);
    return;
  }
  if (command === 'deeplink') {
    runDeeplink(first);
    return;
  }
  if (command === 'forget') {
    const forgotten = createSwitcher().forget(requireArg(first, 'forget', 'an account alias'));
    console.log(`Forgot ${forgotten.alias}.`);
    return;
  }
  console.log(USAGE);
}
