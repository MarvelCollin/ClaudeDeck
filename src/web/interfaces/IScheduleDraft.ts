import { ISchedule } from '../../core/interfaces';

export interface IScheduleDraft {
  prompt?: unknown;
  wakeToRun?: unknown;
  runWhenLocked?: unknown;
  schedules?: ISchedule[];
}
