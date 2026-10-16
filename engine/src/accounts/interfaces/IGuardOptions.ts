export interface IGuardOptions {
  seconds?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface IGuardResult {
  seconds: number;
  claims: number;
}
