import { Server } from 'node:http';
import { IServerSession } from './IServerSession';

export interface IPanelServer {
  listen(): Promise<IServerSession>;
  close(): void;
  server: Server;
  token: string;
}
