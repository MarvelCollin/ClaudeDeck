import { IAccountIdentity } from './IAccountIdentity';
import { IClaudeProcess } from './IClaudeProcess';
import { IIdentityLookupOptions } from './IIdentityLookupOptions';

export interface ISwitcherDeps {
  profileDir: string;
  credPath: string;
  accountPath: string;
  sharedDir: string;
  slotOf: (alias: string) => string;
  registryFile: string | undefined;
  readIdentity: (profileDir: string, options: IIdentityLookupOptions) => IAccountIdentity | null;
  listProcesses: () => IClaudeProcess[];
  kill: (pids: number[]) => number;
  launch: (exe: string, args: string[]) => number | undefined;
  locate: () => string;
  now: () => Date;
}
