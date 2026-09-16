import crypto from 'node:crypto';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { errorMessage } from '../core/fs/json';
import { IPanelServer, IServerOptions, IServerSession } from './interfaces';
import { buildRoutes } from './routes';
import { createService } from './service';
import { renderPage } from './view/page';

const HOST = '127.0.0.1';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const TOKEN_HEADER = 'x-claudedeck-token';
const BODY_LIMIT = 65536;

export const IDLE_TIMEOUT = 10000;
export const STARTUP_TIMEOUT = 120000;
export const EVENTS_PATH = '/api/events';
const HEARTBEAT_INTERVAL = 2000;
const STREAM_KEEPALIVE_INTERVAL = 15000;

export function allowedHost(header: string | undefined): boolean {
  if (!header) return false;
  return LOCAL_HOSTS.has((header.split(':')[0] as string).toLowerCase());
}

export function readBody(req: IncomingMessage, limit = BODY_LIMIT): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: Buffer | string) => {
      raw += chunk;
      if (raw.length > limit) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        reject(new Error('Request body is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

export function startServer(options: IServerOptions = {}): IPanelServer {
  const token = options.token || crypto.randomBytes(24).toString('hex');
  const idleTimeout = options.idleTimeout || IDLE_TIMEOUT;
  const startupTimeout = options.startupTimeout || STARTUP_TIMEOUT;
  const routes = buildRoutes(options.service ?? createService());
  const streams = new Set<ServerResponse>();
  let lastSeen = Date.now();
  let opened = false;
  let closing = false;

  const server = http.createServer(async (req, res) => {
    if (!allowedHost(req.headers.host)) {
      sendJson(res, 403, { error: 'Forbidden host.' });
      return;
    }
    const url = new URL(req.url ?? '/', `http://${HOST}`);
    const supplied = req.headers[TOKEN_HEADER] ?? url.searchParams.get('token');

    if (url.pathname === '/' && req.method === 'GET') {
      if (supplied !== token) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('Forbidden. Open the URL printed in your terminal.');
        return;
      }
      lastSeen = Date.now();
      opened = true;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(renderPage(token));
      return;
    }

    if (supplied !== token) {
      sendJson(res, 403, { error: 'Forbidden.' });
      return;
    }
    lastSeen = Date.now();

    if (url.pathname === EVENTS_PATH) {
      openStream(req, res);
      return;
    }

    if (url.pathname === '/api/close') {
      sendJson(res, 200, { ok: true });
      close();
      return;
    }

    const handler = routes[url.pathname];
    if (!handler) {
      sendJson(res, 404, { error: 'Not found.' });
      return;
    }

    try {
      const body = req.method === 'POST' ? await readBody(req) : {};
      sendJson(res, 200, handler(body) ?? { ok: true });
    } catch (error) {
      sendJson(res, 400, { error: errorMessage(error) });
    }
  });

  server.timeout = 0;
  server.headersTimeout = 0;
  server.requestTimeout = 0;

  function openStream(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    req.socket.setKeepAlive(true);
    streams.add(res);
    const drop = (): void => {
      streams.delete(res);
      lastSeen = Date.now();
    };
    req.on('close', drop);
    req.on('error', drop);
  }

  const heartbeat = setInterval(() => {
    if (streams.size > 0) {
      lastSeen = Date.now();
      return;
    }
    if (Date.now() - lastSeen > (opened ? idleTimeout : startupTimeout)) close();
  }, HEARTBEAT_INTERVAL);
  heartbeat.unref();

  const keepalive = setInterval(() => {
    for (const stream of streams) stream.write(': keepalive\n\n');
  }, STREAM_KEEPALIVE_INTERVAL);
  keepalive.unref();

  function close(): void {
    if (closing) return;
    closing = true;
    clearInterval(heartbeat);
    clearInterval(keepalive);
    for (const stream of streams) stream.end();
    streams.clear();
    server.close();
    setTimeout(() => server.closeAllConnections?.(), 250).unref();
  }

  function listen(): Promise<IServerSession> {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, HOST, () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        resolve({ port, token, url: `http://${HOST}:${port}/?token=${token}`, close, server });
      });
    });
  }

  return { listen, close, connected: () => opened, server, token };
}

export { buildRoutes };
