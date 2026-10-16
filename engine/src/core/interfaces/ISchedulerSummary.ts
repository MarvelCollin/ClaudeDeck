import { IRunCounts } from './IRunCounts';

export interface ISchedulerSummary {
  installed: boolean;
  enabled: boolean;
  running: boolean;
  state: string;
  lastRun: string;
  nextRun: string;
  counts: IRunCounts;
  loaded?: boolean;
  lastResult?: string;
}
