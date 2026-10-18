import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { toRanked } from '../src/accounts/auto-rank';
import { normalizeAutoState } from '../src/accounts/auto-switch';
import { profileLaunchTarget } from '../src/accounts/desktop-app';
import { createDesktopWindows, isMainProcess, userDataDirOf } from '../src/accounts/desktop-windows';
import { IClaudeProcess, ILiveUsage, ISessionListEntry, ISwitcher } from '../src/accounts/interfaces';
import * as registry from '../src/accounts/registry';
import { handoffFolders, handoffLaunch, startHandoff } from '../src/accounts/session-handoff';
import * as session from '../src/accounts/session-store';
import { desktopNudge, desktopSeat } from '../src/cli/api-command';
import { consoleCommandLine, newConsoleLaunch } from '../src/core/console';
import { writeJsonFile } from '../src/core/fs/json';

const EXE = 'C:\\Program Files\\WindowsApps\\Claude_2.42304.0.0_x64__pzs8sxrjxfjjc\\app\\Claude.exe';
const NOW = new Date('2026-10-18T16:00:00Z');
const SESSION = '0b027735-10d8-4834-855a-c5955e955568';

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-windows-'));
  const registryFile = path.join(dir, 'profiles.json');
  const defaultProfileDir = path.join(dir, 'Claude');
  const profilesRoot = path.join(dir, 'desktop-profiles');
  const slotOf = (alias: string) => path.join(dir, 'sessions', alias);
  let data = registry.emptyRegistry();
  for (const [alias, uuid] of [['home', 'uuid-home'], ['work', 'uuid-work'], ['side', 'uuid-side']] as const) {
    data = registry.saveSession(data, { alias, email: `${alias}@x.com`, name: alias, accountUuid: uuid, installs: ['code'] }, NOW);
  }
  registry.write(data, registryFile);
  writeJsonFile(path.join(defaultProfileDir, 'config.json'), { lastKnownAccountUuid: 'uuid-home', 'oauth:tokenCache': 'home' });
  const workSlot = slotOf('work');
  fs.mkdirSync(path.join(workSlot, 'desktop', 'Local Storage'), { recursive: true });
  fs.writeFileSync(path.join(workSlot, 'desktop', 'Local Storage', 'leveldb'), 'work login');
  writeJsonFile(path.join(workSlot, 'config.json'), { lastKnownAccountUuid: 'uuid-work', 'oauth:tokenCache': 'work' });

  const launched: string[][] = [];
  let afterLaunch: () => void = () => undefined;
  let defaults = 0;
  let processes: IClaudeProcess[] = [];
  const windows = createDesktopWindows({
    defaultProfileDir,
    profilesRoot,
    registryFile,
    slotOf,
    listProcesses: () => processes,
    launch: (command, args) => {
      launched.push([command, ...args]);
      afterLaunch();
      return 1;
    },
    launchDefault: () => {
      defaults += 1;
    },
    profileLauncher: () => ({ command: 'claude-desktop.exe', args: [] }),
    pause: () => undefined,
    now: () => NOW,
  });
  return {
    dir,
    profilesRoot,
    slotOf,
    windows,
    launched,
    defaults: () => defaults,
    onLaunch: (hook: () => void) => {
      afterLaunch = hook;
    },
    setProcesses: (next: IClaudeProcess[]) => {
      processes = next;
    },
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

test('a window keeps its own profile folder on the command line, child processes are not windows', () => {
  assert.strictEqual(userDataDirOf('"C:\\a\\claude-desktop.exe" --user-data-dir=C:\\Users\\me\\.claudedeck\\desktop-profiles\\work'), 'C:\\Users\\me\\.claudedeck\\desktop-profiles\\work');
  assert.strictEqual(userDataDirOf('Claude.exe "--user-data-dir=C:\\With Space\\work"'), 'C:\\With Space\\work');
  assert.strictEqual(userDataDirOf('Claude.exe --user-data-dir="C:\\With Space\\work" --flag'), 'C:\\With Space\\work');
  assert.strictEqual(userDataDirOf(`"${EXE}" `), null);
  assert.ok(isMainProcess({ pid: 1, commandLine: `"${EXE}" ` }));
  assert.ok(!isMainProcess({ pid: 2, commandLine: `"${EXE}" --type=renderer --user-data-dir=C:\\p` }));
});

test('a Store install starts an extra window through its app alias, a classic one through its exe', () => {
  const env = { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' };
  const alias = 'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\claude-desktop.exe';
  assert.deepStrictEqual(profileLaunchTarget(EXE, 'win32', file => file === alias, env), { command: alias, args: [] });
  assert.deepStrictEqual(profileLaunchTarget('C:\\Apps\\Claude\\Claude.exe', 'win32', () => true, env), { command: 'C:\\Apps\\Claude\\Claude.exe', args: [] });
  assert.deepStrictEqual(profileLaunchTarget('/Applications/Claude.app/Contents/MacOS/Claude', 'darwin'), {
    command: 'open',
    args: ['-n', '-a', '/Applications/Claude.app', '--args'],
  });
});

test('running windows are matched to their accounts, the default one by its login', () => {
  const f = fixture();
  try {
    const workDir = path.join(f.profilesRoot, 'work');
    f.setProcesses([
      { pid: 10, commandLine: `"${EXE}" ` },
      { pid: 11, commandLine: `"${EXE}" --type=gpu-process` },
      { pid: 12, commandLine: `claude-desktop.exe --user-data-dir=${workDir}` },
    ]);
    assert.deepStrictEqual(
      f.windows.list().map(entry => [entry.pid, entry.isDefault, entry.alias]),
      [
        [10, true, 'home'],
        [12, false, 'work'],
      ]
    );
    assert.strictEqual(f.windows.defaultAlias(), 'home');
  } finally {
    f.cleanup();
  }
});

test('opening an account never closes a window: it brings the open one forward or starts its own', () => {
  const f = fixture();
  try {
    const home = f.windows.open('home');
    assert.strictEqual(home.isDefault, true);
    assert.strictEqual(home.action, 'opened');
    assert.strictEqual(f.defaults(), 1);

    const work = f.windows.open('work');
    const workDir = path.join(f.profilesRoot, 'work');
    assert.strictEqual(work.action, 'prepared');
    assert.deepStrictEqual(f.launched.at(-1), ['claude-desktop.exe', `--user-data-dir=${workDir}`]);
    assert.strictEqual(fs.readFileSync(path.join(workDir, 'Local Storage', 'leveldb'), 'utf8'), 'work login');
    assert.ok(session.hasAccountConfig(path.join(workDir, 'config.json')));
    assert.strictEqual(session.readWindowMarker(f.slotOf('work'))?.profileDir, workDir);

    fs.writeFileSync(path.join(f.slotOf('work'), 'desktop', 'Local Storage', 'leveldb'), 'stale copy');
    assert.strictEqual(f.windows.open('work').action, 'opened');
    assert.strictEqual(fs.readFileSync(path.join(workDir, 'Local Storage', 'leveldb'), 'utf8'), 'work login');

    f.setProcesses([{ pid: 12, commandLine: `claude-desktop.exe --user-data-dir=${workDir}` }]);
    assert.strictEqual(f.windows.open('work').action, 'focused');
    assert.strictEqual(f.launched.length, 3);
    f.setProcesses([]);
    f.onLaunch(() => f.setProcesses([{ pid: 13, commandLine: `claude-desktop.exe --user-data-dir=${workDir}` }]));
    assert.strictEqual(f.windows.open('work').action, 'opened');
    assert.strictEqual(f.launched.length, 5, 'a window that starts hidden is launched once more to show it');
    assert.ok(f.windows.ready('work'));
  } finally {
    f.cleanup();
  }
});

test('an account without a saved Desktop login gets no empty window', () => {
  const f = fixture();
  try {
    assert.strictEqual(f.windows.ready('side'), false);
    assert.throws(() => f.windows.open('side'), /no saved Claude Desktop login/);
    assert.strictEqual(f.launched.length, 0);
    assert.ok(!fs.existsSync(path.join(f.profilesRoot, 'side', 'config.json')));
  } finally {
    f.cleanup();
  }
});

test('a Store session folder is tried as the app sees it and as it lies on disk', () => {
  const env = { APPDATA: 'C:\\Users\\me\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' };
  const cwd = 'C:\\Users\\me\\AppData\\Roaming\\Claude\\scratch-workspaces\\a\\b';
  assert.deepStrictEqual(handoffFolders('C:\\code\\app', 'linux', env), ['C:\\code\\app']);
  assert.strictEqual(handoffFolders(cwd, 'win32', env)[0], cwd);
});

test('the terminal handoff resumes a copy of the session in its folder', () => {
  const win = handoffLaunch(SESSION, ['C:\\code\\app', 'D:\\alt'], 'work', 'win32', 'C:\\deck\\scripts\\handoff.ps1');
  assert.strictEqual(win.command, 'powershell.exe');
  const script = win.args.at(-1) ?? '';
  assert.match(script, /^Start-Process conhost\.exe -ArgumentList '/);
  assert.ok(script.includes(`powershell.exe -NoExit -NoProfile -ExecutionPolicy Bypass -File C:\\deck\\scripts\\handoff.ps1 -SessionId ${SESSION} -Name work -Folder C:\\code\\app -AltFolder D:\\alt`));
  const mac = handoffLaunch(SESSION, ["/Users/me/it's"], 'work', 'darwin');
  assert.strictEqual(mac.command, 'osascript');
  assert.match(mac.args[1] ?? '', /claude --resume 0b027735-10d8-4834-855a-c5955e955568 --fork-session/);
});

test('a new console window gets one quoted command line, so it opens visible through conhost', () => {
  assert.strictEqual(consoleCommandLine(['powershell.exe', '-File', 'C:\\With Space\\a.ps1', '-Name', '', 'say "hi"']), 'powershell.exe -File "C:\\With Space\\a.ps1" -Name "" "say \\"hi\\""');
  const launch = newConsoleLaunch(['powershell.exe', '-Name', "it's"]);
  assert.deepStrictEqual(launch.args.slice(0, 2), ['-NoProfile', '-Command']);
  assert.strictEqual(launch.args[2], "Start-Process conhost.exe -ArgumentList 'powershell.exe -Name it''s'");
});

test('a handoff moves the terminal Claude Code to the account first, then opens the terminal', () => {
  const switched: string[] = [];
  const spawned: string[] = [];
  const switcher = {
    listSessions: () => ({ sessions: [{ alias: 'work', email: 'work@x.com', name: 'Work' }] }),
    currentCodeIdentity: () => ({ email: 'home@x.com', name: 'home', accountUuid: null }),
    switchCode: (alias: string) => {
      switched.push(alias);
      return {};
    },
  } as unknown as ISwitcher;
  const result = startHandoff(switcher, 'WORK', SESSION, 'C:\\code\\app', command => {
    spawned.push(command);
    return 1;
  });
  assert.deepStrictEqual(switched, ['work']);
  assert.strictEqual(result.movedCode, true);
  assert.strictEqual(spawned.length, 1);
  assert.throws(() => startHandoff(switcher, 'work', 'not-a-session', 'C:\\code'), /no id/);
  assert.throws(() => startHandoff(switcher, 'nobody', SESSION, 'C:\\code'), /No saved session/);
});

function live(fiveUsed: number, weekUsed: number): ILiveUsage {
  const hours = (count: number) => new Date(NOW.getTime() + count * 3_600_000).toISOString();
  return {
    status: 'ok',
    fiveHour: { usedPercent: fiveUsed, resetsAt: hours(2) },
    sevenDay: { usedPercent: weekUsed, resetsAt: hours(40) },
    fetchedAt: NOW.toISOString(),
    checkedAt: NOW.toISOString(),
    error: null,
    backoffUntil: null,
  } as ILiveUsage;
}

test('the deck in a Desktop window knows its account and points at a ready window once it is out', () => {
  const sessions = [
    { alias: 'home', email: 'home@x.com', accountUuid: 'uuid-home' },
    { alias: 'work', email: 'work@x.com', accountUuid: 'uuid-work' },
  ] as ISessionListEntry[];
  assert.strictEqual(desktopSeat(sessions, { CLAUDE_CODE_ENTRYPOINT: 'claude-desktop', CLAUDE_CODE_ACCOUNT_UUID: 'uuid-work' })?.alias, 'work');
  assert.strictEqual(desktopSeat(sessions, { CLAUDE_CODE_ENTRYPOINT: 'claude-desktop', CLAUDE_CODE_USER_EMAIL: 'HOME@x.com' })?.alias, 'home');
  assert.strictEqual(desktopSeat(sessions, { CLAUDE_CODE_ACCOUNT_UUID: 'uuid-work' }), null);

  const entries = sessions.map(entry => ({ alias: entry.alias, email: entry.email, active: false }));
  const auto = normalizeAutoState({});
  const calm = toRanked(entries, { home: live(40, 30), work: live(10, 10) }, auto, NOW.getTime());
  assert.strictEqual(desktopNudge(calm, 'home', () => true, auto, NOW), null);
  const out = toRanked(entries, { home: live(100, 30), work: live(10, 10) }, auto, NOW.getTime());
  assert.deepStrictEqual(desktopNudge(out, 'home', () => true, auto, NOW)?.target, 'work');
  assert.strictEqual(desktopNudge(out, 'home', () => false, auto, NOW), null);
  assert.strictEqual(desktopNudge(out, null, () => true, auto, NOW), null);
});
