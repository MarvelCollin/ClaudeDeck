import { IUsageWindow } from './IUsageWindow';

export interface IAccountUsage {
  orgUuid: string;
  sampledAt: string;
  session: IUsageWindow | null;
  weekly: IUsageWindow | null;
}
