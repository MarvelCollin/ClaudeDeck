import { runApiCommand } from './api-command';
import { runAutoLoop } from './auto-loop';

export const ENGINE_USAGE = 'ClaudeDeck runs from its Claude mod. The engine only takes "api <route>" and "auto".';

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;
  if (command === 'api') return runApiCommand(rest);
  if (command === 'auto') return runAutoLoop();
  throw new Error(ENGINE_USAGE);
}
