import { IAccountIdentity } from './IAccountIdentity';
import { IClaudeInstall } from './IClaudeInstall';
import { IClaudeProcess } from './IClaudeProcess';
import { IIdentityLookupOptions } from './IIdentityLookupOptions';
import { IInstanceDeps } from './IInstanceDeps';

export interface ISwitcherDeps {
  profileDir: string;
  credPath: string;
  accountPath: string;
  installs?: IClaudeInstall[];
  sharedDir: string;
  slotOf: (alias: string) => string;
  registryFile: string | undefined;
  readIdentity: (profileDir: string, options: IIdentityLookupOptions) => IAccountIdentity | null;
  listProcesses: () => IClaudeProcess[];
  kill: (pids: number[]) => number;
  launch: (exe: string, args: string[]) => number | undefined;
  locate: () => string;
  instances?: Partial<IInstanceDeps>;
  now: () => Date;
}
