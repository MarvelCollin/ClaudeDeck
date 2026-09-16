import fs from 'node:fs';
import { loadConfig } from '../../core/config/loader';
import { IConfigContext, IScheduler } from '../../core/interfaces';
import { readState, writeState } from '../../core/state/task-state';
import { openUi } from '../accounts-command';
import { ITaskActions } from '../interfaces';
import { configureSchedule } from './schedule-editor';

const CONFIG_CHOICES = new Set(['config', 'configure']);
const START_CHOICES = new Set(['background', 'start', '1']);
const STOP_CHOICES = new Set(['stop-background', 'disable', '2']);
const RUN_CHOICES = new Set(['run', '3']);
const LOG_CHOICES = new Set(['log', '4']);
const PANEL_CHOICES = new Set(['web', 'profiles', '5']);

export function createActions(context: IConfigContext, scheduler: IScheduler): ITaskActions {
  function reloadContext(): void {
    Object.assign(context, loadConfig(context.configPath));
  }

  function install(): void {
    scheduler.install(context);
    writeState(context.configHash);
  }

  function syncInstalledTask(): void {
    if (!scheduler.exists(context)) return;
    if (readState().configHash === context.configHash) return;
    console.log('Updating background task from claudedeck.config.json...');
    install();
  }

  function openLog(): void {
    if (!fs.existsSync(context.logPath)) {
      console.log(`Log not found: ${context.logPath}`);
      return;
    }
    scheduler.openLog(context);
  }

  function runBackground(): void {
    syncInstalledTask();
    if (!scheduler.exists(context)) install();
    scheduler.enable(context);
  }

  function stopBackground(): void {
    const info = scheduler.summary(context);
    if (!info.installed) {
      console.log('Task is not installed.');
      return;
    }
    if (info.running) scheduler.stop(context);
    scheduler.disable(context);
  }

  async function execute(choice: string | undefined): Promise<void> {
    if (choice === undefined) return;
    if (CONFIG_CHOICES.has(choice)) return configureSchedule(context, scheduler, install, reloadContext);
    if (choice === 'install') return install();
    if (START_CHOICES.has(choice)) return runBackground();
    if (STOP_CHOICES.has(choice)) return stopBackground();
    if (RUN_CHOICES.has(choice)) return scheduler.runNow(context);
    if (LOG_CHOICES.has(choice)) return openLog();
    if (PANEL_CHOICES.has(choice)) return openUi();
    if (choice === 'stop') return scheduler.stop(context);
    if (choice === 'enable') return scheduler.enable(context);
    if (choice === 'status') return scheduler.status(context);
    if (choice === 'delete') return scheduler.deleteTask(context);
    if (choice !== '0') console.log('Invalid choice.');
    return undefined;
  }

  return { execute, install, reloadContext, runBackground, stopBackground, syncInstalledTask };
}
