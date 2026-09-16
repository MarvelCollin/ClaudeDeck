import { ISessionListing } from '../../accounts/interfaces';
import { IScheduleState } from './IScheduleState';

export interface IPanelState {
  schedule: IScheduleState;
  accounts: ISessionListing;
}
