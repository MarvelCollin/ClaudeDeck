import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import * as registry from '../src/accounts/registry';
import { createSwitcher } from '../src/accounts/switcher';

function harness() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-codeswitch-'));
  const profileDir = path.join(base, 'Claude');
  const credPath = path.join(base, '.claude', '.credentials.json');
  const accountPath = path.join(base, '.claude.json');
  const registryFile = path.join(base, 'profiles.json');
  const slotOf = (alias: string) => path.join(base, 'sessions', alias);
  const events: string[] = [];
  fs.mkdirSync(profileDir, { recursive: true });
  const deps = {
    profileDir,
    credPath,
    accountPath,
    slotOf,
    registryFile,
    installs: [],
    readIdentity: () => null,
    listProcesses: () => [],
    kill: (pids: number[]) => pids.length,
    launch: () => {
      events.push('launched');
      return 1;
    },
    locate: () => 'C:/Claude.exe',
    now: () => new Date('2026-10-16T00:00:00Z'),
  };
  const write = (file: string, value: unknown) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value), 'utf8');
  };
  const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
  const account = (email: string, uuid: string) => ({ emailAddress: email, accountUuid: uuid, displayName: email.split('@')[0] });
  const saveAccount = (alias: string, email: string, token: string, uuid: string) => {
    write(path.join(slotOf(alias), 'code.json'), { accessToken: token });
    write(path.join(slotOf(alias), 'account.json'), account(email, uuid));
    const data = registry.saveSession(registry.read(registryFile), { alias, email, name: alias, accountUuid: uuid, installs: ['code'] });
    registry.write(data, registryFile);
  };
  return { base, deps, credPath, accountPath, slotOf, write, read, account, saveAccount, events };
}

test('switching Claude Code alone swaps the token and the account, and keeps the leaving login', () => {
  const h = harness();
  try {
    h.saveAccount('a', 'a@x.com', 'tok-A-old', 'uuid-a');
    h.saveAccount('b', 'b@x.com', 'tok-B', 'uuid-b');
    h.write(h.credPath, { claudeAiOauth: { accessToken: 'tok-A-live' }, mcpOAuth: { keep: 1 } });
    h.write(h.accountPath, { oauthAccount: h.account('a@x.com', 'uuid-a'), projects: { keep: true } });

    const result = createSwitcher(h.deps).switchCode('b');

    assert.strictEqual(result.previous, 'a');
    assert.ok(result.accountRestored);
    const creds = h.read(h.credPath);
    assert.strictEqual(creds.claudeAiOauth.accessToken, 'tok-B');
    assert.deepStrictEqual(creds.mcpOAuth, { keep: 1 });
    const config = h.read(h.accountPath);
    assert.strictEqual(config.oauthAccount.emailAddress, 'b@x.com');
    assert.deepStrictEqual(config.projects, { keep: true });
    assert.strictEqual(h.read(path.join(h.slotOf('a'), 'code.json')).accessToken, 'tok-A-live');
    assert.deepStrictEqual(h.events, []);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('a slot without a saved account file gets one built from the registry', () => {
  const h = harness();
  try {
    h.saveAccount('b', 'b@x.com', 'tok-B', 'uuid-b');
    fs.rmSync(path.join(h.slotOf('b'), 'account.json'));
    h.write(h.credPath, { claudeAiOauth: { accessToken: 'tok-other' } });
    h.write(h.accountPath, { oauthAccount: h.account('stranger@x.com', 'uuid-s') });

    const result = createSwitcher(h.deps).switchCode('b');

    assert.strictEqual(result.previous, null);
    const config = h.read(h.accountPath);
    assert.strictEqual(config.oauthAccount.emailAddress, 'b@x.com');
    assert.strictEqual(config.oauthAccount.accountUuid, 'uuid-b');
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('switching Claude Code refuses an account with no saved Claude Code login', () => {
  const h = harness();
  try {
    h.saveAccount('b', 'b@x.com', 'tok-B', 'uuid-b');
    fs.rmSync(path.join(h.slotOf('b'), 'code.json'));
    assert.throws(() => createSwitcher(h.deps).switchCode('b'), /No saved Claude Code login/);
    assert.throws(() => createSwitcher(h.deps).switchCode('ghost'), /No saved session/);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('the Claude Code login is mirrored into its own account, not the Desktop one', () => {
  const h = harness();
  try {
    h.saveAccount('a', 'a@x.com', 'tok-A', 'uuid-a');
    h.saveAccount('b', 'b@x.com', 'tok-B', 'uuid-b');
    const deps = { ...h.deps, readIdentity: () => ({ email: 'a@x.com', name: 'a', accountUuid: 'uuid-a' }) };
    h.write(h.credPath, { claudeAiOauth: { accessToken: 'tok-B-rotated' } });
    h.write(h.accountPath, { oauthAccount: h.account('b@x.com', 'uuid-b') });

    const synced = createSwitcher(deps).autoSyncCode();

    assert.deepStrictEqual(synced, { alias: 'b', updated: true });
    assert.strictEqual(h.read(path.join(h.slotOf('b'), 'code.json')).accessToken, 'tok-B-rotated');
    assert.strictEqual(h.read(path.join(h.slotOf('a'), 'code.json')).accessToken, 'tok-A');
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});
