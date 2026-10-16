export interface IOpenResult {
  alias: string;
  dir: string;
  pid: number | undefined;
  seededFrom: string | null;
  wiped: boolean;
  signedIn: boolean;
  loginRouted: boolean;
  alreadyRunning: boolean;
}
