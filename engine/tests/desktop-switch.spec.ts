import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { launchTarget, packagedAppId } from '../src/accounts/desktop-app';
import { readDesktopJob, runDesktopJob, startDesktopJob } from '../src/accounts/desktop-job';
import { IAccountIdentity, ISwitcher } from '../src/accounts/interfaces';
import * as procs from '../src/accounts/processes';
import * as registry from '../src/accounts/registry';
import { createSwitcher } from '../src/accounts/switcher';

const STORE_EXE = 'C:\\Program Files\\WindowsApps\\Claude_2.42304.0.0_x64__pzs8sxrjxfjjc\\app\\Claude.exe';
const STORE_MANIFEST = [
  '<Package>',
  '<Application Id="Claude" Executable="app\\Claude.exe" EntryPoint="Windows.FullTrustApplication">',
  '<Application Id="SshProxy" Executable="app\\resources\\claude-ssh-proxy.exe" EntryPoint="Windows.FullTrustApplication">',
  '</Package>',
].join('\n');

test('process lines keep the executable when the listing carries it', () => {
  const text = [
    `7${procs.SEPARATOR}C:\\Apps\\Claude\\Claude.exe${procs.SEPARATOR}"C:\\Apps\\Claude\\Claude.exe" --startup`,
    `8${procs.SEPARATOR}Claude.exe --type=renderer`,
  ].join('\n');
  assert.deepStrictEqual(procs.parseProcessLines(text), [
    { pid: 7, executablePath: 'C:\\Apps\\Claude\\Claude.exe', commandLine: '"C:\\Apps\\Claude\\Claude.exe" --startup' },
    { pid: 8, commandLine: 'Claude.exe --type=renderer' },
  ]);
});

test('only Claude Desktop processes are picked, never a Claude Code binary', () => {
  const desktopDir = 'C:\\Program Files\\WindowsApps\\Claude_1_x64__id\\app';
  const exists = (file: string) => file === path.win32.join(desktopDir, 'resources', 'app.asar');
  const listed = [
    { pid: 1, executablePath: `${desktopDir}\\Claude.exe`, commandLine: '"Claude.exe" --startup' },
    { pid: 2, executablePath: `${desktopDir}\\Claude.exe`, commandLine: '"Claude.exe" --type=renderer' },
    { pid: 3, executablePath: 'C:\\Users\\me\\AppData\\Roaming\\Claude\\claude-code\\2.1.299\\claude.exe', commandLine: 'claude.exe --output-format stream-json' },
    { pid: 4, executablePath: 'C:\\Users\\me\\.vscode\\extensions\\anthropic.claude-code\\resources\\native-binary\\claude.exe', commandLine: 'claude.exe' },
    { pid: 5, commandLine: `"${desktopDir}\\Claude.exe" --type=gpu-process` },
    { pid: 6, commandLine: 'claude.exe -p hi' },
  ];
  assert.deepStrictEqual(procs.desktopOnly(listed, exists).map(entry => entry.pid), [1, 2, 5]);
});

test('a Store install reopens through its app id so it keeps its own profile', () => {
  const read = (file: string) => {
    assert.strictEqual(file, 'C:\\Program Files\\WindowsApps\\Claude_2.42304.0.0_x64__pzs8sxrjxfjjc\\AppxManifest.xml');
    return STORE_MANIFEST;
  };
  assert.strictEqual(packagedAppId(STORE_EXE, read), 'Claude_pzs8sxrjxfjjc!Claude');
  assert.deepStrictEqual(launchTarget(STORE_EXE, read), {
    command: 'explorer.exe',
    args: ['shell:AppsFolder\\Claude_pzs8sxrjxfjjc!Claude'],
  });
  assert.strictEqual(packagedAppId(STORE_EXE, () => { throw new Error('no access'); }), null);
});

test('a classic install reopens through its own exe', () => {
  const exe = 'C:\\Users\\me\\AppData\\Local\\AnthropicClaude\\app-1.0\\claude.exe';
  assert.deepStrictEqual(launchTarget(exe), { command: exe, args: [] });
});

function harness(options: { exitAfterPolls?: number; desktop?: IAccountIdentity | null } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-desk-'));
  const profileDir = path.join(base, 'Claude');
  const events: string[] = [];
  let polls = 0;
  const exitAfter = options.exitAfterPolls ?? 0;
  fs.mkdirSync(path.join(profileDir, 'Network'), { recursive: true });
  fs.writeFileSync(path.join(profileDir, 'Network', 'Cookies'), 'LIVE');
  const deps = {
    profileDir,
    credPath: path.join(base, '.credentials.json'),
    accountPath: path.join(base, '.claude.json'),
    slotOf: (alias: string) => path.join(base, 'sessions', alias),
    registryFile: path.join(base, 'profiles.json'),
    installs: [],
    readIdentity: () => (options.desktop === undefined ? { email: 'b@team.com', name: 'B', accountUuid: 'uuid-b' } : options.desktop),
    listProcesses: () => {
      if (!events.includes('killed')) return [{ pid: 10, commandLine: 'Claude.exe' }];
      polls += 1;
      return polls > exitAfter ? [] : [{ pid: 10, commandLine: 'Claude.exe' }];
    },
    kill: (pids: number[]) => {
      events.push('killed');
      return pids.length;
    },
    launch: (command: string) => {
      events.push(`launched ${command}`);
      return 1;
    },
    locate: () => 'C:/Claude.exe',
    pause: (ms: number) => {
      events.push(`pause ${ms}`);
    },
    now: () => new Date('2026-10-16T00:00:00Z'),
  };
  const save = (alias: string, email: string) =>
    registry.write(
      registry.saveSession(registry.read(deps.registryFile), { alias, email, name: alias, installs: ['code'] }),
      deps.registryFile
    );
  return { base, deps, events, save, cleanup: () => fs.rmSync(base, { recursive: true, force: true }) };
}

test('switching waits for Claude Desktop to close before it touches the login files', () => {
  const h = harness({ exitAfterPolls: 3 });
  try {
    h.save('work', 'w@team.com');
    fs.mkdirSync(path.join(h.deps.slotOf('work'), 'desktop', 'Network'), { recursive: true });
    fs.writeFileSync(path.join(h.deps.slotOf('work'), 'desktop', 'Network', 'Cookies'), 'WORK');
    const result = createSwitcher(h.deps).switchTo('work');
    assert.strictEqual(result.stopped, 1);
    assert.deepStrictEqual(h.events, ['killed', 'pause 250', 'pause 250', 'pause 250', 'pause 750', 'launched C:/Claude.exe']);
    assert.strictEqual(fs.readFileSync(path.join(h.deps.profileDir, 'Network', 'Cookies'), 'utf8'), 'WORK');
  } finally {
    h.cleanup();
  }
});

test('Claude Desktop that never closes stops the switch before any file is swapped', () => {
  const h = harness({ exitAfterPolls: Number.POSITIVE_INFINITY });
  try {
    h.save('work', 'w@team.com');
    fs.mkdirSync(path.join(h.deps.slotOf('work'), 'desktop'), { recursive: true });
    assert.throws(() => createSwitcher(h.deps).switchTo('work'), /did not close/);
    assert.strictEqual(fs.readFileSync(path.join(h.deps.profileDir, 'Network', 'Cookies'), 'utf8'), 'LIVE');
  } finally {
    h.cleanup();
  }
});

test('Claude Desktop comes back even when restoring the login fails', () => {
  const h = harness();
  try {
    h.save('work', 'w@team.com');
    assert.throws(() => createSwitcher(h.deps).switchTo('work'), /No saved session for "work"/);
    assert.ok(h.events.includes('launched C:/Claude.exe'));
  } finally {
    h.cleanup();
  }
});

test('saving the Desktop login never files the Claude Code token of another account under it', () => {
  const h = harness();
  try {
    fs.writeFileSync(h.deps.accountPath, JSON.stringify({ oauthAccount: { emailAddress: 'a@team.com', displayName: 'A' } }));
    fs.writeFileSync(h.deps.credPath, JSON.stringify({ claudeAiOauth: { accessToken: 'token-of-a' } }));
    const saved = createSwitcher(h.deps).sync();
    assert.strictEqual(saved.email, 'b@team.com');
    assert.strictEqual(fs.readFileSync(path.join(h.deps.slotOf(saved.alias), 'desktop', 'Network', 'Cookies'), 'utf8'), 'LIVE');
    assert.strictEqual(fs.existsSync(path.join(h.deps.slotOf(saved.alias), 'code.json')), false);
    assert.ok(h.events.includes('launched C:/Claude.exe'));
  } finally {
    h.cleanup();
  }
});

test('the Desktop checks explain what is missing before anything restarts', () => {
  const h = harness({ desktop: null });
  try {
    h.save('work', 'w@team.com');
    const switcher = createSwitcher(h.deps);
    assert.throws(() => switcher.checkDesktopSwitch('ghost'), /No saved session for "ghost"/);
    assert.throws(() => switcher.checkDesktopSwitch('work'), /no saved Claude Desktop login yet/);
    assert.throws(() => switcher.checkDesktopSave(), /Claude Desktop is not signed in/);
    fs.mkdirSync(path.join(h.deps.slotOf('work'), 'desktop', 'Network'), { recursive: true });
    fs.writeFileSync(path.join(h.deps.slotOf('work'), 'desktop', 'Network', 'Cookies'), 'WORK');
    assert.strictEqual(switcher.checkDesktopSwitch('WORK').alias, 'work');
    assert.deepStrictEqual(h.events, []);
  } finally {
    h.cleanup();
  }
});

test('a Desktop job runs in a process of its own and records how it ended', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-job-'));
  const spawned: string[][] = [];
  const pauses: number[] = [];
  const deps = {
    file: path.join(base, 'desktop-job.json'),
    node: 'node.exe',
    bin: 'claudedeck.js',
    delayMs: 2000,
    spawn: (command: string, args: string[]) => {
      spawned.push([command, ...args]);
      return 1;
    },
    pause: (ms: number) => {
      pauses.push(ms);
    },
    now: () => new Date('2026-10-16T01:02:03Z'),
  };
  const switcher = (outcome: 'ok' | 'fail') =>
    ({
      switchTo: (alias: string) => {
        if (outcome === 'fail') throw new Error('Claude Desktop did not close.');
        return { alias };
      },
      sync: () => ({ alias: 'b-team.com' }),
    }) as unknown as ISwitcher;
  try {
    const queued = startDesktopJob('switch', 'work', deps);
    assert.deepStrictEqual(spawned, [['node.exe', 'claudedeck.js', 'desktop', 'switch', 'work']]);
    assert.strictEqual(queued.ok, null);
    assert.deepStrictEqual(readDesktopJob(deps), queued);

    const done = runDesktopJob('switch', 'work', switcher('ok'), deps);
    assert.deepStrictEqual(pauses, [2000]);
    assert.deepStrictEqual(done, { ...queued, ok: true, finishedAt: '2026-10-16T01:02:03.000Z' });

    const failed = runDesktopJob('switch', 'work', switcher('fail'), deps);
    assert.strictEqual(failed.ok, false);
    assert.strictEqual(failed.error, 'Claude Desktop did not close.');
    assert.deepStrictEqual(readDesktopJob(deps), failed);

    assert.strictEqual(runDesktopJob('save', null, switcher('ok'), deps).alias, 'b-team.com');
    assert.match(runDesktopJob('switch', null, switcher('ok'), deps).error ?? '', /Which account/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

function seedConfig(profileDir: string) {
  fs.writeFileSync(
    path.join(profileDir, 'config.json'),
    JSON.stringify({ 'oauth:tokenCache': 'token-b', lastKnownAccountUuid: 'uuid-b', windowSizeWasSignedIn: true })
  );
}

test('adding a Desktop account saves the one on screen, then opens a clean sign in screen', () => {
  const h = harness();
  try {
    seedConfig(h.deps.profileDir);
    fs.writeFileSync(h.deps.accountPath, JSON.stringify({ oauthAccount: { emailAddress: 'a@team.com', displayName: 'A' } }));
    fs.writeFileSync(h.deps.credPath, JSON.stringify({ claudeAiOauth: { accessToken: 'token-of-a' } }));
    const result = createSwitcher(h.deps).freshDesktop();
    assert.strictEqual(result.alias, 'b-team.com');
    assert.deepStrictEqual(result.cleared, ['Network']);
    const slot = h.deps.slotOf('b-team.com');
    assert.strictEqual(fs.readFileSync(path.join(slot, 'desktop', 'Network', 'Cookies'), 'utf8'), 'LIVE');
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(slot, 'config.json'), 'utf8'))['oauth:tokenCache'], 'token-b');
    assert.strictEqual(fs.existsSync(path.join(slot, 'code.json')), false);
    assert.strictEqual(fs.existsSync(path.join(h.deps.profileDir, 'Network')), false);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(h.deps.profileDir, 'config.json'), 'utf8')), { windowSizeWasSignedIn: true });
    assert.deepStrictEqual(h.events.filter(event => !event.startsWith('pause')), ['killed', 'launched C:/Claude.exe']);
  } finally {
    h.cleanup();
  }
});

test('a Desktop with no login is cleared without saving anything', () => {
  const h = harness({ desktop: null });
  try {
    const result = createSwitcher(h.deps).freshDesktop();
    assert.strictEqual(result.alias, null);
    assert.deepStrictEqual(result.cleared, ['Network']);
    assert.strictEqual(fs.existsSync(h.deps.slotOf('b-team.com')), false);
  } finally {
    h.cleanup();
  }
});

test('nothing is cleared when the login on screen could not be saved', () => {
  const h = harness();
  try {
    seedConfig(h.deps.profileDir);
    fs.rmSync(path.join(h.deps.profileDir, 'Network'), { recursive: true, force: true });
    assert.throws(() => createSwitcher(h.deps).freshDesktop(), /no login files to save/);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(h.deps.profileDir, 'config.json'), 'utf8'))['oauth:tokenCache'], 'token-b');
    assert.ok(h.events.includes('launched C:/Claude.exe'));
  } finally {
    h.cleanup();
  }
});

test('the add job runs the clean sign in screen and records the saved account', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-job-add-'));
  try {
    const deps = { file: path.join(base, 'desktop-job.json'), delayMs: 0, pause: () => undefined, now: () => new Date('2026-10-16T02:00:00Z') };
    const switcher = { freshDesktop: () => ({ alias: 'b-team.com', email: 'b@team.com', name: 'B', cleared: [], stopped: 1 }) } as unknown as ISwitcher;
    const job = runDesktopJob('add', null, switcher, deps);
    assert.strictEqual(job.action, 'add');
    assert.strictEqual(job.alias, 'b-team.com');
    assert.strictEqual(job.ok, true);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
