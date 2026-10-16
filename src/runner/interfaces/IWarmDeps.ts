import { ILiveUsage, ILiveUsageTarget } from '../../accounts/interfaces';
import { IInvocation } from '../../core/interfaces';
import { IWarmAccount } from './IWarmAccount';
import { IWarmRun } from './IWarmRun';

export interface IWarmDeps {
  accounts: () => readonly IWarmAccount[];
  codeEmail: () => string | null;
  held: () => readonly string[];
  refresh: (targets: ILiveUsageTarget[]) => Promise<Record<string, ILiveUsage>>;
  credPath: string;
  slotDir: (alias: string) => string;
  tempRoot: string;
  fetch: typeof fetch;
  now: () => Date;
  invocation: () => IInvocation;
  run: (invocation: IInvocation, env: NodeJS.ProcessEnv) => IWarmRun;
}
