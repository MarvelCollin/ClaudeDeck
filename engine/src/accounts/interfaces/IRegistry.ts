import { ICachedIdentity } from './ICachedIdentity';
import { IProfileEntry } from './IProfileEntry';
import { IRegistrySettings } from './IRegistrySettings';
import { ISavedSession } from './ISavedSession';

export interface IRegistry {
  version: number;
  profiles: IProfileEntry[];
  identities: Record<string, ICachedIdentity>;
  sessions: ISavedSession[];
  settings: IRegistrySettings;
}
