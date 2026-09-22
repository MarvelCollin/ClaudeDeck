export interface IDeeplinkHandler {
  command: string | null;
  fallbackCommand: string | null;
  created: boolean;
}

export interface IDeeplinkState {
  version: number;
  alias: string | null;
  dir: string | null;
  at: string | null;
  handler: IDeeplinkHandler;
}
