export interface ILiveUsageDeps {
  fetch: typeof fetch;
  now: () => Date;
  cacheFile: string;
  minIntervalMs: number;
}
