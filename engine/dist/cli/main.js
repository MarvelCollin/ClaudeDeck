"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCli = runCli;
const loader_1 = require("../core/config/loader");
const scheduler_1 = require("../scheduler");
const accounts_command_1 = require("./accounts-command");
const help_1 = require("./help");
const task_actions_1 = require("./task-actions");
const router_1 = require("./router");
async function runCli(argv = process.argv.slice(2)) {
    const route = (0, router_1.routeCommand)(argv);
    if (route.kind === 'help') {
        console.log(help_1.HELP);
        return;
    }
    if (route.kind === 'web')
        return (0, accounts_command_1.runAccountsCommand)(route.args);
    const context = (0, loader_1.loadConfig)();
    const scheduler = (0, scheduler_1.selectScheduler)();
    const actions = (0, task_actions_1.createActions)(context, scheduler);
    actions.syncInstalledTask();
    return actions.execute(route.args[0]);
}
