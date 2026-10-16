import { loadConfig, saveConfig } from '../core/config/loader';
import { calendarEntryCount, scheduleSummary } from '../core/config/schedule';
import { IConfigContext, IScheduler } from '../core/interfaces';
import { readLogLines } from '../core/logging/run-log';
import { selectScheduler } from '../scheduler';
import { ILogView, IScheduleDraft, IScheduleService, IScheduleState } from './interfaces';

export function createScheduleService(): IScheduleService {
  let context: IConfigContext = loadConfig();
  let scheduler: IScheduler | null = null;

  function schedulerOrThrow(): IScheduler {
    if (!scheduler) scheduler = selectScheduler();
    return scheduler;
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
      warmAllAccounts: context.config.warmAllAccounts === true,
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
      warmAllAccounts: typeof body.warmAllAccounts === 'boolean' ? body.warmAllAccounts : context.config.warmAllAccounts === true,
      schedules: Array.isArray(body.schedules) ? body.schedules : context.config.schedules,
    };
    context = saveConfig(context, next);
    if (schedulerOrThrow().exists(context)) schedulerOrThrow().install(context);
    return scheduleState();
  }

  function startBackground(): IScheduleState {
    const active = schedulerOrThrow();
    if (!active.exists(context)) active.install(context);
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

  return { readLog, runNow, saveSchedule, scheduleState, startBackground, stopBackground };
}
