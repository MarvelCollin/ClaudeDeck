import { IAccountIdentity } from './IAccountIdentity';
import { IOpenOptions } from './IOpenOptions';
import { IOpenResult } from './IOpenResult';
import { IAutoSyncResult } from './IAutoSyncResult';
import { ISessionListing } from './ISessionListing';
import { ISharingResult } from './ISharingResult';
import { ISwitchOptions } from './ISwitchOptions';
import { ISwitchResult } from './ISwitchResult';
import { ISyncOptions } from './ISyncOptions';
import { ISyncResult } from './ISyncResult';

export interface ISwitcher {
  autoSyncCode(): IAutoSyncResult | null;
  currentAccountUuid(): string | null;
  currentIdentity(): IAccountIdentity | null;
  closeAccount(alias: string): { alias: string; stopped: number };
  forget(alias: string): { alias: string };
  openAccount(alias: string, options?: IOpenOptions): IOpenResult;
  listSessions(): ISessionListing;
  setSharing(enabled: boolean): ISharingResult;
  sharingEnabled(): boolean;
  swappedDesktopItems(): string[];
  switchTo(alias: string, options?: ISwitchOptions): ISwitchResult;
  sync(options?: ISyncOptions): ISyncResult;
}
