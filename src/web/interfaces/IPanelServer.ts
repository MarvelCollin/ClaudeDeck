import { Server } from 'node:http';
import { IServerSession } from './IServerSession';

export interface IPanelServer {
  listen(): Promise<IServerSession>;
  close(): void;
  connected(): boolean;
  server: Server;
  token: string;
}
