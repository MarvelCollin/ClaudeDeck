import { ISavedSession } from './ISavedSession';

export interface ISessionListEntry extends ISavedSession {
  active: boolean;
  desktopCaptured: boolean;
}
