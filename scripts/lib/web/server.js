const crypto = require('crypto');
const http = require('http');
const { URL } = require('url');
const manager = require('../profiles/manager');
const { createService } = require('./service');
const { renderPage } = require('./page');

const HOST = '127.0.0.1';
const IDLE_TIMEOUT = 10000;
const HEARTBEAT_INTERVAL = 2000;

function allowedHost(header) {
  if (!header) return false;
  const host = header.split(':')[0].toLowerCase();
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]';
}

function readBody(req, limit = 65536) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > limit) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Request body is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function buildRoutes(service) {
  return {
    '/api/state': () => service.state(),
    '/api/ping': () => ({ ok: true }),
    '/api/schedule/save': body => service.saveSchedule(body),
    '/api/schedule/start': () => service.startBackground(),
    '/api/schedule/stop': () => service.stopBackground(),
    '/api/schedule/run': () => service.runNow(),
    '/api/schedule/log': () => service.readLog(),
    '/api/profiles/add': body => manager.addProfile(body.name),
    '/api/profiles/label': body => manager.labelProfile(body.alias, body.label),
    '/api/profiles/remove': body => manager.removeProfile(body.alias),
    '/api/profiles/launch': body => manager.launchProfile(body.alias),
    '/api/profiles/stop': body => manager.stopProfile(body.alias),
  };
}

function startServer(options = {}) {
  const token = options.token || crypto.randomBytes(24).toString('hex');
  const idleTimeout = options.idleTimeout || IDLE_TIMEOUT;
  const service = options.service || createService();
  const routes = buildRoutes(service);
  let lastSeen = Date.now();
  let closing = false;

  const server = http.createServer(async (req, res) => {
    if (!allowedHost(req.headers.host)) {
      sendJson(res, 403, { error: 'Forbidden host.' });
      return;
    }
    const url = new URL(req.url, `http://${HOST}`);
    const supplied = req.headers['x-claudecron-token'] || url.searchParams.get('token');

    if (url.pathname === '/' && req.method === 'GET') {
      if (supplied !== token) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('Forbidden. Open the URL printed in your terminal.');
        return;
      }
      lastSeen = Date.now();
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(renderPage(token));
      return;
    }

    if (supplied !== token) {
      sendJson(res, 403, { error: 'Forbidden.' });
      return;
    }
    lastSeen = Date.now();

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
      sendJson(res, 200, handler(body) || { ok: true });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  });

  const heartbeat = setInterval(() => {
    if (Date.now() - lastSeen > idleTimeout) close();
  }, HEARTBEAT_INTERVAL);
  heartbeat.unref();

  function close() {
    if (closing) return;
    closing = true;
    clearInterval(heartbeat);
    server.close();
  }

  function listen() {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, HOST, () => {
        const { port } = server.address();
        resolve({ port, token, url: `http://${HOST}:${port}/?token=${token}`, close, server });
      });
    });
  }

  return { listen, close, server, token };
}

module.exports = {
  IDLE_TIMEOUT,
  allowedHost,
  buildRoutes,
  startServer,
};
