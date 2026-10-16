import { isJobAction, runDesktopJob } from '../accounts/desktop-job';
import { createSwitcher } from '../accounts/switcher';
import { runApiCommand } from './api-command';
import { runAutoLoop } from './auto-loop';

export const ENGINE_USAGE = 'ClaudeDeck runs from its Claude mod. The engine only takes "api <route>", "auto" and "desktop <switch|save|add>".';

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;
  if (command === 'api') return runApiCommand(rest);
  if (command === 'auto') return runAutoLoop();
  if (command === 'desktop' && isJobAction(rest[0])) {
    runDesktopJob(rest[0], rest[1] ?? null, createSwitcher());
    return;
  }
  throw new Error(ENGINE_USAGE);
}
