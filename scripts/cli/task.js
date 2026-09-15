const { loadConfig } = require('../lib/config');
const { createActions } = require('../lib/task/actions');
const { runInteractive } = require('../lib/task/interactive');
const { selectPlatform } = require('../lib/task/platform');
const { runProfiles } = require('./profiles');

async function main() {
  const command = process.argv[2];
  if (command === 'profiles') {
    await runProfiles(process.argv.slice(3));
    return;
  }

  const context = loadConfig();
  const platform = selectPlatform();
  const actions = createActions(context, platform);

  if (command) {
    await actions.execute(command);
    return;
  }
  actions.syncInstalledTask();
  await runInteractive(context, platform, actions);
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
