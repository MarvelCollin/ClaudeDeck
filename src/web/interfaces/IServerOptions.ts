import { IPanelService } from './IPanelService';

export interface IServerOptions {
  token?: string;
  idleTimeout?: number;
  startupTimeout?: number;
  service?: IPanelService;
}
