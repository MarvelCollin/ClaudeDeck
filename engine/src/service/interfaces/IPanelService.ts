import { IOpenResult, ISessionListing, ISharingResult, ISwitchResult, ISyncResult } from '../../accounts/interfaces';
import { IAliasBody } from './IAliasBody';
import { IInstallBody } from './IInstallBody';
import { ILogView } from './ILogView';
import { IPanelState } from './IPanelState';
import { IScheduleDraft } from './IScheduleDraft';
import { IScheduleState } from './IScheduleState';
import { ISharingBody } from './ISharingBody';

export interface IPanelService {
  accountsState(): ISessionListing;
  closeAccount(body: IAliasBody): { alias: string; stopped: number };
  forgetAccount(body: IAliasBody): { alias: string };
  openAccount(body: IAliasBody): IOpenResult;
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
  syncCurrent(body: IInstallBody): ISyncResult;
}
