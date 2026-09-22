export interface IOpenResult {
  alias: string;
  dir: string;
  pid: number | undefined;
  seededFrom: string | null;
  signedIn: boolean;
  loginRouted: boolean;
  alreadyRunning: boolean;
}
