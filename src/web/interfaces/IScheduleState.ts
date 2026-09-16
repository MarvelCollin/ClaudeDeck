import { IRunCounts, ISchedule } from '../../core/interfaces';
import { ClaudeModel } from '../../core/types';

export interface IScheduleState {
  taskName: string;
  macLabel: string;
  configPath: string;
  logPath: string;
  prompt: string;
  model: ClaudeModel;
  wakeToRun: boolean;
  runWhenLocked: boolean;
  schedules: ISchedule[];
  summaryText: string;
  entryCount: number;
  installed: boolean;
  enabled: boolean;
  running: boolean;
  lastRun: string;
  nextRun: string;
  counts: IRunCounts;
}
