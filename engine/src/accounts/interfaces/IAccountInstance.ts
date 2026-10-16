import { IAccountUsage } from './IAccountUsage';

export interface IAccountInstance {
  alias: string;
  dir: string;
  seeded: boolean;
  signedIn: boolean;
  running: boolean;
  pids: number[];
  usage: IAccountUsage | null;
}
