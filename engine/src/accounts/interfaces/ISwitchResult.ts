import { IRestoreResult } from './IRestoreResult';

export interface ISwitchResult extends IRestoreResult {
  alias: string;
  email: string;
  name: string;
  stopped: number;
  relaunched: boolean;
  sharedItems: string[];
}
