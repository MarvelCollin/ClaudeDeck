export type AutoTrigger = 'limit' | 'at-limit' | 'expiring' | 'none';

export interface IAutoDecision {
  at: string;
  action: 'stay' | 'switch';
  from: string | null;
  target: string | null;
  trigger: AutoTrigger;
  reason: string;
}
