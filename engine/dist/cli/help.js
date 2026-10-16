"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HELP = void 0;
const accounts_command_1 = require("./accounts-command");
exports.HELP = [
    'Usage: claudedeck [command]',
    '',
    'ClaudeDeck lives in a pane beside the chat in Claude Desktop. Run /deck there to open it.',
    '',
    '',
    accounts_command_1.USAGE.split('\n').slice(3).join('\n'),
    '',
    '  install            install the background task',
    '  start              install if needed, then enable the background task',
    '  stop-background    disable the background task',
    '  run                run Claude once, now',
    '  log                open the run log',
    '  status             show the background task status',
    '  delete             remove the background task',
].join('\n');
