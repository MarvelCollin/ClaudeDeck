"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENGINE_USAGE = void 0;
exports.runCli = runCli;
const desktop_job_1 = require("../accounts/desktop-job");
const switcher_1 = require("../accounts/switcher");
const api_command_1 = require("./api-command");
const auto_loop_1 = require("./auto-loop");
exports.ENGINE_USAGE = 'ClaudeDeck runs from its Claude mod. The engine only takes "api <route>", "auto" and "desktop <switch|save>".';
async function runCli(argv = process.argv.slice(2)) {
    const [command, ...rest] = argv;
    if (command === 'api')
        return (0, api_command_1.runApiCommand)(rest);
    if (command === 'auto')
        return (0, auto_loop_1.runAutoLoop)();
    if (command === 'desktop' && (0, desktop_job_1.isJobAction)(rest[0])) {
        (0, desktop_job_1.runDesktopJob)(rest[0], rest[1] ?? null, (0, switcher_1.createSwitcher)());
        return;
    }
    throw new Error(exports.ENGINE_USAGE);
}
