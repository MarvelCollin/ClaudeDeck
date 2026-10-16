import { ILogView } from './ILogView';
import { IScheduleDraft } from './IScheduleDraft';
import { IScheduleState } from './IScheduleState';

export interface IScheduleService {
  readLog(limit?: number): ILogView;
  runNow(): IScheduleState;
  saveSchedule(body: IScheduleDraft): IScheduleState;
  scheduleState(): IScheduleState;
  startBackground(): IScheduleState;
  stopBackground(): IScheduleState;
}
