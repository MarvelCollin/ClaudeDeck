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
].join('\n');

function requireArg(value, command, what) {
  if (!value) throw new Error(`Command "${command}" needs ${what}.`);
  return value;
}

function printList() {
  const { sessions, current } = createSwitcher().listSessions();
  if (current) console.log(`Signed in now: ${current.name} <${current.email}>`);
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
