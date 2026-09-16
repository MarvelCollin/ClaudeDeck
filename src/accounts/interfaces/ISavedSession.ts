export interface ISavedSession {
  alias: string;
  email: string;
  name: string;
  accountUuid: string | null;
  installs: string[];
  savedAt: string | null;
}
