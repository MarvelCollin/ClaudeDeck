import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createLiveUsage, needsRefresh, parseUsage, targetsFor, TOKEN_URL, USAGE_URL } from '../src/accounts/live-usage';

const NOW = new Date('2026-10-16T06:00:00Z');

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cd-live-'));
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value), 'utf8');
}

function fakeFetch(routes: Record<string, () => { status: number; body: unknown }>, calls: string[]): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const route = routes[url];
    if (!route) throw new Error(`unexpected ${url}`);
    const { status, body } = route();
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

const usageBody = {
  five_hour: { utilization: 42, resets_at: '2026-10-16T08:00:00Z' },
  seven_day: { utilization: 26.5, resets_at: '2026-10-20T11:00:00Z' },
};

test('usage parsing keeps the used percent and the reset time of both windows', () => {
  const parsed = parseUsage(usageBody);
  assert.deepStrictEqual(parsed.fiveHour, { usedPercent: 42, resetsAt: '2026-10-16T08:00:00Z' });
  assert.deepStrictEqual(parsed.sevenDay, { usedPercent: 26.5, resetsAt: '2026-10-20T11:00:00Z' });
  assert.deepStrictEqual(parseUsage({}), { fiveHour: null, sevenDay: null });
});

test('a token close to expiry needs a refresh', () => {
  assert.ok(needsRefresh({ accessToken: 'a', expiresAt: NOW.getTime() + 60_000 }, NOW));
  assert.ok(!needsRefresh({ accessToken: 'a', expiresAt: NOW.getTime() + 3_600_000 }, NOW));
  assert.ok(needsRefresh({}, NOW));
});

test('an idle account refreshes its token, saves the rotated one and reads usage', async () => {
  const dir = tempDir();
  try {
    const slot = path.join(dir, 'slot', 'code.json');
    writeJson(slot, { accessToken: 'old', refreshToken: 'r1', expiresAt: NOW.getTime() - 1000, subscriptionType: 'pro' });
    const calls: string[] = [];
    const live = createLiveUsage({
      now: () => NOW,
      cacheFile: path.join(dir, 'cache.json'),
      fetch: fakeFetch(
        {
          [TOKEN_URL]: () => ({ status: 200, body: { access_token: 'new', expires_in: 3600, refresh_token: 'r2' } }),
          [USAGE_URL]: () => ({ status: 200, body: usageBody }),
        },
        calls
      ),
    });
    const result = await live.fetchOne({ alias: 'idle', active: false, credPath: path.join(dir, 'creds.json'), slotFile: slot }, null);
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.fiveHour?.usedPercent, 42);
    assert.deepStrictEqual(calls, [TOKEN_URL, USAGE_URL]);
    const saved = JSON.parse(fs.readFileSync(slot, 'utf8'));
    assert.strictEqual(saved.accessToken, 'new');
    assert.strictEqual(saved.refreshToken, 'r2');
    assert.strictEqual(saved.subscriptionType, 'pro');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the active account is never refreshed, Claude Code owns that token', async () => {
  const dir = tempDir();
  try {
    const creds = path.join(dir, 'creds.json');
    writeJson(creds, { claudeAiOauth: { accessToken: 'live', refreshToken: 'r', expiresAt: NOW.getTime() - 1000 } });
    const calls: string[] = [];
    const live = createLiveUsage({ now: () => NOW, cacheFile: path.join(dir, 'cache.json'), fetch: fakeFetch({}, calls) });
    const result = await live.fetchOne({ alias: 'me', active: true, credPath: creds, slotFile: path.join(dir, 'x.json') }, null);
    assert.deepStrictEqual(calls, []);
    assert.match(result.error ?? '', /Claude Code refreshes/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a refresh token the server rejects marks the account for a new sign in', async () => {
  const dir = tempDir();
  try {
    const slot = path.join(dir, 'code.json');
    writeJson(slot, { accessToken: 'old', refreshToken: 'dead', expiresAt: 0 });
    const live = createLiveUsage({
      now: () => NOW,
      cacheFile: path.join(dir, 'cache.json'),
      fetch: fakeFetch({ [TOKEN_URL]: () => ({ status: 400, body: { error: 'invalid_grant' } }) }, []),
    });
    const result = await live.fetchOne({ alias: 'gone', active: false, credPath: '', slotFile: slot }, null);
    assert.strictEqual(result.status, 'relogin');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a busy usage endpoint backs off and keeps the last good numbers', async () => {
  const dir = tempDir();
  try {
    const creds = path.join(dir, 'creds.json');
    writeJson(creds, { claudeAiOauth: { accessToken: 'live', expiresAt: NOW.getTime() + 3_600_000 } });
    const cacheFile = path.join(dir, 'cache.json');
    const calls: string[] = [];
    const clock = new Date(Date.now() + 10_000);
    const live = createLiveUsage({
      now: () => clock,
      cacheFile,
      minIntervalMs: 0,
      fetch: fakeFetch({ [USAGE_URL]: () => ({ status: 429, body: {} }) }, calls),
    });
    const target = { alias: 'Me', active: true, credPath: creds, slotFile: '' };
    const previous = { status: 'ok' as const, ...parseUsage(usageBody), fetchedAt: '2026-10-16T05:00:00Z', checkedAt: '2026-10-16T05:00:00Z', error: null, backoffUntil: null };
    const result = await live.fetchOne(target, previous);
    assert.strictEqual(result.fiveHour?.usedPercent, 42);
    assert.ok(result.backoffUntil && Date.parse(result.backoffUntil) > clock.getTime());
    assert.ok(live.isFresh(target, { ...result }, clock));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('refreshAll serves a recent check from the cache without calling the network', async () => {
  const dir = tempDir();
  try {
    const creds = path.join(dir, 'creds.json');
    writeJson(creds, { claudeAiOauth: { accessToken: 'live', expiresAt: NOW.getTime() + 3_600_000 } });
    const cacheFile = path.join(dir, 'cache.json');
    const later = new Date(Date.now() + 10_000);
    writeJson(cacheFile, {
      me: { status: 'ok', ...parseUsage(usageBody), fetchedAt: later.toISOString(), checkedAt: later.toISOString(), error: null, backoffUntil: null },
    });
    const calls: string[] = [];
    const live = createLiveUsage({ now: () => later, cacheFile, fetch: fakeFetch({}, calls) });
    const result = await live.refreshAll([{ alias: 'Me', active: true, credPath: creds, slotFile: '' }]);
    assert.deepStrictEqual(calls, []);
    assert.strictEqual(result.me?.fiveHour?.usedPercent, 42);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('targets mark the account Claude Code is signed in to as active', () => {
  const targets = targetsFor(
    [
      { alias: 'a', email: 'A@x.com' },
      { alias: 'b', email: 'b@x.com' },
    ],
    'a@x.com',
    'creds',
    alias => `slots/${alias}`
  );
  assert.deepStrictEqual(
    targets.map(t => [t.alias, t.active, t.slotFile]),
    [
      ['a', true, 'slots/a'],
      ['b', false, 'slots/b'],
    ]
  );
});
