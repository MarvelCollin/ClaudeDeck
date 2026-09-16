import { createSwitcher } from '../accounts/switcher';
import { loadConfig, saveConfig } from '../core/config/loader';
import { calendarEntryCount, scheduleSummary } from '../core/config/schedule';
import { IConfigContext, IScheduler } from '../core/interfaces';
import { readLogLines } from '../core/logging/run-log';
import { writeState } from '../core/state/task-state';
import { selectScheduler } from '../scheduler';
import {
  IAliasBody,
  ILogView,
  IPanelService,
  IPanelState,
  IScheduleDraft,
  IScheduleState,
  ISharingBody,
} from './interfaces';

export function createService(): IPanelService {
  let context: IConfigContext = loadConfig();
  let scheduler: IScheduler | null = null;
  const switcher = createSwitcher();

  function schedulerOrThrow(): IScheduler {
    if (!scheduler) scheduler = selectScheduler();
    return scheduler;
  }

  function reload(): void {
    context = loadConfig(context.configPath);
  }

  function install(): void {
    schedulerOrThrow().install(context);
    writeState(context.configHash);
  }

  function scheduleState(): IScheduleState {
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

  function saveSchedule(body: IScheduleDraft): IScheduleState {
    const next = {
      ...context.config,
      prompt: typeof body.prompt === 'string' ? body.prompt : context.config.prompt,
      wakeToRun: typeof body.wakeToRun === 'boolean' ? body.wakeToRun : context.config.wakeToRun,
      runWhenLocked: typeof body.runWhenLocked === 'boolean' ? body.runWhenLocked : context.config.runWhenLocked,
      schedules: Array.isArray(body.schedules) ? body.schedules : context.config.schedules,
    };
    context = saveConfig(context, next);
    if (schedulerOrThrow().exists(context)) install();
    return scheduleState();
  }

  function startBackground(): IScheduleState {
    const active = schedulerOrThrow();
    if (!active.exists(context)) install();
    active.enable(context);
    return scheduleState();
  }

  function stopBackground(): IScheduleState {
    const active = schedulerOrThrow();
    const summary = active.summary(context);
    if (!summary.installed) throw new Error('Background task is not installed yet.');
    if (summary.running) active.stop(context);
    active.disable(context);
    return scheduleState();
  }

  function runNow(): IScheduleState {
    schedulerOrThrow().runNow(context);
    return scheduleState();
  }

  function readLog(limit = 400): ILogView {
    return { path: context.logPath, lines: readLogLines(context.logPath, limit) };
  }

  function requireAlias(body: IAliasBody, question: string): string {
    if (!body || !body.alias) throw new Error(question);
    return body.alias;
  }

  function setSharing(body: ISharingBody): ReturnType<typeof switcher.listSessions> {
    if (!body || typeof body.enabled !== 'boolean') throw new Error('Should shared history be on or off?');
    switcher.setSharing(body.enabled);
    return switcher.listSessions();
  }

  function state(): IPanelState {
    return { schedule: scheduleState(), accounts: switcher.listSessions() };
  }

  return {
    accountsState: () => switcher.listSessions(),
    forgetAccount: body => switcher.forget(requireAlias(body, 'Which account should I forget?')),
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
