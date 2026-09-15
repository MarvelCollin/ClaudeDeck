const crypto = require('crypto');
const http = require('http');
const { URL } = require('url');
const manager = require('./manager');
const { renderPage } = require('./page');

const HOST = '127.0.0.1';
const IDLE_TIMEOUT = 10000;
const HEARTBEAT_INTERVAL = 2000;

function allowedHost(header) {
  if (!header) return false;
  const host = header.split(':')[0].toLowerCase();
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]';
}

function readBody(req, limit = 8192) {
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
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(body);
}

function startServer(options = {}) {
  const token = options.token || crypto.randomBytes(24).toString('hex');
  const idleTimeout = options.idleTimeout || IDLE_TIMEOUT;
  let lastSeen = Date.now();
  let closing = false;

  const handlers = {
    '/api/state': () => ({ profiles: manager.listProfiles() }),
    '/api/add': body => manager.addProfile(body.alias),
    '/api/remove': body => manager.removeProfile(body.alias),
    '/api/launch': body => manager.launchProfile(body.alias),
    '/api/stop': body => manager.stopProfile(body.alias),
    '/api/ping': () => ({ ok: true }),
  };

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
        res.end('Forbidden. Open the URL printed by ClaudeCron.');
        return;
      }
      lastSeen = Date.now();
      const html = renderPage(token);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html);
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

    const handler = handlers[url.pathname];
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
  startServer,
};
