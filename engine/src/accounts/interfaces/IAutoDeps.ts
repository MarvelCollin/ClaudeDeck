import { ICswapSyncResult } from './ICswapSyncResult';
import { ILiveUsage } from './ILiveUsage';
import { ILiveUsageTarget } from './ILiveUsageTarget';
import { ISwitcher } from './ISwitcher';

export interface IAutoDeps {
  switcher: ISwitcher;
  refresh: (targets: ILiveUsageTarget[], minIntervalMs: number) => Promise<Record<string, ILiveUsage>>;
  stateFile: string;
  credPath: string;
  slotFile: (alias: string) => string;
  now: () => Date;
  log: (line: string) => void;
  cswap?: { check: () => ICswapSyncResult | null } | null;
}
