export interface IHandlerResult {
  supported: boolean;
  installed: boolean;
  changed: boolean;
  command: string | null;
  fallbackCommand: string | null;
}
