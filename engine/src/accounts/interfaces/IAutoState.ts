import { IAutoDecision } from './IAutoDecision';
import { IAutoSettings } from './IAutoSettings';

export interface IAutoState {
  settings: IAutoSettings;
  preferredNext: string | null;
  held: string[];
  lastSwitchAt: string | null;
  lastManualSwitchAt: string | null;
  lastDesktopSwitchAt: string | null;
  lastDecision: IAutoDecision | null;
  lastDesktopDecision: IAutoDecision | null;
  heartbeatAt: string | null;
  pid: number | null;
}
