import { IAccountIdentity } from './IAccountIdentity';
import { IInstallState } from './IInstallState';
import { ISessionListEntry } from './ISessionListEntry';

export interface ISessionListing {
  running: boolean;
  current: IAccountIdentity | null;
  accountUuid: string | null;
  unknownAccount: boolean;
  shareSession: boolean;
  sharedItems: readonly string[];
  sharedCodeItems: readonly string[];
  installs: IInstallState[];
  sessions: ISessionListEntry[];
}
