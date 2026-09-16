import { Server } from 'node:http';

export interface IServerSession {
  port: number;
  token: string;
  url: string;
  close: () => void;
  server: Server;
}
