export interface IDeeplinkResult {
  url: string;
  alias: string | null;
  dir: string | null;
  pid: number | undefined;
  routed: boolean;
}
