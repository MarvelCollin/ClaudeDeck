import { SchedulerName } from '../types';
import { IConfigContext } from './IConfigContext';
import { ISchedulerSummary } from './ISchedulerSummary';

export interface IScheduler {
  readonly name: SchedulerName;
  exists(context: IConfigContext): boolean;
  install(context: IConfigContext): void;
  summary(context: IConfigContext): ISchedulerSummary;
  status(context: IConfigContext): void;
  runNow(context: IConfigContext): void;
  stop(context: IConfigContext): void;
  disable(context: IConfigContext): void;
  enable(context: IConfigContext): void;
  deleteTask(context: IConfigContext): void;
  openLog(context: IConfigContext): void;
}
