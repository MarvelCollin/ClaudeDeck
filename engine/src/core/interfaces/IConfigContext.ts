import { IAppConfig } from './IAppConfig';

export interface IConfigContext {
  config: IAppConfig;
  configPath: string;
  configHash: string;
  logPath: string;
}
