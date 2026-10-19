export interface ICswapSyncDeps {
  exportCswap: () => unknown;
  importCswap: (envelope: unknown) => void;
  slotOf: (alias: string) => string;
  registryFile: string | undefined;
  credPath: string;
  codeEmail: () => string | null;
  now: () => Date;
}
