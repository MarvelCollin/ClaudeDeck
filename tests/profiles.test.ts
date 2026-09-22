import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { launchArgs, windowsCandidates } from '../src/accounts/desktop-app';
import * as paths from '../src/accounts/paths';
import * as procs from '../src/accounts/processes';
import * as registry from '../src/accounts/registry';
import * as shared from '../src/accounts/shared-store';
import * as usage from '../src/accounts/usage';
import { createInstances } from '../src/accounts/instances';
import { routeCommand } from '../src/cli/router';
import { allowedHost, buildRoutes, startServer } from '../src/web/server';
import * as appPaths from '../src/core/paths';
import { IPanelService } from '../src/web/interfaces';

const env = { APPDATA: 'C:\\Users\\tester\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local' };

test('alias validation accepts safe names and rejects traversal', () => {
  assert.ok(paths.isValidAlias('work'));
  assert.ok(paths.isValidAlias('acct-2.beta_x'));
  assert.ok(!paths.isValidAlias(''));
  assert.ok(!paths.isValidAlias('../escape'));
  assert.ok(!paths.isValidAlias('has space'));
  assert.ok(!paths.isValidAlias('a'.repeat(33)));
  assert.throws(() => paths.assertValidAlias('../escape'), /Invalid alias/);
});

test('default alias maps to the real Claude Desktop profile', () => {
  assert.ok(paths.isDefaultAlias('default'));
  assert.ok(paths.isDefaultAlias('DEFAULT'));
  assert.strictEqual(paths.profilePath('default', 'win32', env), path.join(env.APPDATA, 'Claude'));
  assert.strictEqual(paths.profilePath('work', 'win32', env), path.join(env.APPDATA, 'ClaudeDeck', 'profiles', 'work'));
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

test('registry add rejects duplicates and the reserved default alias', () => {
  let data = registry.emptyRegistry();
  data = registry.add(data, 'work', 'Work Account', new Date('2026-01-01T00:00:00Z'));
  assert.strictEqual(data.profiles.length, 1);
  assert.strictEqual(data.profiles[0].createdAt, '2026-01-01T00:00:00.000Z');
  assert.strictEqual(data.profiles[0].label, 'Work Account');
  assert.throws(() => registry.add(data, 'work'), /already exists/);
  assert.throws(() => registry.add(data, 'WORK'), /already exists/);
  assert.throws(() => registry.add(data, 'default'), /reserved/);
});

test('registry remove and touch operate case insensitively', () => {
  let data = registry.add(registry.emptyRegistry(), 'work');
  data = registry.touch(data, 'WORK', new Date('2026-02-02T00:00:00Z'));
  assert.strictEqual(data.profiles[0].lastLaunchedAt, '2026-02-02T00:00:00.000Z');
  data = registry.remove(data, 'WORK');
  assert.strictEqual(data.profiles.length, 0);
  assert.throws(() => registry.remove(data, 'ghost'), /not found/);
  assert.throws(() => registry.remove(registry.emptyRegistry(), 'default'), /Cannot remove the default/);
});

test('registry normalize drops junk entries and duplicate aliases', () => {
  const data = registry.normalize({ profiles: [{ alias: 'a' }, { alias: 'A' }, { nope: 1 }, null] });
  assert.strictEqual(data.profiles.length, 1);
  assert.strictEqual(registry.normalize(null).profiles.length, 0);
});

test('registry survives a round trip through disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-profiles-'));
  const file = path.join(dir, 'profiles.json');
  try {
    assert.strictEqual(registry.read(file).profiles.length, 0);
    registry.write(registry.add(registry.emptyRegistry(), 'work'), file);
    assert.strictEqual(registry.read(file).profiles[0].alias, 'work');
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

test('setLabel renames only the display name', () => {
  let data = registry.add(registry.emptyRegistry(), 'work', 'Work');
  data = registry.setLabel(data, 'WORK', '  Personal  ');
  assert.strictEqual(data.profiles[0].label, 'Personal');
  assert.strictEqual(data.profiles[0].alias, 'work');
  assert.throws(() => registry.setLabel(data, 'work', '   '), /cannot be empty/);
  assert.throws(() => registry.setLabel(data, 'ghost', 'x'), /not found/);
});

test('normalize falls back to the alias when no label is stored', () => {
  const data = registry.normalize({ profiles: [{ alias: 'work' }] });
  assert.strictEqual(data.profiles[0].label, 'work');
});

test('launchArgs omits the flag for the default profile', () => {
  assert.deepStrictEqual(launchArgs('C:\\dir', true), []);
  assert.deepStrictEqual(launchArgs('C:\\dir', false), ['--user-data-dir=C:\\dir']);
});

test('windows install candidates cover both installer layouts', () => {
  const candidates = windowsCandidates(env);
  assert.ok(candidates.some(entry => entry.includes('AnthropicClaude')));
  assert.ok(candidates.every(entry => entry.endsWith('Claude.exe')));
});

test('userDataDirOf reads quoted and bare flags', () => {
  assert.strictEqual(procs.userDataDirOf('Claude.exe --user-data-dir="C:\\a b\\Claude" --x'), 'C:\\a b\\Claude');
  assert.strictEqual(procs.userDataDirOf('Claude.exe --user-data-dir=C:\\work'), 'C:\\work');
  assert.strictEqual(procs.userDataDirOf('Claude.exe'), null);
});

test('samePath ignores case and trailing separators', () => {
  assert.ok(procs.samePath('C:\\Claude\\', 'c:\\claude'));
  assert.ok(!procs.samePath('C:\\Claude', 'C:\\Claude2'));
  assert.ok(!procs.samePath(null, 'C:\\Claude'));
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

test('processes map back to the profile that owns them', () => {
  const profiles = [
    { alias: 'default', dir: 'C:\\Roaming\\Claude' },
    { alias: 'work', dir: 'C:\\Roaming\\ClaudeDeck\\profiles\\work' },
  ];
  const defaultDir = 'C:\\Roaming\\Claude';
  assert.strictEqual(procs.aliasForCommandLine('Claude.exe', profiles, defaultDir), 'default');
  assert.strictEqual(procs.aliasForCommandLine('Claude.exe --user-data-dir="C:\\Roaming\\Claude"', profiles, defaultDir), 'default');
  assert.strictEqual(
    procs.aliasForCommandLine('Claude.exe --user-data-dir="C:\\Roaming\\ClaudeDeck\\profiles\\work"', profiles, defaultDir),
    'work'
  );
  assert.strictEqual(procs.aliasForCommandLine('Claude.exe --user-data-dir="C:\\elsewhere"', profiles, defaultDir), null);

  const groups = procs.groupProcesses(
    [
      { pid: 1, commandLine: 'Claude.exe' },
      { pid: 2, commandLine: 'Claude.exe --user-data-dir="C:\\Roaming\\ClaudeDeck\\profiles\\work"' },
      { pid: 3, commandLine: 'Claude.exe --user-data-dir="C:\\Roaming\\ClaudeDeck\\profiles\\work"' },
      { pid: 4, commandLine: 'Claude.exe --user-data-dir="C:\\unknown"' },
    ],
    profiles,
    defaultDir
  );
  assert.deepStrictEqual(groups.get('default'), [1]);
  assert.deepStrictEqual(groups.get('work'), [2, 3]);
  assert.strictEqual(groups.has('unknown'), false);
});

test('killPids is a no-op for an empty list', () => {
  assert.strictEqual(procs.killPids([], 'win32'), 0);
});

test('allowedHost only trusts loopback', () => {
  assert.ok(allowedHost('127.0.0.1:5000'));
  assert.ok(allowedHost('localhost:5000'));
  assert.ok(!allowedHost('evil.example.com:5000'));
  assert.ok(!allowedHost(undefined));
});

test('server rejects requests without the session token', async () => {
  const session = await startServer({ token: 'secret', idleTimeout: 60000 }).listen();
  try {
    const base = `http://127.0.0.1:${session.port}`;
    const denied = await fetch(`${base}/api/ping`, { method: 'POST' });
    assert.strictEqual(denied.status, 403);

    const page = await fetch(`${base}/`);
    assert.strictEqual(page.status, 403);

    const allowed = await fetch(`${base}/api/ping`, { method: 'POST', headers: { 'x-claudedeck-token': 'secret' } });
    assert.strictEqual(allowed.status, 200);
    assert.deepStrictEqual(await allowed.json(), { ok: true });

    const missing = await fetch(`${base}/api/nope`, { headers: { 'x-claudedeck-token': 'secret' } });
    assert.strictEqual(missing.status, 404);

    const html = await fetch(`${base}/?token=secret`);
    assert.strictEqual(html.status, 200);
    assert.ok((await html.text()).includes('Claude accounts'));
  } finally {
    session.close();
  }
});

test('server shuts itself down when the page stops pinging', async () => {
  const session = await startServer({ token: 'secret', idleTimeout: 1, startupTimeout: 60000 }).listen();
  const page = await fetch(session.url);
  assert.strictEqual(page.status, 200);
  await new Promise(resolve => session.server.once('close', resolve));
  assert.ok(true);
});

test('server waits for a slow browser instead of closing on the idle timeout', async () => {
  const panel = startServer({ token: 'secret', idleTimeout: 1, startupTimeout: 60000 });
  const session = await panel.listen();
  try {
    assert.strictEqual(panel.connected(), false);
    await new Promise(resolve => setTimeout(resolve, 2600));
    assert.strictEqual(session.server.listening, true);
    assert.strictEqual(panel.connected(), false);

    const page = await fetch(session.url);
    assert.strictEqual(page.status, 200);
    assert.strictEqual(panel.connected(), true);
  } finally {
    session.close();
  }
});

test('an open event stream keeps the server alive past the idle timeout', async () => {
  const panel = startServer({ token: 'secret', idleTimeout: 1, startupTimeout: 60000 });
  const session = await panel.listen();
  const stopped = new Promise(resolve => session.server.once('close', resolve));
  try {
    assert.strictEqual((await fetch(session.url)).status, 200);

    const abort = new AbortController();
    const stream = await fetch(`http://127.0.0.1:${session.port}/api/events?token=secret`, { signal: abort.signal });
    assert.strictEqual(stream.status, 200);
    assert.strictEqual(stream.headers.get('content-type'), 'text/event-stream');

    await new Promise(resolve => setTimeout(resolve, 2600));
    assert.strictEqual(session.server.listening, true, 'server must stay up while the tab holds the stream');

    abort.abort();
    await stopped;
    assert.strictEqual(session.server.listening, false);
  } finally {
    session.close();
  }
});

test('server gives up when no browser ever opens the panel', async () => {
  const panel = startServer({ token: 'secret', startupTimeout: 1 });
  const session = await panel.listen();
  await new Promise(resolve => session.server.once('close', resolve));
  assert.strictEqual(panel.connected(), false);
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

test('registry caches an identity per alias and drops it on remove', () => {
  let data = registry.add(registry.emptyRegistry(), 'work', 'Work');
  data = registry.rememberIdentity(data, 'WORK', { email: 'w@e.com', name: 'Worker' }, new Date('2026-03-03T00:00:00Z'));
  assert.deepStrictEqual(registry.identityFor(data, 'work'), {
    email: 'w@e.com',
    name: 'Worker',
    seenAt: '2026-03-03T00:00:00.000Z',
  });
  assert.strictEqual(registry.identityFor(data, 'missing'), null);
  assert.strictEqual(registry.rememberIdentity(data, 'work', { name: 'no email' }), data);

  data = registry.rememberIdentity(data, 'default', { email: 'me@e.com', name: 'Me' });
  assert.strictEqual(registry.identityFor(data, 'default')!.name, 'Me');

  data = registry.remove(data, 'work');
  assert.strictEqual(registry.identityFor(data, 'work'), null);
  assert.strictEqual(registry.identityFor(data, 'default')!.name, 'Me');
});

test('registry identities survive normalize and a disk round trip', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-reg-id-'));
  const file = path.join(dir, 'profiles.json');
  try {
    let data = registry.rememberIdentity(registry.emptyRegistry(), 'default', { email: 'me@e.com', name: 'Me' });
    registry.write(data, file);
    assert.strictEqual(registry.read(file).identities.default.email, 'me@e.com');
    const junk = registry.normalize({ profiles: [], identities: { a: { name: 'no email' }, b: null } });
    assert.deepStrictEqual(junk.identities, {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

import * as session from '../src/accounts/session-store';
import { createSwitcher } from '../src/accounts/switcher';

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
    sharedDir: path.join(base, 'shared'),
    slotOf: alias => path.join(base, 'sessions', alias),
    registryFile: path.join(base, 'profiles.json'),
    installs: [],
    listProcesses: () => events.includes('killed') ? [] : [{ pid: 10, commandLine: 'Claude.exe' }],
    kill: pids => { if (pids.length) events.push('killed'); return pids.length; },
    launch: () => { events.push('launched'); return 999; },
    locate: () => 'C:/Claude.exe',
    loginRouting: () => true,
    instances: { remember: () => undefined, routeLogins: () => true },
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

test('opening an account seeds its own profile from the saved session', () => {
  const h = instanceHarness();
  try {
    const instances = createInstances(h.deps);
    const sessions = [savedFor('work')];

    const slot = path.join(h.base, 'sessions', 'work', 'desktop');
    fs.mkdirSync(path.join(slot, 'Network'), { recursive: true });
    fs.writeFileSync(path.join(slot, 'Network', 'Cookies'), 'SESSION-WORK');
    fs.writeFileSync(path.join(slot, 'Local State'), 'state-work');

    assert.deepStrictEqual(instances.describe(sessions)[0].seeded, false);

    const opened = instances.open('work', sessions);
    assert.strictEqual(opened.alreadyRunning, false);
    assert.strictEqual(opened.pid, 4242);
    assert.ok(opened.seededFrom, 'a saved session seeds the new profile');

    const dir = path.join(h.base, 'profiles', 'work');
    assert.strictEqual(fs.readFileSync(path.join(dir, 'Network', 'Cookies'), 'utf8'), 'SESSION-WORK');
    assert.deepStrictEqual(h.launched, [['C:/Claude.exe', '--user-data-dir=' + dir]]);
    assert.strictEqual(instances.describe(sessions)[0].seeded, true);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('opening an account carries its saved login into the new profile', () => {
  const h = instanceHarness();
  try {
    const instances = createInstances(h.deps);
    const sessions = [savedFor('work')];
    slotWithLogin(h.base, 'work', 'token-work');

    const opened = instances.open('work', sessions);
    const dir = path.join(h.base, 'profiles', 'work');
    const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));

    assert.strictEqual(config['oauth:tokenCache'], 'token-work');
    assert.strictEqual(config.lastKnownAccountUuid, 'uuid-work');
    assert.strictEqual(opened.signedIn, true, 'the window opens already signed in');
    assert.strictEqual(opened.loginRouted, false, 'no sign in link routing is needed');
    assert.deepStrictEqual(h.remembered, [['work', dir]]);
    assert.strictEqual(instances.describe(sessions)[0].signedIn, true);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('a profile left signed out by a failed login is repaired on the next open', () => {
  const h = instanceHarness();
  try {
    const instances = createInstances(h.deps);
    const sessions = [savedFor('work')];
    slotWithLogin(h.base, 'work', 'token-work');

    const dir = path.join(h.base, 'profiles', 'work');
    fs.mkdirSync(path.join(dir, 'Network'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Network', 'Cookies'), 'HALF-LOGGED-IN');
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ locale: 'en-US', windowSizeWasSignedIn: false }));

    assert.strictEqual(instances.describe(sessions)[0].signedIn, false);

    const opened = instances.open('work', sessions);
    const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));

    assert.strictEqual(config['oauth:tokenCache'], 'token-work');
    assert.strictEqual(config.locale, 'en-US', 'the profile keeps its own settings');
    assert.strictEqual(fs.readFileSync(path.join(dir, 'Network', 'Cookies'), 'utf8'), 'HALF-LOGGED-IN');
    assert.strictEqual(opened.signedIn, true);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('a window with no saved login asks for sign in link routing', () => {
  const h = instanceHarness();
  try {
    const instances = createInstances(h.deps);
    const sessions = [savedFor('work')];

    const opened = instances.open('work', sessions);
    assert.strictEqual(opened.signedIn, false);
    assert.strictEqual(opened.loginRouted, true);
    assert.strictEqual(h.routed.length, 1);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('a fresh open wipes the profile and skips the saved session', () => {
  const h = instanceHarness();
  try {
    const instances = createInstances(h.deps);
    const sessions = [savedFor('work')];
    slotWithLogin(h.base, 'work', 'token-work');

    const dir = path.join(h.base, 'profiles', 'work');
    instances.open('work', sessions);
    assert.ok(fs.existsSync(path.join(dir, 'config.json')));
    h.setProcs([{ pid: 55, commandLine: 'Claude.exe --user-data-dir="' + dir + '"' }]);

    const opened = instances.open('work', sessions, { fresh: true });
    assert.strictEqual(opened.wiped, true);
    assert.strictEqual(opened.alreadyRunning, false, 'the open window is closed first');
    assert.deepStrictEqual(h.killed, [55]);
    assert.strictEqual(opened.seededFrom, null, 'an expired saved login is not put back');
    assert.strictEqual(opened.signedIn, false);
    assert.strictEqual(opened.loginRouted, true);
    assert.deepStrictEqual(fs.readdirSync(dir), [], 'the profile starts empty');
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('an account already open is not launched twice', () => {
  const h = instanceHarness();
  try {
    const instances = createInstances(h.deps);
    const sessions = [savedFor('work')];
    const dir = path.join(h.base, 'profiles', 'work');
    h.setProcs([{ pid: 77, commandLine: 'Claude.exe --user-data-dir="' + dir + '"' }]);

    const described = instances.describe(sessions)[0];
    assert.strictEqual(described.running, true);
    assert.deepStrictEqual(described.pids, [77]);

    const opened = instances.open('work', sessions);
    assert.strictEqual(opened.alreadyRunning, true);
    assert.deepStrictEqual(h.launched, [], 'no second launch');

    assert.deepStrictEqual(instances.stop('work', sessions), { alias: 'work', stopped: 1 });
    assert.deepStrictEqual(h.killed, [77]);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('each open account reports usage from its own profile', () => {
  const h = instanceHarness();
  try {
    const instances = createInstances(h.deps);
    const sessions = [savedFor('a'), savedFor('b')];
    for (const [alias, fh, org] of [['a', 20, 'org-a'], ['b', 70, 'org-b']] as const) {
      const dir = path.join(h.base, 'profiles', alias);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, usage.USAGE_FILE),
        JSON.stringify({ version: 2, samples: [{ t: 1, org, u: { fh, sd: 5 } }] })
      );
    }
    const described = instances.describe(sessions);
    assert.strictEqual(described[0].usage?.session?.leftPercent, 80);
    assert.strictEqual(described[0].usage?.orgUuid, 'org-a');
    assert.strictEqual(described[1].usage?.session?.leftPercent, 30);
    assert.strictEqual(described[1].usage?.orgUuid, 'org-b');
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('registry settings default to sharing and reject unknown keys', () => {
  assert.strictEqual(registry.emptyRegistry().settings.shareSession, true);
  assert.strictEqual(registry.settingsOf(null).shareSession, true);
  assert.strictEqual(registry.normalize({ profiles: [], settings: { shareSession: 'yes' } }).settings.shareSession, true);
  const off = registry.setSetting(registry.emptyRegistry(), 'shareSession', false);
  assert.strictEqual(off.settings.shareSession, false);
  assert.strictEqual(registry.normalize(off).settings.shareSession, false);
  assert.throws(() => registry.setSetting(off, 'nope' as 'shareSession', true), /Unknown setting/);
  assert.throws(() => registry.setSetting(off, 'shareSession', 'on' as unknown as boolean), /expects a boolean/);
});

test('swappedItems removes only the items it is told to share', () => {
  const all = ['Local State', 'Network', 'Local Storage', 'Session Storage', 'IndexedDB'];
  assert.deepStrictEqual(shared.swappedItems(all, ['Local Storage'], true), ['Local State', 'Network', 'Session Storage', 'IndexedDB']);
  assert.deepStrictEqual(shared.swappedItems(all, ['Local Storage'], false), all);
  assert.ok(shared.SHARED_CODE_ITEMS.includes('projects'));
  assert.ok(shared.SHARED_CODE_ITEMS.includes('history.jsonl'));
});

test('no Claude Desktop store is shared, because they all carry the signed in session', () => {
  assert.deepStrictEqual([...shared.SHARED_DESKTOP_ITEMS], []);
  const all: string[] = [...session.DESKTOP_ITEMS];
  assert.deepStrictEqual(shared.swappedItems(all, shared.SHARED_DESKTOP_ITEMS, true), all);
  for (const item of ['Local State', 'Preferences', 'Network', 'Local Storage', 'Session Storage', 'WebStorage', 'IndexedDB']) {
    assert.ok(all.includes(item), item + ' must be swapped per account');
  }
});

test('shared capture and apply move the common state without touching the login', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-shared-'));
  try {
    const live = path.join(base, 'Claude');
    const store = path.join(base, 'shared');
    seedDesktop(live, 'AAA');
    assert.deepStrictEqual(shared.capture(live, store, ['Local Storage']), ['Local Storage']);
    seedDesktop(live, 'BBB');
    assert.deepStrictEqual(shared.apply(store, live, ['Local Storage']), ['Local Storage']);
    assert.strictEqual(fs.readFileSync(path.join(live, 'Local Storage', 'leveldb.log'), 'utf8'), 'ls-AAA');
    assert.strictEqual(fs.readFileSync(path.join(live, 'Network', 'Cookies'), 'utf8'), 'BBB');
    assert.deepStrictEqual(shared.capture(path.join(base, 'missing'), store, ['Local Storage']), []);
    assert.deepStrictEqual(shared.apply(path.join(base, 'no-store'), live, ['Local Storage']), []);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
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

test('switching restores the local storage that belongs to the account', () => {
  const h = switcherHarness();
  try {
    seedTwoAccounts(h);
    fs.writeFileSync(path.join(h.profileDir, 'Local Storage', 'leveldb.log'), 'leftover-from-b');

    const result = createSwitcher(h.deps).switchTo('a-team.com');
    assert.deepStrictEqual(result.sharedItems, []);
    assert.strictEqual(fs.readFileSync(path.join(h.profileDir, 'Local Storage', 'leveldb.log'), 'utf8'), 'ls-SESSION-A');
    assert.strictEqual(fs.readFileSync(path.join(h.profileDir, 'Network', 'Cookies'), 'utf8'), 'SESSION-A');
    assert.strictEqual(fs.readFileSync(path.join(h.profileDir, 'Local State'), 'utf8'), 'state-SESSION-A');
    assert.strictEqual(JSON.parse(fs.readFileSync(h.credPath, 'utf8')).claudeAiOauth.accessToken, 'code-A');

    createSwitcher(h.deps).switchTo('b-team.com');
    assert.strictEqual(fs.readFileSync(path.join(h.profileDir, 'Local Storage', 'leveldb.log'), 'utf8'), 'leftover-from-b');
    assert.strictEqual(fs.readFileSync(path.join(h.profileDir, 'Network', 'Cookies'), 'utf8'), 'SESSION-B');
    assert.strictEqual(fs.readFileSync(path.join(h.profileDir, 'Local State'), 'utf8'), 'state-SESSION-B');
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('turning sharing off gives every account its own history again', () => {
  const h = switcherHarness();
  try {
    createSwitcher(h.deps).setSharing(false);
    seedTwoAccounts(h);
    assert.strictEqual(createSwitcher(h.deps).sharingEnabled(), false);

    fs.writeFileSync(path.join(h.profileDir, 'Local Storage', 'leveldb.log'), 'only-for-b');
    const result = createSwitcher(h.deps).switchTo('a-team.com');
    assert.deepStrictEqual(result.sharedItems, []);
    assert.strictEqual(fs.readFileSync(path.join(h.profileDir, 'Local Storage', 'leveldb.log'), 'utf8'), 'ls-SESSION-A');
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('turning sharing on no longer leaks local storage between accounts', () => {
  const h = switcherHarness();
  try {
    seedTwoAccounts(h);
    const slotStore = path.join(h.base, 'sessions', 'a-team.com', 'desktop', 'Local Storage');
    assert.ok(fs.existsSync(slotStore));

    fs.writeFileSync(path.join(h.profileDir, 'Local Storage', 'leveldb.log'), 'leftover-from-b');
    const result = createSwitcher(h.deps).setSharing(true);
    assert.strictEqual(result.shareSession, true);
    assert.deepStrictEqual(result.captured, []);
    assert.ok(fs.existsSync(slotStore));

    createSwitcher(h.deps).switchTo('a-team.com');
    assert.strictEqual(fs.readFileSync(path.join(h.profileDir, 'Local Storage', 'leveldb.log'), 'utf8'), 'ls-SESSION-A');
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test('listSessions reports the sharing state and which items stay common', () => {
  const h = switcherHarness();
  try {
    seedDesktop(h.profileDir, 'S');
    accountBlobFile(h.profileDir, 'a@team.com', 'Person A');
    fs.writeFileSync(h.credPath, JSON.stringify({ claudeAiOauth: { accessToken: 'c' } }));
    createSwitcher(h.deps).sync();

    const on = createSwitcher(h.deps).listSessions();
    assert.strictEqual(on.shareSession, true);
    assert.strictEqual(on.loginRouting, true, 'the panel learns whether sign in links are routed');
    assert.deepStrictEqual(on.sharedItems, shared.SHARED_DESKTOP_ITEMS);
    assert.deepStrictEqual(on.sharedCodeItems, shared.SHARED_CODE_ITEMS);

    createSwitcher(h.deps).setSharing(false);
    assert.strictEqual(createSwitcher(h.deps).listSessions().shareSession, false);
  } finally {
    fs.rmSync(h.base, { recursive: true, force: true });
  }
});

test("the web panel exposes a sharing route", () => {
  const calls: unknown[] = [];
  const service = { setSharing: (body: unknown) => { calls.push(body); return { ok: true }; } } as unknown as IPanelService;
  const routes = buildRoutes(service);
  assert.strictEqual(typeof routes["/api/accounts/sharing"], "function");
  routes["/api/accounts/sharing"]!({ enabled: false });
  assert.deepStrictEqual(calls, [{ enabled: false }]);
});

test('the bare command opens the panel and account commands skip the web prefix', () => {
  assert.deepStrictEqual(routeCommand([]), { kind: 'panel', args: [] });
  assert.deepStrictEqual(routeCommand(['help']), { kind: 'help', args: [] });
  assert.deepStrictEqual(routeCommand(['-h']), { kind: 'help', args: [] });
  assert.deepStrictEqual(routeCommand(['menu']), { kind: 'menu', args: [] });
  assert.deepStrictEqual(routeCommand(['switch', 'work']), { kind: 'web', args: ['switch', 'work'] });
  assert.deepStrictEqual(routeCommand(['share', 'off']), { kind: 'web', args: ['share', 'off'] });
  assert.deepStrictEqual(routeCommand(['web', 'list']), { kind: 'web', args: ['list'] });
  assert.deepStrictEqual(routeCommand(['profiles']), { kind: 'web', args: [] });
  assert.deepStrictEqual(routeCommand(['run']), { kind: 'task', args: ['run'] });
  assert.deepStrictEqual(routeCommand(['status']), { kind: 'task', args: ['status'] });
});

test('every declared bin entry points at a real file', () => {
  const root = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { bin: Record<string, string> };
  assert.deepStrictEqual(Object.keys(pkg.bin).sort(), ['cdeck', 'claudedeck']);
  for (const target of Object.values(pkg.bin)) {
    const file = path.join(root, target);
    assert.ok(fs.existsSync(file), target + ' is missing');
    assert.ok(fs.readFileSync(file, 'utf8').startsWith('#!/usr/bin/env node'), target + ' has no shebang');
  }
});
