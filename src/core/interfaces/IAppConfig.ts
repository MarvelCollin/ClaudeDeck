import { ClaudeModel } from '../types';
import { ISchedule } from './ISchedule';

export interface IAppConfig {
  taskName: string;
  macLabel: string;
  prompt: string;
  model: ClaudeModel;
  logFile: string;
  wakeToRun: boolean;
  runWhenLocked: boolean;
  schedules: ISchedule[];
}
