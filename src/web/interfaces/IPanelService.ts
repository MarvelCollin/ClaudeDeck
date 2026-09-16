import { ISessionListing, ISharingResult, ISwitchResult, ISyncResult } from '../../accounts/interfaces';
import { IAliasBody } from './IAliasBody';
import { ILogView } from './ILogView';
import { IPanelState } from './IPanelState';
import { IScheduleDraft } from './IScheduleDraft';
import { IScheduleState } from './IScheduleState';
import { ISharingBody } from './ISharingBody';

export interface IPanelService {
  accountsState(): ISessionListing;
  forgetAccount(body: IAliasBody): { alias: string };
  install(): void;
  readLog(limit?: number): ILogView;
  reload(): void;
  runNow(): IScheduleState;
  saveSchedule(body: IScheduleDraft): IScheduleState;
  scheduleState(): IScheduleState;
  setSharing(body: ISharingBody): ISessionListing;
  startBackground(): IScheduleState;
  state(): IPanelState;
  stopBackground(): IScheduleState;
  switchAccount(body: IAliasBody): ISwitchResult;
  syncCurrent(): ISyncResult;
}
