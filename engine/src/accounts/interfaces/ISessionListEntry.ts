import { IAccountInstance } from './IAccountInstance';
import { IAccountUsage } from './IAccountUsage';
import { ISavedSession } from './ISavedSession';

export interface ISessionListEntry extends ISavedSession {
  active: boolean;
  desktopCaptured: boolean;
  usage: IAccountUsage | null;
  instance: IAccountInstance;
}
