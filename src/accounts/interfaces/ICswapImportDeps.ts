export interface ICswapImportDeps {
  slotOf: (alias: string) => string;
  registryFile: string | undefined;
  now: () => Date;
}
