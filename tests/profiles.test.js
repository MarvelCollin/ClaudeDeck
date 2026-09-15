const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');

const { launchArgs, windowsCandidates } = require('../scripts/lib/profiles/app');
const paths = require('../scripts/lib/profiles/paths');
const procs = require('../scripts/lib/profiles/procs');
const registry = require('../scripts/lib/profiles/registry');
const { allowedHost, startServer } = require('../scripts/lib/web/server');

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
  assert.strictEqual(groups.has(null), false);
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
    assert.ok((await html.text()).includes('Claude Desktop accounts'));
  } finally {
    session.close();
  }
});

test('server shuts itself down when the page stops pinging', async () => {
  const session = await startServer({ token: 'secret', idleTimeout: 1 }).listen();
  await new Promise(resolve => session.server.once('close', resolve));
  assert.ok(true);
});

test('legacy ClaudeCron data folder is moved to ClaudeDeck once', () => {
  const appPaths = require('../scripts/lib/paths');
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

const identity = require('../scripts/lib/profiles/identity');

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
  assert.strictEqual(identity.readV8String(v8String('kolin'), 0).text, 'kolin');
  const wide = Buffer.from('hi', 'utf16le');
  const twoByte = Buffer.concat([Buffer.from([0x63, wide.length]), wide]);
  assert.strictEqual(identity.readV8String(twoByte, 0).text, 'hi');
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
    assert.strictEqual(identity.readIdentity(dir), null);
    const db = path.join(dir, 'IndexedDB', 'https_claude.ai_0.indexeddb.blob', '4', '00');
    fs.mkdirSync(db, { recursive: true });
    fs.writeFileSync(path.join(db, '13'), accountBlob('work@example.com', 'Work Person', 'Work Person'));
    assert.deepStrictEqual(identity.readIdentity(dir), { email: 'work@example.com', name: 'Work Person' });
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
    assert.strictEqual(identity.readIdentity(dir), null);
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
  assert.strictEqual(registry.identityFor(data, 'default').name, 'Me');

  data = registry.remove(data, 'work');
  assert.strictEqual(registry.identityFor(data, 'work'), null);
  assert.strictEqual(registry.identityFor(data, 'default').name, 'Me');
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
