import { loadConfig } from '../core/config/loader';
import { selectScheduler } from '../scheduler';
import { runAccountsCommand } from './accounts-command';
import { HELP } from './help';
import { createActions } from './task-actions';
import { routeCommand } from './router';

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const route = routeCommand(argv);

  if (route.kind === 'help') {
    console.log(HELP);
    return;
  }
  if (route.kind === 'web') return runAccountsCommand(route.args);

  const context = loadConfig();
  const scheduler = selectScheduler();
  const actions = createActions(context, scheduler);

  actions.syncInstalledTask();
  return actions.execute(route.args[0]);
}
