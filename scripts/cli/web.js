const { openUrl } = require('../lib/profiles/app');
const { createSwitcher } = require('../lib/profiles/switcher');
const { startServer } = require('../lib/web/server');

const USAGE = [
  'Usage: claudedeck web [command]',
  '',
  '  (no command)       open the control panel in your browser',
  '  list               show every saved account and which one is active',
  '  save               save the account you are signed into now',
  '  switch <alias>     restore a saved account and restart Claude Desktop',
  '  forget <alias>     delete a saved account session',
  '  share [on|off]     share local history and app state across every account',
].join('\n');

function requireArg(value, command, what) {
  if (!value) throw new Error(`Command "${command}" needs ${what}.`);
  return value;
}

function printList() {
  const { sessions, current, shareSession } = createSwitcher().listSessions();
  if (current) console.log(`Signed in now: ${current.name} <${current.email}>`);
  console.log(`Shared session history: ${shareSession ? 'on' : 'off'}`);
  if (!sessions.length) {
    console.log('No saved accounts yet. Run "claudedeck web save" to keep the current one.');
    return;
  }
  const width = Math.max(...sessions.map(entry => entry.name.length), 7);
  for (const entry of sessions) {
    const mark = entry.active ? '* ' : '  ';
    console.log(`${mark}${entry.name.padEnd(width)}  ${entry.email}`);
  }
}

async function openUi() {
  const session = await startServer().listen();
  console.log(`ClaudeDeck control panel: ${session.url}`);
  console.log('Close the browser tab to stop the server.');
  openUrl(session.url);
  await new Promise(resolve => session.server.once('close', resolve));
  console.log('Control panel closed.');
}

async function runWeb(argv = []) {
  const [command, first] = argv;
  if (!command) return openUi();
  if (command === 'list') return printList();
  if (command === 'save' || command === 'sync') {
    const saved = createSwitcher().sync();
    console.log(`Saved ${saved.name} <${saved.email}>.`);
    return undefined;
  }
  if (command === 'switch') {
    const result = createSwitcher().switchTo(requireArg(first, 'switch', 'an account alias'));
    console.log(`Switched to ${result.name} <${result.email}>. Claude Desktop is reopening.`);
    return undefined;
  }
  if (command === 'share') {
    const switcher = createSwitcher();
    if (!first) {
      console.log(`Shared session history is ${switcher.sharingEnabled() ? 'on' : 'off'}.`);
      return undefined;
    }
    if (first !== 'on' && first !== 'off') throw new Error('Command "share" needs "on" or "off".');
    const result = switcher.setSharing(first === 'on');
    console.log(`Shared session history is ${result.shareSession ? 'on' : 'off'}.`);
    return undefined;
  }
  if (command === 'forget') {
    const forgotten = createSwitcher().forget(requireArg(first, 'forget', 'an account alias'));
    console.log(`Forgot ${forgotten.alias}.`);
    return undefined;
  }
  console.log(USAGE);
  return undefined;
}

module.exports = {
  USAGE,
  openUi,
  runWeb,
};
