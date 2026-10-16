import { IAccountIdentity } from './IAccountIdentity';
import { IInstallState } from './IInstallState';
import { ISessionListEntry } from './ISessionListEntry';

export interface ISessionListing {
  running: boolean;
  current: IAccountIdentity | null;
  accountUuid: string | null;
  unknownAccount: boolean;
  installs: IInstallState[];
  sessions: ISessionListEntry[];
}
