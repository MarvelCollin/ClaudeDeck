import { ILiveWindow } from './ILiveWindow';
import { LiveUsageStatus } from './ILiveUsage';

export type RankTier = 'live' | 'idle' | 'unknown';

export interface IRankedAccount {
  alias: string;
  email: string;
  active: boolean;
  held: boolean;
  status: LiveUsageStatus | 'unchecked';
  fiveHour: ILiveWindow | null;
  sevenDay: ILiveWindow | null;
  usedPercent: number;
  tier: RankTier;
  rank: number;
  hasRoom: boolean;
}
