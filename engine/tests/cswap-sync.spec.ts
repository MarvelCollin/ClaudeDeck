import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createCswapWatcher, syncWithCswap } from '../src/accounts/cswap-sync';
import { ICswapSyncDeps } from '../src/accounts/interfaces';
import * as registry from '../src/accounts/registry';

type Envelope = { accounts: Record<string, unknown>[] };

function setup(theirs: Record<string, unknown>[], live: { email: string | null; block?: unknown } = { email: null }) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-sync-'));
  const registryFile = path.join(base, 'profiles.json');
  const credPath = path.join(base, '.credentials.json');
  if (live.block) fs.writeFileSync(credPath, JSON.stringify({ claudeAiOauth: live.block }));
  const pushes: Envelope[] = [];
  let exports = 0;
  const deps: ICswapSyncDeps = {
    exportCswap: () => {
      exports += 1;
      return { accounts: theirs };
    },
    importCswap: envelope => pushes.push(envelope as Envelope),
    slotOf: alias => path.join(base, 'sessions', alias),
    registryFile,
    credPath,
    codeEmail: () => live.email,
    now: () => new Date('2026-10-19T00:00:00Z'),
  };
  const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
  const slot = (alias: string, file = 'code.json') => path.join(base, 'sessions', alias, file);
  const save = (alias: string, email: string, block: unknown) => {
    const data = registry.saveSession(registry.read(registryFile), { alias, email, name: alias, orgUuid: `deck-org-${alias}`, installs: ['code'] });
    registry.write(data, registryFile);
    fs.mkdirSync(path.dirname(slot(alias)), { recursive: true });
    fs.writeFileSync(slot(alias), JSON.stringify(block));
    fs.writeFileSync(slot(alias, 'account.json'), JSON.stringify({ emailAddress: email }));
  };
  return { base, deps, pushes, read, slot, save, exports: () => exports };
}

const token = (name: string, expiresAt: number) => ({ accessToken: `a-${name}`, refreshToken: `r-${name}`, expiresAt });

const cswapAccount = (number: number, email: string, block: unknown) => ({
  number,
  email,
  uuid: `uuid-${number}`,
  organizationUuid: `org-${number}`,
  organizationName: `Org ${number}`,
  credentials: { claudeAiOauth: block },
  config: { oauthAccount: { emailAddress: email } },
});

test('the newer login wins on each side and pushes keep the cswap slot and org', () => {
  const h = setup([cswapAccount(1, 'a@x.com', token('a-new', 9000)), cswapAccount(2, 'b@x.com', token('b-old', 1000))]);
  try {
    h.save('a', 'a@x.com', token('a-old', 1000));
    h.save('b', 'b@x.com', token('b-new', 9000));

    const result = syncWithCswap(h.deps);

    assert.deepStrictEqual(result.pulled, ['a']);
    assert.deepStrictEqual(result.pushed, ['b']);
    assert.strictEqual(h.read(h.slot('a')).refreshToken, 'r-a-new');
    const pushed = h.pushes[0]?.accounts[0] as Record<string, unknown>;
    assert.strictEqual(pushed.number, 2);
    assert.strictEqual(pushed.organizationUuid, 'org-2');
    assert.deepStrictEqual(pushed.credentials, { claudeAiOauth: token('b-new', 9000) });
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('a login cswap filed under the wrong email is never pulled and gets replaced', () => {
  const h = setup([cswapAccount(2, 'b@x.com', token('d', 9999)), cswapAccount(4, 'd@x.com', token('d', 9999))]);
  try {
    h.save('b', 'b@x.com', token('b', 5000));

    const result = syncWithCswap(h.deps);

    assert.deepStrictEqual(result.pulled, []);
    assert.deepStrictEqual(result.pushed, ['b']);
    assert.strictEqual(h.read(h.slot('b')).refreshToken, 'r-b');
    assert.deepStrictEqual((h.pushes[0]?.accounts[0] as Record<string, unknown>).credentials, { claudeAiOauth: token('b', 5000) });
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('the account Claude Code uses pushes its live login and new accounts get the next slot', () => {
  const h = setup([cswapAccount(3, 'c@x.com', token('c', 100))], { email: 'live@x.com', block: token('live', 8000) });
  try {
    h.save('live', 'live@x.com', token('live-stale', 10));

    const result = syncWithCswap(h.deps);

    assert.deepStrictEqual(result.pulled, ['c-x.com']);
    const pushed = h.pushes[0]?.accounts[0] as Record<string, unknown>;
    assert.strictEqual(pushed.number, 4);
    assert.strictEqual(pushed.organizationUuid, 'deck-org-live');
    assert.deepStrictEqual(pushed.credentials, { claudeAiOauth: token('live', 8000) });
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('the live account is pushed even when cswap reports the same login, so its stale backup is replaced', () => {
  const h = setup([cswapAccount(2, 'live@x.com', token('live', 8000))], { email: 'live@x.com', block: token('live', 8000) });
  try {
    h.save('live', 'live@x.com', token('live', 8000));
    assert.deepStrictEqual(syncWithCswap(h.deps).pushed, ['live']);
    assert.strictEqual((h.pushes[0]?.accounts[0] as Record<string, unknown>).number, 2);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('nothing is pushed when both sides already match', () => {
  const h = setup([cswapAccount(1, 'a@x.com', token('a', 5000))]);
  try {
    h.save('a', 'a@x.com', token('a', 5000));
    assert.deepStrictEqual(syncWithCswap(h.deps), { pulled: [], pushed: [] });
    assert.strictEqual(h.pushes.length, 0);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('the watcher only runs cswap when either side changed', () => {
  const h = setup([cswapAccount(1, 'a@x.com', token('a', 5000))]);
  try {
    h.save('a', 'a@x.com', token('a', 5000));
    let theirs = 'one';
    const watcher = createCswapWatcher(h.deps, () => theirs);

    assert.ok(watcher.check());
    assert.strictEqual(watcher.check(), null);
    theirs = 'two';
    assert.ok(watcher.check());
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(h.slot('a'), later, later);
    assert.ok(watcher.check());
    assert.strictEqual(h.exports(), 3);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});
