export type WindowOpenAction = 'focused' | 'opened' | 'prepared';

export interface IWindowOpenResult {
  alias: string;
  name: string;
  profileDir: string;
  isDefault: boolean;
  action: WindowOpenAction;
}
