import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { windowsCandidates } from '../src/accounts/desktop-app';
import * as paths from '../src/accounts/paths';
import * as procs from '../src/accounts/processes';
import * as registry from '../src/accounts/registry';
import * as session from '../src/accounts/session-store';
import { createSwitcher } from '../src/accounts/switcher';
import * as usage from '../src/accounts/usage';
import { runCli } from '../src/cli/main';
import * as appPaths from '../src/core/paths';

process.env.CLAUDEDECK_HOME = '';

const env = { APPDATA: 'C:\\Users\\tester\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local', CLAUDEDECK_HOME: '' };

test('alias validation accepts safe names and rejects traversal', () => {
  assert.ok(paths.isValidAlias('work'));
  assert.ok(paths.isValidAlias('acct-2.beta_x'));
  assert.ok(!paths.isValidAlias(''));
  assert.ok(!paths.isValidAlias('../escape'));
  assert.ok(!paths.isValidAlias('has space'));
  assert.ok(!paths.isValidAlias('a'.repeat(33)));
  assert.throws(() => paths.assertValidAlias('../escape'), /Invalid alias/);
});

test('the packaged Claude Desktop profile is found when the roaming folder is absent', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-pkg-'));
  try {
    const packaged = { APPDATA: path.join(base, 'Roaming'), LOCALAPPDATA: path.join(base, 'Local') };
    assert.deepStrictEqual(paths.packagedProfileDirs('win32', packaged), []);
    assert.strictEqual(paths.desktopProfileDir('win32', packaged), path.join(packaged.APPDATA, 'Claude'));

    const profile = path.join(packaged.LOCALAPPDATA, 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude');
    fs.mkdirSync(profile, { recursive: true });
    assert.deepStrictEqual(paths.packagedProfileDirs('win32', packaged), [profile]);
    assert.strictEqual(paths.desktopProfileDir('win32', packaged), profile);

    fs.mkdirSync(path.join(packaged.APPDATA, 'Claude'), { recursive: true });
    assert.strictEqual(paths.desktopProfileDir('win32', packaged), path.join(packaged.APPDATA, 'Claude'));
    assert.deepStrictEqual(paths.packagedProfileDirs('darwin', packaged), []);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('registry normalize drops junk entries and duplicate aliases', () => {
  const data = registry.normalize({
    profiles: [{ alias: 'old' }],
    sessions: [{ alias: 'a', email: 'a@x.com' }, { alias: 'A', email: 'a2@x.com' }, { nope: 1 }, null],
  });
  assert.deepStrictEqual(data.sessions.map(entry => entry.alias), ['a']);
  assert.deepStrictEqual(Object.keys(data).sort(), ['sessions', 'version']);
  assert.strictEqual(registry.normalize(null).sessions.length, 0);
});

test('registry survives a round trip through disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-profiles-'));
  const file = path.join(dir, 'profiles.json');
  try {
    assert.strictEqual(registry.read(file).sessions.length, 0);
    registry.write(registry.saveSession(registry.emptyRegistry(), { alias: 'work', email: 'w@e.com' }), file);
    assert.strictEqual(registry.read(file).sessions[0].alias, 'work');
    fs.writeFileSync(file, 'not json', 'utf8');
    assert.throws(() => registry.read(file), /not valid JSON/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deriveAlias turns a free text name into a safe folder name', () => {
  assert.strictEqual(paths.deriveAlias('work@example.com'), 'work-example.com');
  assert.strictEqual(paths.deriveAlias('  Marvel Collin  '), 'marvel-collin');
  assert.strictEqual(paths.deriveAlias('***side***'), 'side');
  assert.ok(paths.isValidAlias(paths.deriveAlias('a'.repeat(80))));
  assert.throws(() => paths.deriveAlias('***'), /Cannot build a folder name/);
  assert.throws(() => paths.deriveAlias(''), /Cannot build a folder name/);
});

test('windows install candidates cover both installer layouts', () => {
  const candidates = windowsCandidates(env);
  assert.ok(candidates.some(entry => entry.includes('AnthropicClaude')));
  assert.ok(candidates.every(entry => entry.endsWith('Claude.exe')));
});

test('process lines parse into pid and command line', () => {
  const text = `100${procs.SEPARATOR}Claude.exe --user-data-dir=C:\\work\n\nbad line\n0${procs.SEPARATOR}x`;
  const parsed = procs.parseProcessLines(text);
  assert.strictEqual(parsed.length, 1);
  assert.deepStrictEqual(parsed[0], { pid: 100, commandLine: 'Claude.exe --user-data-dir=C:\\work' });
  assert.deepStrictEqual(procs.parsePosixProcessLines(' 42 /Applications/Claude.app/Contents/MacOS/Claude'), [
    { pid: 42, commandLine: '/Applications/Claude.app/Contents/MacOS/Claude' },
  ]);
});

test('killPids is a no-op for an empty list', () => {
  assert.strictEqual(procs.killPids([], 'win32'), 0);
});

test('legacy ClaudeCron data folder is moved to ClaudeDeck once', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-migrate-'));
  const previous = process.env.APPDATA;
  process.env.APPDATA = base;
  try {
    const legacy = path.join(base, 'ClaudeCron');
    fs.mkdirSync(path.join(legacy, 'profiles'), { recursive: true });
    fs.writeFileSync(path.join(legacy, 'claudecron.config.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(legacy, 'claude-run.log'), 'run', 'utf8');

    const moved = appPaths.migrateLegacyData('win32');
    assert.strictEqual(moved, path.join(base, 'ClaudeDeck'));
    assert.ok(!fs.existsSync(legacy));
    assert.ok(fs.existsSync(path.join(moved, 'claudedeck.config.json')));
    assert.ok(!fs.existsSync(path.join(moved, 'claudecron.config.json')));
    assert.strictEqual(fs.readFileSync(path.join(moved, 'claude-run.log'), 'utf8'), 'run');
    assert.ok(fs.existsSync(path.join(moved, 'profiles')));

    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, 'stale.txt'), 'stale', 'utf8');
    appPaths.migrateLegacyData('win32');
    assert.ok(fs.existsSync(path.join(legacy, 'stale.txt')));
  } finally {
    if (previous === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previous;
    fs.rmSync(base, { recursive: true, force: true });
  }
});

import * as identity from '../src/accounts/identity';

function v8String(text) {
  const body = Buffer.from(text, 'utf8');
  return Buffer.concat([Buffer.from([0x22, body.length]), body]);
}

function accountBlob(email, fullName, displayName) {
  const parts = [Buffer.from('uuid'), v8String('69580f84-d469-4b70-9f9e-42e80527ee02'), Buffer.from('email_address'), v8String(email)];
  if (fullName) parts.push(Buffer.from('full_name'), v8String(fullName));
  if (displayName) parts.push(Buffer.from('display_name'), v8String(displayName));
  return Buffer.concat(parts);
}

test('readVarint decodes single and multi byte lengths', () => {
  assert.deepStrictEqual(identity.readVarint(Buffer.from([0x05]), 0), { value: 5, next: 1 });
  assert.deepStrictEqual(identity.readVarint(Buffer.from([0xac, 0x02]), 0), { value: 300, next: 2 });
  assert.strictEqual(identity.readVarint(Buffer.from([0x80]), 0), null);
});

test('readV8String reads one byte and two byte strings', () => {
  assert.strictEqual(identity.readV8String(v8String('kolin'), 0)!.text, 'kolin');
  const wide = Buffer.from('hi', 'utf16le');
  const twoByte = Buffer.concat([Buffer.from([0x63, wide.length]), wide]);
  assert.strictEqual(identity.readV8String(twoByte, 0)!.text, 'hi');
  assert.strictEqual(identity.readV8String(Buffer.from([0x99, 0x01, 0x41]), 0), null);
});

test('parseAccount pulls the email and prefers the display name', () => {
  assert.deepStrictEqual(identity.parseAccount(accountBlob('a@b.com', 'Full Name', 'Display')), {
    email: 'a@b.com',
    name: 'Display',
  });
  assert.deepStrictEqual(identity.parseAccount(accountBlob('a@b.com', 'Full Name', null)), {
    email: 'a@b.com',
    name: 'Full Name',
  });
  assert.deepStrictEqual(identity.parseAccount(accountBlob('a@b.com', null, null)), { email: 'a@b.com', name: 'a' });
});

test('parseAccount rejects blobs without a usable email', () => {
  assert.strictEqual(identity.parseAccount(Buffer.from('nothing here')), null);
  assert.strictEqual(identity.parseAccount(Buffer.concat([Buffer.from('email_address'), v8String('not-an-email')])), null);
});

test('readIdentity finds the account inside a claude.ai IndexedDB folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-identity-'));
  try {
    const noCode = { codeAccountPath: path.join(dir, 'absent.json') };
    assert.strictEqual(identity.readIdentity(dir, noCode), null);
    const db = path.join(dir, 'IndexedDB', 'https_claude.ai_0.indexeddb.blob', '4', '00');
    fs.mkdirSync(db, { recursive: true });
    fs.writeFileSync(path.join(db, '13'), accountBlob('work@example.com', 'Work Person', 'Work Person'));
    assert.deepStrictEqual(identity.readIdentity(dir, noCode), {
      email: 'work@example.com',
      name: 'Work Person',
      accountUuid: null,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readIdentity ignores IndexedDB folders for other origins', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-identity-other-'));
  try {
    const db = path.join(dir, 'IndexedDB', 'https_example.com_0.indexeddb.blob');
    fs.mkdirSync(db, { recursive: true });
    fs.writeFileSync(path.join(db, '1'), accountBlob('someone@example.com', 'Someone', null));
    assert.strictEqual(identity.readIdentity(dir, { codeAccountPath: path.join(dir, 'absent.json') }), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function seedDesktop(dir, cookie) {
  fs.mkdirSync(path.join(dir, 'Network'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Network', 'Cookies'), cookie);
  fs.writeFileSync(path.join(dir, 'Local State'), 'state-' + cookie);
  fs.mkdirSync(path.join(dir, 'Local Storage'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Local Storage', 'leveldb.log'), 'ls-' + cookie);
}

function accountBlobFile(dir, email, name) {
  const db = path.join(dir, 'IndexedDB', 'https_claude.ai_0.indexeddb.blob');
  fs.mkdirSync(db, { recursive: true });
  fs.writeFileSync(path.join(db, '1'), accountBlob(email, name, name));
}

test('snapshot and restore round trips the desktop session bundle', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-sess-'));
  try {
    const live = path.join(base, 'Claude');
    const slot = path.join(base, 'slot');
    seedDesktop(live, 'AAA');
    session.snapshotDesktop(live, slot);
    seedDesktop(live, 'BBB');
    assert.strictEqual(fs.readFileSync(path.join(live, 'Network', 'Cookies'), 'utf8'), 'BBB');
    session.restoreDesktop(slot, live);
    assert.strictEqual(fs.readFileSync(path.join(live, 'Network', 'Cookies'), 'utf8'), 'AAA');
    assert.strictEqual(fs.readFileSync(path.join(live, 'Local State'), 'utf8'), 'state-AAA');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('code credential snapshot keeps only the claudeAiOauth block and backs up on restore', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-code-'));
  try {
    const cred = path.join(base, '.credentials.json');
    const slot = path.join(base, 'code.json');
    fs.writeFileSync(cred, JSON.stringify({ claudeAiOauth: { accessToken: 'tok-A' }, mcpOAuth: { keep: 1 } }));
    assert.ok(session.snapshotCode(cred, slot));
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(slot, 'utf8')), { accessToken: 'tok-A' });

    fs.writeFileSync(cred, JSON.stringify({ claudeAiOauth: { accessToken: 'tok-B' }, mcpOAuth: { keep: 1 } }));
    assert.ok(session.restoreCode(slot, cred));
    const after = JSON.parse(fs.readFileSync(cred, 'utf8'));
    assert.strictEqual(after.claudeAiOauth.accessToken, 'tok-A');
    assert.deepStrictEqual(after.mcpOAuth, { keep: 1 });
    assert.ok(fs.existsSync(cred + '.claudedeck.bak'));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('registry stores and finds saved sessions by alias and email', () => {
  let data = registry.saveSession(registry.emptyRegistry(), { alias: 'work', email: 'w@e.com', name: 'W' }, new Date('2026-04-04T00:00:00Z'));
  assert.strictEqual(data.sessions.length, 1);
  assert.strictEqual(data.sessions[0].savedAt, '2026-04-04T00:00:00.000Z');
  assert.strictEqual(registry.findSession(data, 'WORK')!.email, 'w@e.com');
  assert.strictEqual(registry.sessionByEmail(data, 'W@E.COM')!.alias, 'work');
  data = registry.saveSession(data, { alias: 'work', email: 'w@e.com', name: 'W2' });
  assert.strictEqual(data.sessions.length, 1);
  assert.strictEqual(data.sessions[0].name, 'W2');
  data = registry.removeSession(data, 'work');
  assert.strictEqual(data.sessions.length, 0);
  assert.throws(() => registry.saveSession(data, { alias: 'x' }), /needs an alias and an email/);
});

function switcherHarness() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-switch-'));
  const profileDir = path.join(base, 'Claude');
  const credPath = path.join(base, '.credentials.json');
  const events: string[] = [];
  const deps = {
    profileDir,
    credPath,
    accountPath: path.join(base, 'no-claude-account.json'),
    slotOf: alias => path.join(base, 'sessions', alias),
    registryFile: path.join(base, 'profiles.json'),
    installs: [],
    listProcesses: () => events.includes('killed') ? [] : [{ pid: 10, commandLine: 'Claude.exe' }],
    kill: pids => { if (pids.length) events.push('killed'); return pids.length; },
    launch: () => { events.push('launched'); return 999; },
    locate: () => 'C:/Claude.exe',
    pause: () => undefined,
    now: () => new Date('2026-05-05T00:00:00Z'),
  };
  return { base, profileDir, credPath, deps, events };
}

test('sync saves the live account and switchTo restores another', () => {
  const h = switcherHarness();
  try {
    seedDesktop(h.profileDir, 'SESSION-A');
    accountBlobFile(h.profileDir, 'a@team.com', 'Person A');
    fs.writeFileSync(h.credPath, JSON.stringify({ claudeAiOauth: { accessToken: 'code-A' } }));

    const first = createSwitcher(h.deps).sync();
    assert.strictEqual(first.alias, 'a-team.com');
    assert.strictEqual(first.email, 'a@team.com');

    seedDesktop(h.profileDir, 'SESSION-B');
    accountBlobFile(h.profileDir, 'b@team.com', 'Person B');
    fs.writeFileSync(h.credPath, JSON.stringify({ claudeAiOauth: { accessToken: 'code-B' } }));
    createSwitcher(h.deps).sync();

    const listed = createSwitcher(h.deps).listSessions();
    assert.strictEqual(listed.sessions.length, 2);
    assert.ok(listed.sessions.find(s => s.email === 'b@team.com')!.active);

    const result = createSwitcher(h.deps).switchTo('a-team.com');
    assert.strictEqual(result.email, 'a@team.com');
    assert.ok(h.events.includes('killed'));
    assert.ok(h.events.includes('launched'));
    assert.strictEqual(fs.readFileSync(path.join(h.profileDir, 'Network', 'Cookies'), 'utf8'), 'SESSION-A');
    assert.strictEqual(JSON.parse(fs.readFileSync(h.credPath, 'utf8')).claudeAiOauth.accessToken, 'code-A');
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('switchTo refuses an unknown account and sync refuses when signed out', () => {
  const h = switcherHarness();
  try {
    fs.mkdirSync(h.profileDir, { recursive: true });
    assert.throws(() => createSwitcher(h.deps).sync(), /Sign in to Claude Desktop or Claude Code first/);
    assert.throws(() => createSwitcher(h.deps).switchTo('ghost'), /No saved session/);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('autoSyncCode mirrors the code login without touching desktop files', () => {
  const h = switcherHarness();
  try {
    seedDesktop(h.profileDir, 'SESSION-A');
    accountBlobFile(h.profileDir, 'a@team.com', 'Person A');
    fs.writeFileSync(h.credPath, JSON.stringify({ claudeAiOauth: { accessToken: 'code-A1' } }));
    createSwitcher(h.deps).sync();

    assert.deepStrictEqual(createSwitcher(h.deps).autoSyncCode(), { alias: 'a-team.com', updated: false });

    fs.writeFileSync(h.credPath, JSON.stringify({ claudeAiOauth: { accessToken: 'code-A2' } }));
    const result = createSwitcher(h.deps).autoSyncCode();
    assert.deepStrictEqual(result, { alias: 'a-team.com', updated: true });
    const slotCode = path.join(h.base, 'sessions', 'a-team.com', 'code.json');
    assert.strictEqual(JSON.parse(fs.readFileSync(slotCode, 'utf8')).accessToken, 'code-A2');

    const again = createSwitcher(h.deps).autoSyncCode();
    assert.deepStrictEqual(again, { alias: 'a-team.com', updated: false });
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('autoSyncCode does nothing for an account that was never saved', () => {
  const h = switcherHarness();
  try {
    seedDesktop(h.profileDir, 'X');
    accountBlobFile(h.profileDir, 'new@team.com', 'New');
    fs.writeFileSync(h.credPath, JSON.stringify({ claudeAiOauth: { accessToken: 'code' } }));
    assert.strictEqual(createSwitcher(h.deps).autoSyncCode(), null);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('listSessions reports whether each account has a captured desktop session', () => {
  const h = switcherHarness();
  try {
    seedDesktop(h.profileDir, 'S');
    accountBlobFile(h.profileDir, 'a@team.com', 'Person A');
    fs.writeFileSync(h.credPath, JSON.stringify({ claudeAiOauth: { accessToken: 'c' } }));
    createSwitcher(h.deps).sync();
    const listed = createSwitcher(h.deps).listSessions();
    assert.strictEqual(listed.sessions[0].desktopCaptured, true);

    const slot = path.join(h.base, 'sessions', 'a-team.com', 'desktop');
    fs.rmSync(slot, { recursive: true, force: true });
    fs.mkdirSync(slot, { recursive: true });
    assert.strictEqual(createSwitcher(h.deps).listSessions().sessions[0].desktopCaptured, false);

    fs.rmSync(slot, { recursive: true, force: true });
    assert.strictEqual(createSwitcher(h.deps).listSessions().sessions[0].desktopCaptured, false);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('usage history yields percent left per organisation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-usage-'));
  try {
    assert.deepStrictEqual(usage.readSamples(dir), []);
    assert.strictEqual(usage.activeOrgUuid([]), null);
    assert.strictEqual(usage.usageFor([], 'org-a'), null);

    fs.writeFileSync(path.join(dir, usage.USAGE_FILE), JSON.stringify({
      version: 2,
      samples: [
        { t: 3000, org: 'org-b', u: { fh: 90, sd: 10 } },
        { t: 1000, org: 'org-a', u: { fh: 20, sd: 30 } },
        { t: 2000, org: 'org-a', u: { fh: 40, sd: 35 } },
        { nope: true },
        null,
      ],
    }));

    const samples = usage.readSamples(dir);
    assert.strictEqual(samples.length, 3, 'junk entries are dropped');
    assert.deepStrictEqual(samples.map(s => s.t), [1000, 2000, 3000], 'samples are sorted by time');
    assert.strictEqual(usage.activeOrgUuid(samples), 'org-b', 'newest sample decides the active org');

    const a = usage.usageFor(samples, 'org-a');
    assert.strictEqual(a?.session?.usedPercent, 40, 'newest sample for that org wins');
    assert.strictEqual(a?.session?.leftPercent, 60);
    assert.strictEqual(a?.weekly?.leftPercent, 65);

    const b = usage.usageFor(samples, 'org-b');
    assert.strictEqual(b?.session?.leftPercent, 10);
    assert.strictEqual(b?.weekly?.leftPercent, 90);

    assert.strictEqual(usage.usageFor(samples, 'org-missing'), null);
    assert.strictEqual(usage.usageFor(samples, null), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('usage percentages are clamped and partial samples still report', () => {
  const samples = [
    { t: 1, org: 'o', u: { fh: 140, sd: -20 } },
    { t: 2, org: 'p', u: { fh: 5 } },
    { t: 3, org: 'q', u: {} },
  ];
  const clamped = usage.usageFor(samples, 'o');
  assert.strictEqual(clamped?.session?.usedPercent, 100);
  assert.strictEqual(clamped?.weekly?.usedPercent, 0);

  const partial = usage.usageFor(samples, 'p');
  assert.strictEqual(partial?.session?.leftPercent, 95);
  assert.strictEqual(partial?.weekly, null);

  assert.strictEqual(usage.usageFor(samples, 'q'), null, 'a sample with no numbers is not usage');
});

function instanceHarness() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-inst-'));
  const launched: string[][] = [];
  const killed: number[] = [];
  const remembered: string[][] = [];
  const routed: number[] = [];
  let procs: { pid: number; commandLine: string }[] = [];
  const deps = {
    slotOf: (alias: string) => path.join(base, 'sessions', alias),
    dirOf: (alias: string) => path.join(base, 'profiles', alias),
    listProcesses: () => procs,
    kill: (pids: number[]) => { killed.push(...pids); return pids.length; },
    launch: (exe: string, args: string[]) => { launched.push([exe, ...args]); return 4242; },
    locate: () => 'C:/Claude.exe',
    pause: () => undefined,
    defaultDir: path.join(base, 'default'),
    remember: (alias: string, dir: string) => { remembered.push([alias, dir]); },
    routeLogins: () => { routed.push(1); return true; },
  };
  return {
    base,
    deps,
    launched,
    killed,
    remembered,
    routed,
    setProcs: (value: typeof procs) => { procs = value; },
  };
}

function slotWithLogin(base: string, alias: string, token: string) {
  const slot = path.join(base, 'sessions', alias);
  const desktop = path.join(slot, 'desktop');
  fs.mkdirSync(path.join(desktop, 'Network'), { recursive: true });
  fs.writeFileSync(path.join(desktop, 'Network', 'Cookies'), 'SESSION-' + alias);
  fs.writeFileSync(
    path.join(slot, 'config.json'),
    JSON.stringify({ lastKnownAccountUuid: 'uuid-' + alias, 'oauth:tokenCache': token })
  );
  return slot;
}

const savedFor = (alias: string) => ({
  alias,
  email: alias + '@team.com',
  name: alias,
  accountUuid: null,
  orgUuid: null,
  installs: ['code'],
  savedAt: null,
});

function seedTwoAccounts(h) {
  seedDesktop(h.profileDir, 'SESSION-A');
  accountBlobFile(h.profileDir, 'a@team.com', 'Person A');
  fs.writeFileSync(h.credPath, JSON.stringify({ claudeAiOauth: { accessToken: 'code-A' } }));
  createSwitcher(h.deps).sync();

  seedDesktop(h.profileDir, 'SESSION-B');
  accountBlobFile(h.profileDir, 'b@team.com', 'Person B');
  fs.writeFileSync(h.credPath, JSON.stringify({ claudeAiOauth: { accessToken: 'code-B' } }));
  createSwitcher(h.deps).sync();
}

test('the engine only answers the mod and the auto switch task', async () => {
  await assert.rejects(runCli([]), /runs from its Claude mod/);
  await assert.rejects(runCli(['list']), /runs from its Claude mod/);
  await assert.rejects(runCli(['web', 'list']), /runs from its Claude mod/);
  await assert.rejects(runCli(['desktop', 'open']), /runs from its Claude mod/);
});

test('the engine entry the mod runs is a node script', () => {
  const file = path.join(__dirname, '..', 'bin', 'claudedeck.js');
  assert.ok(fs.existsSync(file), 'bin/claudedeck.js is missing');
  assert.ok(fs.readFileSync(file, 'utf8').startsWith('#!/usr/bin/env node'), 'bin/claudedeck.js has no shebang');
});

test('CLAUDEDECK_HOME moves every ClaudeDeck file out of the roaming folder', () => {
  const home = path.join(os.tmpdir(), 'cd-home', '.claudedeck');
  const moved = { ...env, CLAUDEDECK_HOME: home };
  assert.strictEqual(paths.registryPath('win32', moved), path.join(home, 'profiles.json'));
  assert.strictEqual(paths.sessionSlot('work', 'win32', moved), path.join(home, 'sessions', 'work'));
  assert.strictEqual(paths.liveUsagePath('win32', moved), path.join(home, 'usage-live.json'));
  assert.strictEqual(appPaths.userDataDir('win32', moved), path.resolve(home));
  assert.strictEqual(paths.registryPath('win32', env), path.join(env.APPDATA, 'ClaudeDeck', 'profiles.json'));
});

test('the .claudedeck folder in the user profile is used when no home is set', () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-profile-'));
  try {
    const plain = { ...env, CLAUDEDECK_HOME: undefined, USERPROFILE: profile };
    assert.strictEqual(paths.registryPath('win32', plain), path.join(env.APPDATA, 'ClaudeDeck', 'profiles.json'));
    fs.mkdirSync(path.join(profile, '.claudedeck'));
    assert.strictEqual(paths.registryPath('win32', plain), path.join(profile, '.claudedeck', 'profiles.json'));
    assert.strictEqual(appPaths.userDataDir('win32', plain), path.join(profile, '.claudedeck'));
    assert.strictEqual(paths.registryPath('win32', { ...plain, CLAUDEDECK_HOME: '' }), path.join(env.APPDATA, 'ClaudeDeck', 'profiles.json'));
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
