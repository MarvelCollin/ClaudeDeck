"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createService = createService;
const switcher_1 = require("../accounts/switcher");
const loader_1 = require("../core/config/loader");
const schedule_1 = require("../core/config/schedule");
const run_log_1 = require("../core/logging/run-log");
const task_state_1 = require("../core/state/task-state");
const scheduler_1 = require("../scheduler");
function createService() {
    let context = (0, loader_1.loadConfig)();
    let scheduler = null;
    const switcher = (0, switcher_1.createSwitcher)();
    function schedulerOrThrow() {
        if (!scheduler)
            scheduler = (0, scheduler_1.selectScheduler)();
        return scheduler;
    }
    function reload() {
        context = (0, loader_1.loadConfig)(context.configPath);
    }
    function install() {
        schedulerOrThrow().install(context);
        (0, task_state_1.writeState)(context.configHash);
    }
    function scheduleState() {
        const summary = schedulerOrThrow().summary(context);
        return {
            taskName: context.config.taskName,
            macLabel: context.config.macLabel,
            configPath: context.configPath,
            logPath: context.logPath,
            prompt: context.config.prompt,
            model: context.config.model,
            wakeToRun: context.config.wakeToRun,
            runWhenLocked: context.config.runWhenLocked,
            warmAllAccounts: context.config.warmAllAccounts === true,
            schedules: context.config.schedules,
            summaryText: (0, schedule_1.scheduleSummary)(context.config),
            entryCount: (0, schedule_1.calendarEntryCount)(context.config),
            installed: Boolean(summary.installed),
            enabled: Boolean(summary.enabled),
            running: Boolean(summary.running),
            lastRun: summary.lastRun,
            nextRun: summary.nextRun,
            counts: summary.counts,
        };
    }
    function saveSchedule(body) {
        const next = {
            ...context.config,
            prompt: typeof body.prompt === 'string' ? body.prompt : context.config.prompt,
            wakeToRun: typeof body.wakeToRun === 'boolean' ? body.wakeToRun : context.config.wakeToRun,
            runWhenLocked: typeof body.runWhenLocked === 'boolean' ? body.runWhenLocked : context.config.runWhenLocked,
            warmAllAccounts: typeof body.warmAllAccounts === 'boolean' ? body.warmAllAccounts : context.config.warmAllAccounts === true,
            schedules: Array.isArray(body.schedules) ? body.schedules : context.config.schedules,
        };
        context = (0, loader_1.saveConfig)(context, next);
        if (schedulerOrThrow().exists(context))
            install();
        return scheduleState();
    }
    function startBackground() {
        const active = schedulerOrThrow();
        if (!active.exists(context))
            install();
        active.enable(context);
        return scheduleState();
    }
    function stopBackground() {
        const active = schedulerOrThrow();
        const summary = active.summary(context);
        if (!summary.installed)
            throw new Error('Background task is not installed yet.');
        if (summary.running)
            active.stop(context);
        active.disable(context);
        return scheduleState();
    }
    function runNow() {
        schedulerOrThrow().runNow(context);
        return scheduleState();
    }
    function readLog(limit = 400) {
        return { path: context.logPath, lines: (0, run_log_1.readLogLines)(context.logPath, limit) };
    }
    function requireAlias(body, question) {
        if (!body || !body.alias)
            throw new Error(question);
        return body.alias;
    }
    function setSharing(body) {
        if (!body || typeof body.enabled !== 'boolean')
            throw new Error('Should shared history be on or off?');
        switcher.setSharing(body.enabled);
        return switcher.listSessions();
    }
    function state() {
        return { schedule: scheduleState(), accounts: switcher.listSessions() };
    }
    return {
        accountsState: () => switcher.listSessions(),
        closeAccount: body => switcher.closeAccount(requireAlias(body, 'Which account should I close?')),
        forgetAccount: body => switcher.forget(requireAlias(body, 'Which account should I forget?')),
        openAccount: body => switcher.openAccount(requireAlias(body, 'Which account should I open?'), { fresh: Boolean(body?.fresh) }),
        install,
        readLog,
        reload,
        runNow,
        saveSchedule,
        scheduleState,
        setSharing,
        startBackground,
        state,
        stopBackground,
        switchAccount: body => switcher.switchTo(requireAlias(body, 'Which account should I switch to?')),
        syncCurrent: body => switcher.sync({ install: typeof body?.install === 'string' ? body.install : undefined }),
    };
}
