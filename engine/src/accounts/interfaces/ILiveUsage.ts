import { ILiveWindow } from './ILiveWindow';

export type LiveUsageStatus = 'ok' | 'relogin' | 'error' | 'no-login';

export interface ILiveUsage {
  status: LiveUsageStatus;
  fiveHour: ILiveWindow | null;
  sevenDay: ILiveWindow | null;
  fetchedAt: string | null;
  checkedAt: string | null;
  error: string | null;
  backoffUntil: string | null;
}
