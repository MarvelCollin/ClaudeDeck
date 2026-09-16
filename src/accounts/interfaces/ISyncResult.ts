export interface ISyncResult {
  alias: string;
  email: string;
  name: string;
  accountUuid: string | null;
  stopped: number;
  relaunched: boolean;
}
