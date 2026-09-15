const { openUrl } = require('../lib/profiles/app');
const manager = require('../lib/profiles/manager');
const { startServer } = require('../lib/web/server');

const USAGE = [
  'Usage: claudedeck web [command]',
  '',
  '  (no command)       open the control panel in your browser',
  '  list               print every Claude Desktop profile',
  '  add <name>         create a profile, named however you like',
  '  label <alias> <n>  rename an existing profile',
  '  launch <alias>     start Claude Desktop on a profile',
  '  stop <alias>       stop every Claude Desktop process on a profile',
  '  remove <alias>     delete a profile and its saved login',
].join('\n');

function printList() {
  const profiles = manager.listProfiles();
  const nameOf = profile => (profile.account ? profile.account.name : profile.label || profile.alias);
  const width = Math.max(...profiles.map(profile => nameOf(profile).length), 7);
  for (const profile of profiles) {
    const state = profile.running ? `running (${profile.pids.length})` : 'idle';
    const who = profile.account ? profile.account.email : profile.dir;
    console.log(`${nameOf(profile).padEnd(width)}  ${state.padEnd(13)}  ${who}`);
  }
}

function requireArg(value, command, what) {
  if (!value) throw new Error(`Command "${command}" needs ${what}.`);
  return value;
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
  const [command, first, ...rest] = argv;
  if (!command) return openUi();
  if (command === 'list') return printList();
  if (command === 'add') {
    const created = manager.addProfile(requireArg(first, 'add', 'a name'));
    console.log(`Created ${created.label} at ${created.dir}`);
    console.log(`Run "claudedeck web launch ${created.alias}" and sign in with that account.`);
    return undefined;
  }
  if (command === 'label') {
    const alias = requireArg(first, 'label', 'a profile alias');
    const updated = manager.labelProfile(alias, requireArg(rest.join(' '), 'label', 'a new name'));
    console.log(`${updated.alias} is now shown as ${updated.label}`);
    return undefined;
  }
  if (command === 'launch') {
    const started = manager.launchProfile(requireArg(first, 'launch', 'a profile alias'));
    console.log(`Launched ${started.alias} (pid ${started.pid}).`);
    return undefined;
  }
  if (command === 'stop') {
    const stopped = manager.stopProfile(requireArg(first, 'stop', 'a profile alias'));
    console.log(stopped.stopped ? `Stopped ${stopped.stopped} process(es) on ${stopped.alias}.` : `Nothing running on ${stopped.alias}.`);
    return undefined;
  }
  if (command === 'remove') {
    const removed = manager.removeProfile(requireArg(first, 'remove', 'a profile alias'));
    console.log(`Removed ${removed.alias} and deleted ${removed.dir}`);
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
