const { loadConfig } = require('../lib/config');
const { createActions } = require('../lib/task/actions');
const { runInteractive } = require('../lib/task/interactive');
const { selectPlatform } = require('../lib/task/platform');
const { routeCommand } = require('../lib/task/router');
const { USAGE, runWeb } = require('./web');

const HELP = [
  'Usage: claudedeck [command]',
  '',
  '  (no command)       open the control panel in your browser',
  '  menu               use the terminal menu instead',
  '',
  USAGE.split('\n').slice(3).join('\n'),
  '',
  '  install            install the background task',
  '  start              install if needed, then enable the background task',
  '  stop-background    disable the background task',
  '  run                run Claude once, now',
  '  log                open the run log',
  '  status             show the background task status',
  '  delete             remove the background task',
].join('\n');

async function main() {
  const route = routeCommand(process.argv.slice(2));

  if (route.kind === 'panel') {
    await runWeb([]);
    return;
  }
  if (route.kind === 'help') {
    console.log(HELP);
    return;
  }
  if (route.kind === 'web') {
    await runWeb(route.args);
    return;
  }

  const context = loadConfig();
  const platform = selectPlatform();
  const actions = createActions(context, platform);

  if (route.kind === 'menu') {
    actions.syncInstalledTask();
    await runInteractive(context, platform, actions);
    return;
  }
  await actions.execute(route.args[0]);
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
