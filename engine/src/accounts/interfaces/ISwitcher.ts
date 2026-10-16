import { IAccountIdentity } from './IAccountIdentity';
import { ICodeSwitchOptions } from './ICodeSwitchOptions';
import { ICodeSwitchResult } from './ICodeSwitchResult';
import { IFreshDesktopResult } from './IFreshDesktopResult';
import { IAutoSyncResult } from './IAutoSyncResult';
import { ISavedSession } from './ISavedSession';
import { ISessionListing } from './ISessionListing';
import { ISwitchOptions } from './ISwitchOptions';
import { ISwitchResult } from './ISwitchResult';
import { ISyncOptions } from './ISyncOptions';
import { ISyncResult } from './ISyncResult';

export interface ISwitcher {
  autoSyncCode(): IAutoSyncResult | null;
  checkDesktopAdd(): IAccountIdentity | null;
  checkDesktopSave(): IAccountIdentity;
  checkDesktopSwitch(alias: string): ISavedSession;
  currentAccountUuid(): string | null;
  currentIdentity(): IAccountIdentity | null;
  forget(alias: string): { alias: string };
  freshDesktop(): IFreshDesktopResult;
  listSessions(): ISessionListing;
  switchTo(alias: string, options?: ISwitchOptions): ISwitchResult;
  switchCode(alias: string, options?: ICodeSwitchOptions): ICodeSwitchResult;
  currentCodeIdentity(install?: string): IAccountIdentity | null;
  sync(options?: ISyncOptions): ISyncResult;
}
