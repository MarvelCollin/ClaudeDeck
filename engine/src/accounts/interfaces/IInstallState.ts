export interface IInstallState {
  id: string;
  label: string;
  signedIn: boolean;
  email: string | null;
  name: string | null;
  accountUuid: string | null;
  alias: string | null;
  saved: boolean;
}
