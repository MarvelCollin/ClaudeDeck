export interface ISyncResult {
  alias: string;
  email: string;
  name: string;
  accountUuid: string | null;
  install: string;
  stopped: number;
  relaunched: boolean;
}
