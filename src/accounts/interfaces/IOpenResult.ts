export interface IOpenResult {
  alias: string;
  dir: string;
  pid: number | undefined;
  seededFrom: string | null;
  alreadyRunning: boolean;
}
