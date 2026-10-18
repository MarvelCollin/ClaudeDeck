import { IAutoDecision } from './IAutoDecision';
import { IRankedAccount } from './IRankedAccount';

export interface IAutoTick {
  decision: IAutoDecision;
  accounts: IRankedAccount[];
  next: IRankedAccount | null;
  switched: boolean;
  desktopDecision: IAutoDecision;
  desktopSwitched: boolean;
}
