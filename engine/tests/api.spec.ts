import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { runApi, runApiCommand } from '../src/cli/api-command';

const saved = { ...process.env };
let base = '';

before(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-api-'));
  process.env.CLAUDEDECK_HOME = path.join(base, 'deck');
  process.env.USERPROFILE = path.join(base, 'home');
  process.env.HOME = path.join(base, 'home');
  process.env.APPDATA = path.join(base, 'Roaming');
  process.env.LOCALAPPDATA = path.join(base, 'Local');
  fs.mkdirSync(path.join(base, 'Roaming', 'Claude'), { recursive: true });
});

after(() => {
  process.env = saved;
  fs.rmSync(base, { recursive: true, force: true });
});

test('state on an empty deck lists no accounts and auto switch is off', async () => {
  const state = (await runApi('state')) as { sessions: unknown[]; auto: { running: boolean }; next: string | null; code: unknown };
  assert.deepStrictEqual(state.sessions, []);
  assert.strictEqual(state.auto.running, false);
  assert.strictEqual(state.next, null);
  assert.strictEqual(state.code, null);
});

test('routes that need an account ask for one, and unknown routes are refused', async () => {
  await assert.rejects(runApi('accounts/switch', {}), /Which account should I switch to/);
  await assert.rejects(runApi('accounts/switch', { code: true }), /Which account should Claude Code use/);
  await assert.rejects(runApi('accounts/switch', { alias: 'ghost' }), /No saved session for "ghost"/);
  await assert.rejects(runApi('accounts/save', {}), /Claude Desktop is not signed in/);
  await assert.rejects(runApi('auto/next', { alias: 'ghost' }), /No saved account/);
  await assert.rejects(runApi('nope'), /Unknown api route/);
});

test('auto settings are saved and clamped', async () => {
  const state = (await runApi('auto/settings', { threshold: 120, landing: 70 })) as { settings: { threshold: number; landing: number } };
  assert.strictEqual(state.settings.threshold, 100);
  assert.strictEqual(state.settings.landing, 70);
});

test('the command prints one JSON line with ok or the error', async () => {
  const lines: string[] = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    await runApiCommand(['nope']);
    await runApiCommand(['auto/settings', '{"cooldownSeconds":30}']);
  } finally {
    process.stdout.write = write;
  }
  assert.deepStrictEqual(JSON.parse(lines[0] ?? ''), { ok: false, error: 'Unknown api route "nope".' });
  const ok = JSON.parse(lines[1] ?? '');
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.data.settings.cooldownSeconds, 30);
});
