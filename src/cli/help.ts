import { USAGE } from './accounts-command';

export const HELP = [
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
