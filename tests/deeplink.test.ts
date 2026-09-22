import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import * as deeplink from '../src/accounts/deeplink';
import { IDeeplinkDeps, IDeeplinkState } from '../src/accounts/interfaces';

const WORK = 'C:\\Users\\tester\\AppData\\Roaming\\ClaudeDeck\\profiles\\work';
const HOME = 'C:\\Users\\tester\\AppData\\Roaming\\ClaudeDeck\\profiles\\home';

function stateWith(dir: string | null, alias: string | null = 'work'): IDeeplinkState {
  return { ...deeplink.emptyState(), alias, dir };
}

function harness(overrides: Partial<IDeeplinkDeps> = {}) {
  const launched: string[][] = [];
  const written: string[] = [];
  const restored: [string | null, boolean][] = [];
  let state = deeplink.emptyState();
  let command: string | null = '"C:\\Program Files\\Claude\\Claude.exe" "%1"';
  const deps: Partial<IDeeplinkDeps> = {
    platform: 'win32',
    readState: () => state,
    writeState: next => { state = next; return next; },
    readCommand: () => command,
    writeCommand: value => { written.push(value); command = value; },
    restoreCommand: (fallback, created) => { restored.push([fallback, created]); command = fallback; },
    wantedCommand: () => 'wscript.exe "C:\\deck\\scripts\\windows\\deeplink.vbs" "node.exe" "C:\\deck\\bin\\claudedeck.js" deeplink "%1"',
    listProcesses: () => [],
    signedOut: () => false,
    launch: (exe, args) => { launched.push([exe, ...args]); return 99; },
    locate: () => 'C:\\Claude.exe',
    now: () => new Date('2026-09-22T00:00:00Z'),
    ...overrides,
  };
  return {
    deps,
    launched,
    written,
    restored,
    setState: (next: IDeeplinkState) => { state = next; },
    getState: () => state,
    setCommand: (next: string | null) => { command = next; },
    getCommand: () => command,
  };
}

test('only claude:// links are forwarded', () => {
  assert.ok(deeplink.isProtocolUrl('claude://oauth/callback?code=123'));
  assert.ok(deeplink.isProtocolUrl('CLAUDE://oauth'));
  assert.ok(!deeplink.isProtocolUrl('https://claude.ai'));
  assert.ok(!deeplink.isProtocolUrl(''));
  const h = harness();
  assert.throws(() => deeplink.forward('https://claude.ai', h.deps), /not a claude:\/\/ link/);
});

test('the handler command runs the CLI through the hidden shim', () => {
  const command = deeplink.handlerCommand('C:\\deck\\scripts\\windows\\deeplink.vbs', 'C:\\node.exe', 'C:\\deck\\bin\\claudedeck.js');
  assert.strictEqual(command, 'wscript.exe "C:\\deck\\scripts\\windows\\deeplink.vbs" "C:\\node.exe" "C:\\deck\\bin\\claudedeck.js" deeplink "%1"');
  assert.ok(deeplink.isOurCommand(command));
  assert.ok(!deeplink.isOurCommand('"C:\\Program Files\\Claude\\Claude.exe" "%1"'));
  assert.ok(!deeplink.isOurCommand(null));
  assert.ok(fs.existsSync(deeplink.shimPath()), 'the shim ships with the package');
});

test('a registry query is read down to its value', () => {
  const output = [
    '',
    'HKEY_CURRENT_USER\\Software\\Classes\\claude\\shell\\open\\command',
    '    (Default)    REG_SZ    "C:\\Program Files\\Claude\\Claude.exe" "%1"',
    '',
  ].join('\r\n');
  assert.strictEqual(deeplink.parseRegistryCommand(output), '"C:\\Program Files\\Claude\\Claude.exe" "%1"');
  assert.strictEqual(deeplink.parseRegistryCommand(null), null);
  assert.strictEqual(deeplink.parseRegistryCommand('ERROR: The system was unable to find'), null);
});

test('only the profile windows are candidates, listed once each', () => {
  const dirs = deeplink.runningProfileDirs([
    { pid: 1, commandLine: 'Claude.exe' },
    { pid: 2, commandLine: 'Claude.exe --user-data-dir="' + WORK + '"' },
    { pid: 3, commandLine: 'Claude.exe --user-data-dir="' + WORK + '" --type=renderer' },
    { pid: 4, commandLine: 'Claude.exe --user-data-dir=' + HOME },
  ]);
  assert.deepStrictEqual(dirs, [WORK, HOME]);
});

test('the sign in link goes to the window that was opened last and is still signed out', () => {
  const signedOut = (dir: string) => dir !== WORK;
  assert.strictEqual(deeplink.pendingProfile(stateWith(HOME, 'home'), [WORK, HOME], signedOut), HOME);
  assert.strictEqual(deeplink.pendingProfile(stateWith(WORK), [WORK, HOME], signedOut), HOME, 'a signed in window is skipped');
  assert.strictEqual(deeplink.pendingProfile(stateWith(null, null), [WORK, HOME], signedOut), HOME);
  assert.strictEqual(deeplink.pendingProfile(stateWith(HOME, 'home'), [], signedOut), null);
});

test('a window opened by ClaudeDeck still takes the link when its saved login went stale', () => {
  assert.strictEqual(
    deeplink.pendingProfile(stateWith(HOME, 'home'), [WORK, HOME], () => false),
    HOME,
    'saved tokens can be expired, so the window ClaudeDeck opened keeps the link'
  );
  assert.strictEqual(deeplink.pendingProfile(stateWith(HOME, 'home'), [WORK], () => false), null, 'that window is closed');
  assert.strictEqual(deeplink.pendingProfile(stateWith(null, null), [WORK], () => false), null);
});

test('forwarding launches the waiting profile with the link', () => {
  const h = harness({
    listProcesses: () => [{ pid: 2, commandLine: 'Claude.exe --user-data-dir="' + HOME + '"' }],
    signedOut: () => true,
  });
  h.setState(stateWith(HOME, 'home'));

  const result = deeplink.forward('claude://oauth/callback?code=abc', h.deps);
  assert.strictEqual(result.routed, true);
  assert.strictEqual(result.alias, 'home');
  assert.strictEqual(result.dir, HOME);
  assert.deepStrictEqual(h.launched, [['C:\\Claude.exe', '--user-data-dir=' + HOME, 'claude://oauth/callback?code=abc']]);
});

test('with no window waiting the link falls back to Claude Desktop', () => {
  const h = harness();
  const result = deeplink.forward('claude://oauth/callback?code=abc', h.deps);
  assert.strictEqual(result.routed, false);
  assert.strictEqual(result.dir, null);
  assert.deepStrictEqual(h.launched, [['C:\\Claude.exe', 'claude://oauth/callback?code=abc']]);
});

test('installing the handler keeps the Claude Desktop command as the fallback', () => {
  const h = harness();
  const first = deeplink.installHandler(h.deps);
  assert.strictEqual(first.changed, true);
  assert.strictEqual(first.installed, true);
  assert.strictEqual(first.fallbackCommand, '"C:\\Program Files\\Claude\\Claude.exe" "%1"');
  assert.strictEqual(h.getState().handler.created, false);
  assert.strictEqual(h.written.length, 1);

  const second = deeplink.installHandler(h.deps);
  assert.strictEqual(second.changed, false, 'a second install writes nothing');
  assert.strictEqual(h.written.length, 1);
  assert.strictEqual(deeplink.handlerStatus(h.deps).installed, true);
});

test('removing the handler puts the old command back', () => {
  const h = harness();
  deeplink.installHandler(h.deps);
  const removed = deeplink.removeHandler(h.deps);
  assert.strictEqual(removed.changed, true);
  assert.strictEqual(removed.installed, false);
  assert.deepStrictEqual(h.restored, [['"C:\\Program Files\\Claude\\Claude.exe" "%1"', false]]);
  assert.strictEqual(h.getCommand(), '"C:\\Program Files\\Claude\\Claude.exe" "%1"');
  assert.strictEqual(h.getState().handler.fallbackCommand, null);
  assert.strictEqual(deeplink.removeHandler(h.deps).changed, false, 'removing twice is harmless');
});

test('a handler we created is deleted rather than restored', () => {
  const h = harness();
  h.setCommand(null);
  deeplink.installHandler(h.deps);
  assert.strictEqual(h.getState().handler.created, true);
  deeplink.removeHandler(h.deps);
  assert.deepStrictEqual(h.restored, [[null, true]]);
});

test('sign in link routing is a Windows only concern', () => {
  const h = harness({ platform: 'darwin' });
  assert.deepStrictEqual(deeplink.installHandler(h.deps).supported, false);
  assert.deepStrictEqual(deeplink.removeHandler(h.deps).supported, false);
  assert.deepStrictEqual(deeplink.handlerStatus(h.deps).supported, false);
  assert.strictEqual(h.written.length, 0);
});

test('the open window is remembered on disk for the link to follow', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-link-'));
  try {
    const file = path.join(base, 'deeplink.json');
    assert.deepStrictEqual(deeplink.readState(file), deeplink.emptyState());

    const saved = deeplink.rememberOpen('work', WORK, {
      readState: () => deeplink.readState(file),
      writeState: next => deeplink.writeState(next, file),
      now: () => new Date('2026-09-22T05:00:00Z'),
    });
    assert.strictEqual(saved.alias, 'work');
    assert.strictEqual(saved.dir, WORK);
    assert.strictEqual(saved.at, '2026-09-22T05:00:00.000Z');
    assert.deepStrictEqual(deeplink.readState(file), saved);

    fs.writeFileSync(file, '{ broken');
    assert.deepStrictEqual(deeplink.readState(file), deeplink.emptyState());
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
