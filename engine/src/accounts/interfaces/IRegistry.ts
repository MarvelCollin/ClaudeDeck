import { ISavedSession } from './ISavedSession';

export interface IRegistry {
  version: number;
  sessions: ISavedSession[];
}
