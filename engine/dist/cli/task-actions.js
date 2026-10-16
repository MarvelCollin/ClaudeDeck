"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createActions = createActions;
const node_fs_1 = __importDefault(require("node:fs"));
const loader_1 = require("../core/config/loader");
const task_state_1 = require("../core/state/task-state");
const START_CHOICES = new Set(['background', 'start', '1']);
const STOP_CHOICES = new Set(['stop-background', 'disable', '2']);
const RUN_CHOICES = new Set(['run', '3']);
const LOG_CHOICES = new Set(['log', '4']);
function createActions(context, scheduler) {
    function reloadContext() {
        Object.assign(context, (0, loader_1.loadConfig)(context.configPath));
    }
    function install() {
        scheduler.install(context);
        (0, task_state_1.writeState)(context.configHash);
    }
    function syncInstalledTask() {
        if (!scheduler.exists(context))
            return;
        if ((0, task_state_1.readState)().configHash === context.configHash)
            return;
        console.log('Updating background task from claudedeck.config.json...');
        install();
    }
    function openLog() {
        if (!node_fs_1.default.existsSync(context.logPath)) {
            console.log(`Log not found: ${context.logPath}`);
            return;
        }
        scheduler.openLog(context);
    }
    function runBackground() {
        syncInstalledTask();
        if (!scheduler.exists(context))
            install();
        scheduler.enable(context);
    }
    function stopBackground() {
        const info = scheduler.summary(context);
        if (!info.installed) {
            console.log('Task is not installed.');
            return;
        }
        if (info.running)
            scheduler.stop(context);
        scheduler.disable(context);
    }
    async function execute(choice) {
        if (choice === undefined)
            return;
        if (choice === 'install')
            return install();
        if (START_CHOICES.has(choice))
            return runBackground();
        if (STOP_CHOICES.has(choice))
            return stopBackground();
        if (RUN_CHOICES.has(choice))
            return scheduler.runNow(context);
        if (LOG_CHOICES.has(choice))
            return openLog();
        if (choice === 'stop')
            return scheduler.stop(context);
        if (choice === 'enable')
            return scheduler.enable(context);
        if (choice === 'status')
            return scheduler.status(context);
        if (choice === 'delete')
            return scheduler.deleteTask(context);
        if (choice !== '0')
            console.log('Invalid choice.');
        return undefined;
    }
    return { execute, install, reloadContext, runBackground, stopBackground, syncInstalledTask };
}
