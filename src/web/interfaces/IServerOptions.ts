import { IPanelService } from './IPanelService';

export interface IServerOptions {
  token?: string;
  idleTimeout?: number;
  service?: IPanelService;
}
