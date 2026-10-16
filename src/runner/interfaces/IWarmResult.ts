export type WarmAction = 'warmed' | 'failed' | 'skipped';

export interface IWarmResult {
  alias: string;
  action: WarmAction;
  reason: string;
  rotated: boolean;
}
