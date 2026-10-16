import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { importEnvelope } from '../src/accounts/cswap-import';
import * as registry from '../src/accounts/registry';

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-import-'));
  const registryFile = path.join(base, 'profiles.json');
  const slotOf = (alias: string) => path.join(base, 'sessions', alias);
  const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
  return { base, registryFile, slotOf, read, deps: { registryFile, slotOf, now: () => new Date('2026-10-16T00:00:00Z') } };
}

const account = (email: string, token: string, expiresAt: number, extra: Record<string, unknown> = {}) => ({
  number: 1,
  email,
  uuid: `uuid-${email}`,
  organizationUuid: `org-${email}`,
  credentials: { claudeAiOauth: { accessToken: token, refreshToken: `r-${token}`, expiresAt } },
  config: { oauthAccount: { emailAddress: email, displayName: `Name ${email}`, accountUuid: `uuid-${email}` } },
  ...extra,
});

test('cswap accounts land in their own slots with token, account and registry entry', () => {
  const h = setup();
  try {
    const result = importEnvelope({ accounts: [account('new@team.id', 'tok-new', 2000)] }, h.deps);
    assert.deepStrictEqual(result.added, ['new-team.id']);
    const slot = h.slotOf('new-team.id');
    assert.strictEqual(h.read(path.join(slot, 'code.json')).accessToken, 'tok-new');
    assert.strictEqual(h.read(path.join(slot, 'account.json')).emailAddress, 'new@team.id');
    const saved = registry.findSession(registry.read(h.registryFile), 'new-team.id');
    assert.strictEqual(saved?.name, 'Name new@team.id');
    assert.strictEqual(saved?.orgUuid, 'org-new@team.id');
    assert.deepStrictEqual(saved?.installs, ['code']);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('an account already here keeps its alias and only takes a fresher token', () => {
  const h = setup();
  try {
    registry.write(registry.saveSession(registry.emptyRegistry(), { alias: 'kolin', email: 'me@x.com', name: 'Kolin', installs: ['code'] }), h.registryFile);
    fs.mkdirSync(h.slotOf('kolin'), { recursive: true });
    fs.writeFileSync(path.join(h.slotOf('kolin'), 'code.json'), JSON.stringify({ accessToken: 'mine', expiresAt: 5000 }));

    const older = importEnvelope({ accounts: [account('me@x.com', 'theirs-old', 1000)] }, h.deps);
    assert.deepStrictEqual(older.kept, ['kolin']);
    assert.strictEqual(h.read(path.join(h.slotOf('kolin'), 'code.json')).accessToken, 'mine');

    const newer = importEnvelope({ accounts: [account('ME@x.com', 'theirs-new', 9000)] }, h.deps);
    assert.deepStrictEqual(newer.updated, ['kolin']);
    assert.strictEqual(h.read(path.join(h.slotOf('kolin'), 'code.json')).accessToken, 'theirs-new');
    assert.strictEqual(registry.read(h.registryFile).sessions.length, 1);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('api key accounts and entries without a login are skipped', () => {
  const h = setup();
  try {
    const result = importEnvelope(
      { accounts: [account('key@x.com', 'k', 1, { kind: 'api_key' }), { email: 'empty@x.com', credentials: {} }] },
      h.deps
    );
    assert.deepStrictEqual(result.skipped, ['key@x.com', 'empty@x.com']);
    assert.throws(() => importEnvelope({}, h.deps), /no accounts/);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});
