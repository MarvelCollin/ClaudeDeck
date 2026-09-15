const { openUrl } = require('../lib/profiles/app');
const manager = require('../lib/profiles/manager');
const { startServer } = require('../lib/profiles/server');

const USAGE = [
  'Usage: claudecron profiles [command]',
  '',
  '  ui                 open the profile switcher in your browser (default)',
  '  list               print every profile and whether it is running',
  '  add <alias>        create a new empty profile',
  '  launch <alias>     start Claude Desktop on a profile',
  '  stop <alias>       stop every Claude Desktop process on a profile',
  '  remove <alias>     delete a profile and its local data',
].join('\n');

function printList() {
  const profiles = manager.listProfiles();
  const width = Math.max(...profiles.map(profile => profile.alias.length), 7);
  for (const profile of profiles) {
    const state = profile.running ? `running (${profile.pids.length})` : 'idle';
    const note = profile.exists ? '' : '  not created yet';
    console.log(`${profile.alias.padEnd(width)}  ${state.padEnd(13)}  ${profile.dir}${note}`);
  }
}

function requireAlias(alias, command) {
  if (!alias) throw new Error(`Command "${command}" needs a profile name.`);
  return alias;
}

async function openUi() {
  const { listen } = startServer();
  const session = await listen();
  console.log(`Profile switcher: ${session.url}`);
  console.log('Close the browser tab to stop the server.');
  openUrl(session.url);
  await new Promise(resolve => session.server.once('close', resolve));
  console.log('Profile switcher closed.');
}

async function runProfiles(argv = []) {
  const [command = 'ui', alias] = argv;
  if (command === 'ui') return openUi();
  if (command === 'list') return printList();
  if (command === 'add') {
    const created = manager.addProfile(requireAlias(alias, 'add'));
    console.log(`Created ${created.alias} at ${created.dir}`);
    console.log(`Run "claudecron profiles launch ${created.alias}" and sign in with the other account.`);
    return undefined;
  }
  if (command === 'launch') {
    const started = manager.launchProfile(requireAlias(alias, 'launch'));
    console.log(`Launched ${started.alias} (pid ${started.pid}).`);
    return undefined;
  }
  if (command === 'stop') {
    const stopped = manager.stopProfile(requireAlias(alias, 'stop'));
    console.log(stopped.stopped ? `Stopped ${stopped.stopped} process(es) on ${stopped.alias}.` : `Nothing running on ${stopped.alias}.`);
    return undefined;
  }
  if (command === 'remove') {
    const removed = manager.removeProfile(requireAlias(alias, 'remove'));
    console.log(`Removed ${removed.alias} and deleted ${removed.dir}`);
    return undefined;
  }
  console.log(USAGE);
  return undefined;
}

module.exports = {
  USAGE,
  openUi,
  runProfiles,
};
