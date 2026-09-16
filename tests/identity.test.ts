import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import * as identity from '../src/accounts/identity';
import * as session from '../src/accounts/session-store';
import { createSwitcher } from '../src/accounts/switcher';

function writeDesktopConfig(dir, extra) {
  fs.mkdirSync(dir, { recursive: true });
  const base = { locale: 'en-US', bootFrameLayout: { width: 288 } };
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ ...base, ...extra }));
}

function writeCodeAccount(file, accountUuid, emailAddress, displayName) {
  fs.writeFileSync(file, JSON.stringify({ numStartups: 3, oauthAccount: { accountUuid, emailAddress, displayName } }));
}

function seedDesktop(dir, cookie) {
  fs.mkdirSync(path.join(dir, 'Network'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Network', 'Cookies'), cookie);
  fs.writeFileSync(path.join(dir, 'Local State'), `state-${cookie}`);
  fs.mkdirSync(path.join(dir, 'Local Storage'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Local Storage', 'leveldb.log'), `ls-${cookie}`);
}

function switcherHarness() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-ident-'));
  const profileDir = path.join(base, 'Claude');
  const events: string[] = [];
  const deps = {
    profileDir,
    credPath: path.join(base, '.credentials.json'),
    accountPath: path.join(base, '.claude.json'),
    sharedDir: path.join(base, 'shared'),
    slotOf: alias => path.join(base, 'sessions', alias),
    registryFile: path.join(base, 'profiles.json'),
    listProcesses: () => (events.includes('killed') ? [] : [{ pid: 10, commandLine: 'Claude.exe' }]),
    kill: pids => { if (pids.length) events.push('killed'); return pids.length; },
    launch: () => { events.push('launched'); return 999; },
    locate: () => 'C:/Claude.exe',
    now: () => new Date('2026-05-05T00:00:00Z'),
  };
  return { base, profileDir, deps, events };
}

test('readDesktopAccountUuid reads the active account id from config.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-uuid-'));
  try {
    assert.strictEqual(identity.readDesktopAccountUuid(dir), null);
    writeDesktopConfig(dir, {});
    assert.strictEqual(identity.readDesktopAccountUuid(dir), null);
    writeDesktopConfig(dir, { lastKnownAccountUuid: 'uuid-a' });
    assert.strictEqual(identity.readDesktopAccountUuid(dir), 'uuid-a');
    fs.writeFileSync(path.join(dir, 'config.json'), 'not json');
    assert.strictEqual(identity.readDesktopAccountUuid(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readCodeAccount pulls the email and name out of the Claude Code account file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-code-acct-'));
  try {
    const file = path.join(dir, '.claude.json');
    assert.strictEqual(identity.readCodeAccount(file), null);
    writeCodeAccount(file, 'uuid-a', 'a@team.com', 'Person A');
    assert.deepStrictEqual(identity.readCodeAccount(file), { accountUuid: 'uuid-a', email: 'a@team.com', name: 'Person A' });
    fs.writeFileSync(file, JSON.stringify({ oauthAccount: { accountUuid: 'uuid-b', emailAddress: 'b@team.com' } }));
    assert.strictEqual(identity.readCodeAccount(file)!.name, 'b');
    fs.writeFileSync(file, JSON.stringify({ oauthAccount: {} }));
    assert.strictEqual(identity.readCodeAccount(file), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readIdentity names the desktop account from the Claude Code account file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-resolve-'));
  try {
    const profileDir = path.join(dir, 'Claude');
    const codeFile = path.join(dir, '.claude.json');
    writeDesktopConfig(profileDir, { lastKnownAccountUuid: 'uuid-a' });
    writeCodeAccount(codeFile, 'uuid-a', 'a@team.com', 'Person A');
    assert.deepStrictEqual(identity.readIdentity(profileDir, { codeAccountPath: codeFile }), {
      accountUuid: 'uuid-a',
      email: 'a@team.com',
      name: 'Person A',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readIdentity falls back to a saved account and refuses to guess a stale one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-stale-'));
  try {
    const profileDir = path.join(dir, 'Claude');
    const codeFile = path.join(dir, '.claude.json');
    writeDesktopConfig(profileDir, { lastKnownAccountUuid: 'uuid-b' });
    writeCodeAccount(codeFile, 'uuid-a', 'a@team.com', 'Person A');

    const lookup = uuid => (uuid === 'uuid-b' ? { email: 'b@team.com', name: 'Person B' } : null);
    assert.deepStrictEqual(identity.readIdentity(profileDir, { codeAccountPath: codeFile, lookup }), {
      accountUuid: 'uuid-b',
      email: 'b@team.com',
      name: 'Person B',
    });
    assert.strictEqual(identity.readIdentity(profileDir, { codeAccountPath: codeFile }), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('only the account scoped config keys are swapped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-config-'));
  try {
    const profileDir = path.join(dir, 'Claude');
    const configPath = path.join(profileDir, 'config.json');
    const slotFile = path.join(dir, 'slot', 'config.json');
    writeDesktopConfig(profileDir, { lastKnownAccountUuid: 'uuid-a', 'oauth:tokenCache': 'token-a' });

    assert.ok(session.snapshotConfig(configPath, slotFile));
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(slotFile, 'utf8')), {
      lastKnownAccountUuid: 'uuid-a',
      'oauth:tokenCache': 'token-a',
    });

    writeDesktopConfig(profileDir, { lastKnownAccountUuid: 'uuid-b', 'oauth:tokenCacheV2': 'token-b', locale: 'id-ID' });
    assert.ok(session.restoreConfig(slotFile, configPath));
    const after = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(after.lastKnownAccountUuid, 'uuid-a');
    assert.strictEqual(after['oauth:tokenCache'], 'token-a');
    assert.ok(!('oauth:tokenCacheV2' in after));
    assert.strictEqual(after.locale, 'id-ID');
    assert.deepStrictEqual(after.bootFrameLayout, { width: 288 });

    assert.strictEqual(session.restoreConfig(path.join(dir, 'missing.json'), configPath), false);
    assert.strictEqual(session.snapshotConfig(path.join(dir, 'missing.json'), slotFile), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('switching carries the account config keys and marks the active account by id', () => {
  const h = switcherHarness();
  try {
    writeDesktopConfig(h.profileDir, { lastKnownAccountUuid: 'uuid-a', 'oauth:tokenCache': 'token-a' });
    seedDesktop(h.profileDir, 'SESSION-A');
    writeCodeAccount(h.deps.accountPath, 'uuid-a', 'a@team.com', 'Person A');
    fs.writeFileSync(h.deps.credPath, JSON.stringify({ claudeAiOauth: { accessToken: 'code-A' } }));
    createSwitcher(h.deps).sync();

    writeDesktopConfig(h.profileDir, { lastKnownAccountUuid: 'uuid-b', 'oauth:tokenCache': 'token-b' });
    seedDesktop(h.profileDir, 'SESSION-B');
    writeCodeAccount(h.deps.accountPath, 'uuid-b', 'b@team.com', 'Person B');
    fs.writeFileSync(h.deps.credPath, JSON.stringify({ claudeAiOauth: { accessToken: 'code-B' } }));
    createSwitcher(h.deps).sync();

    const listed = createSwitcher(h.deps).listSessions();
    assert.strictEqual(listed.current!.email, 'b@team.com');
    assert.strictEqual(listed.accountUuid, 'uuid-b');
    assert.strictEqual(listed.unknownAccount, false);
    assert.ok(listed.sessions.find(s => s.email === 'b@team.com')!.active);
    assert.strictEqual(listed.sessions.find(s => s.email === 'a@team.com')!.accountUuid, 'uuid-a');

    createSwitcher(h.deps).switchTo('a-team.com');
    const config = JSON.parse(fs.readFileSync(path.join(h.profileDir, 'config.json'), 'utf8'));
    assert.strictEqual(config.lastKnownAccountUuid, 'uuid-a');
    assert.strictEqual(config['oauth:tokenCache'], 'token-a');
    assert.strictEqual(fs.readFileSync(path.join(h.profileDir, 'Network', 'Cookies'), 'utf8'), 'SESSION-A');
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('listSessions flags a signed in account that nothing can name yet', () => {
  const h = switcherHarness();
  try {
    writeDesktopConfig(h.profileDir, { lastKnownAccountUuid: 'uuid-new' });
    const listed = createSwitcher(h.deps).listSessions();
    assert.strictEqual(listed.current, null);
    assert.strictEqual(listed.accountUuid, 'uuid-new');
    assert.strictEqual(listed.unknownAccount, true);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});
