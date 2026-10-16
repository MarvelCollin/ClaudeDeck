import { USAGE } from './accounts-command';

export const HELP = [
  'Usage: claudedeck [command]',
  '',
  'ClaudeDeck lives in a pane beside the chat in Claude Desktop. Run /deck there to open it.',
  '',
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
