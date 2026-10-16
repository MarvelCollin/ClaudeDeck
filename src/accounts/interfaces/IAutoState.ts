import { IAutoDecision } from './IAutoDecision';
import { IAutoSettings } from './IAutoSettings';

export interface IAutoState {
  settings: IAutoSettings;
  preferredNext: string | null;
  held: string[];
  lastSwitchAt: string | null;
  lastDecision: IAutoDecision | null;
  heartbeatAt: string | null;
  pid: number | null;
}
