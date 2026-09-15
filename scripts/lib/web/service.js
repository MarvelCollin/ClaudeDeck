const fs = require('fs');
const { calendarEntryCount, loadConfig, scheduleSummary, validateConfig } = require('../config');
const { writeState } = require('../state');
const { selectPlatform } = require('../task/platform');
const manager = require('../profiles/manager');
const { createSwitcher } = require('../profiles/switcher');

function createService() {
  let context = loadConfig();
  let platform = null;
  const switcher = createSwitcher();

  function platformOrThrow() {
    if (!platform) platform = selectPlatform();
    return platform;
  }

  function reload() {
    context = loadConfig(context.configPath);
    return context;
  }

  function install() {
    platformOrThrow().install(context);
    writeState(context.configHash);
  }

  function scheduleState() {
    const summary = platformOrThrow().summary(context);
    return {
      taskName: context.config.taskName,
      macLabel: context.config.macLabel,
      configPath: context.configPath,
      logPath: context.logPath,
      prompt: context.config.prompt,
      model: context.config.model,
      wakeToRun: context.config.wakeToRun,
      runWhenLocked: context.config.runWhenLocked,
      schedules: context.config.schedules,
      summaryText: scheduleSummary(context.config),
      entryCount: calendarEntryCount(context.config),
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
      schedules: Array.isArray(body.schedules) ? body.schedules : context.config.schedules,
    };
    validateConfig(next);
    fs.writeFileSync(context.configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    reload();
    if (platformOrThrow().exists(context)) install();
    return scheduleState();
  }

  function startBackground() {
    const active = platformOrThrow();
    if (!active.exists(context)) install();
    active.enable(context);
    return scheduleState();
  }

  function stopBackground() {
    const active = platformOrThrow();
    const summary = active.summary(context);
    if (!summary.installed) throw new Error('Background task is not installed yet.');
    if (summary.running) active.stop(context);
    active.disable(context);
    return scheduleState();
  }

  function runNow() {
    platformOrThrow().runNow(context);
    return scheduleState();
  }

  function readLog(limit = 400) {
    if (!fs.existsSync(context.logPath)) return { path: context.logPath, lines: [] };
    const text = fs.readFileSync(context.logPath, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    return { path: context.logPath, lines: lines.slice(-limit) };
  }

  function accountsState() {
    return switcher.listSessions();
  }

  function syncCurrent() {
    return switcher.sync();
  }

  function switchAccount(body) {
    if (!body || !body.alias) throw new Error('Which account should I switch to?');
    return switcher.switchTo(body.alias);
  }

  function forgetAccount(body) {
    if (!body || !body.alias) throw new Error('Which account should I forget?');
    return switcher.forget(body.alias);
  }

  function setSharing(body) {
    if (!body || typeof body.enabled !== 'boolean') throw new Error('Should shared history be on or off?');
    switcher.setSharing(body.enabled);
    return accountsState();
  }

  function state() {
    return { schedule: scheduleState(), accounts: accountsState() };
  }

  return {
    accountsState,
    forgetAccount,
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
    switchAccount,
    syncCurrent,
  };
}

module.exports = {
  createService,
};
