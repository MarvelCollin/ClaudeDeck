import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { decide, decideDesktop, nextPick, order, rankOf, toRanked } from '../src/accounts/auto-rank';
import {
  createAutoSwitch,
  launcherBin,
  launcherIsStale,
  launcherScript,
  normalizeAutoState,
  readAutoState,
  setHeld,
  setPreferredNext,
} from '../src/accounts/auto-switch';
import { IAutoState, ILiveUsage, ISwitcher } from '../src/accounts/interfaces';
import { writeJsonFile } from '../src/core/fs/json';

const NOW = new Date('2026-10-16T06:00:00Z');
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

function usage(fiveUsed: number | null, fiveReset: number | null, weekUsed: number, weekReset: number): ILiveUsage {
  return {
    status: 'ok',
    fiveHour: fiveUsed === null ? null : { usedPercent: fiveUsed, resetsAt: fiveReset === null ? null : at(fiveReset) },
    sevenDay: { usedPercent: weekUsed, resetsAt: at(weekReset) },
    fetchedAt: NOW.toISOString(),
    checkedAt: NOW.toISOString(),
    error: null,
    backoffUntil: null,
  };
}

function state(patch: Partial<IAutoState> = {}): IAutoState {
  return { ...normalizeAutoState({}), ...patch };
}

const entries = (active: string) =>
  ['one', 'two', 'three', 'four'].map(alias => ({ alias, email: `${alias}@x.com`, active: alias === active }));

const fleet: Record<string, ILiveUsage> = {
  one: usage(0, null, 48, 6.8),
  two: usage(38, 1.0, 75, 68),
  three: usage(0, null, 4, 160),
  four: usage(40, 1.7, 27, 100),
};

test('the account whose week resets soonest is spent first, with a running session or not', () => {
  const live = rankOf({ usedPercent: 90, resetsAt: at(4.9) }, { usedPercent: 60, resetsAt: at(30) }, NOW.getTime());
  const idle = rankOf(null, { usedPercent: 0, resetsAt: at(1) }, NOW.getTime());
  const unstarted = rankOf(null, { usedPercent: 0, resetsAt: null }, NOW.getTime());
  assert.strictEqual(live.tier, 'live');
  assert.strictEqual(idle.tier, 'idle');
  assert.strictEqual(Math.round(live.rank), 30);
  assert.strictEqual(Math.round(idle.rank), 1);
  assert.ok(idle.rank < live.rank);
  assert.strictEqual(unstarted.tier, 'idle');
  assert.ok(unstarted.rank > live.rank);
  assert.strictEqual(rankOf(null, null, NOW.getTime()).tier, 'unknown');
});

test('a window whose reset has passed counts as unused', () => {
  const lapsed = { one: usage(53, -2, 55, -1) };
  const [entry] = toRanked(entries('one').slice(0, 1), lapsed, state(), NOW.getTime());
  assert.strictEqual(entry.fiveHour?.usedPercent, 0);
  assert.strictEqual(entry.sevenDay?.usedPercent, 0);
  assert.strictEqual(entry.usedPercent, 0);
});

test('within the same hour a running session goes first, then the most quota left', () => {
  const tied: Record<string, ILiveUsage> = {
    one: usage(0, null, 50, 10.2),
    two: usage(20, 2, 70, 10.7),
    three: usage(0, null, 10, 10.5),
    four: usage(0, null, 0, 11.1),
  };
  const ranked = toRanked(entries('none'), tied, state(), NOW.getTime());
  assert.deepStrictEqual(order(ranked, null).map(entry => entry.alias), ['two', 'three', 'one', 'four']);
  assert.deepStrictEqual(order(ranked, 'four').map(entry => entry.alias), ['four', 'two', 'three', 'one']);
});

test('below the threshold it moves early only to a week that resets well before the active one', () => {
  const ranked = toRanked(entries('four'), fleet, state(), NOW.getTime());
  const decision = decide(ranked, state(), NOW);
  assert.strictEqual(decision.action, 'switch');
  assert.strictEqual(decision.target, 'one');
  assert.strictEqual(decision.trigger, 'expiring');
  assert.match(decision.reason, /one has 52% of its week left and it resets in 7h/);

  const calm = toRanked(entries('one'), fleet, state(), NOW.getTime());
  assert.strictEqual(decide(calm, state(), NOW).action, 'stay');
});

test('an account you moved Claude Code to yourself is kept until it nears its limit', () => {
  const ranked = toRanked(entries('four'), fleet, state(), NOW.getTime());
  const picked = state({ lastManualSwitchAt: new Date(NOW.getTime() - 30 * 60_000).toISOString() });
  const kept = decide(ranked, picked, NOW);
  assert.strictEqual(kept.action, 'stay');
  assert.match(kept.reason, /you moved Claude Code to four/);

  const old = state({ lastManualSwitchAt: new Date(NOW.getTime() - 3 * 3_600_000).toISOString() });
  assert.strictEqual(decide(ranked, old, NOW).trigger, 'expiring');

  const full = toRanked(entries('four'), { ...fleet, four: usage(97, 1.7, 27, 100) }, state(), NOW.getTime());
  assert.strictEqual(decide(full, picked, NOW).action, 'switch');
});

test('at the threshold it moves to the best account with room, and a chosen next wins', () => {
  const hot = { ...fleet, two: usage(96, 1.6, 75, 68) };
  const ranked = toRanked(entries('two'), hot, state(), NOW.getTime());
  const decision = decide(ranked, state(), NOW);
  assert.strictEqual(decision.action, 'switch');
  assert.strictEqual(decision.target, 'one');
  assert.strictEqual(decision.trigger, 'limit');

  const chosen = decide(ranked, state({ preferredNext: 'three' }), NOW);
  assert.strictEqual(chosen.target, 'three');
});

test('held accounts and accounts above the landing line are never picked', () => {
  const hot = { ...fleet, two: usage(96, 1.6, 75, 68), four: usage(88, 1.7, 27, 100) };
  const withHold = state({ held: ['one'] });
  const ranked = toRanked(entries('two'), hot, withHold, NOW.getTime());
  assert.strictEqual(nextPick(ranked, null)?.alias, 'three');
  assert.strictEqual(nextPick(ranked, 'one')?.alias, 'three');
});

test('when every account is near its limit it escapes only from a hit limit', () => {
  const full: Record<string, ILiveUsage> = {
    one: usage(97, 2, 90, 10),
    two: usage(96, 1, 90, 10),
    three: usage(92, 3, 90, 10),
    four: usage(100, 4, 90, 10),
  };
  const near = decide(toRanked(entries('two'), full, state(), NOW.getTime()), state(), NOW);
  assert.strictEqual(near.action, 'stay');
  const hit = decide(toRanked(entries('four'), full, state(), NOW.getTime()), state(), NOW);
  assert.strictEqual(hit.action, 'switch');
  assert.strictEqual(hit.target, 'three');
  assert.strictEqual(hit.trigger, 'at-limit');
});

test('a week that resets only a little sooner, or days away, is not worth a move', () => {
  const close = { ...fleet, one: usage(0, null, 48, 95) };
  assert.strictEqual(decide(toRanked(entries('four'), close, state(), NOW.getTime()), state(), NOW).action, 'stay');
  const far = { ...fleet, one: usage(0, null, 48, 60) };
  assert.strictEqual(decide(toRanked(entries('four'), far, state(), NOW.getTime()), state(), NOW).action, 'stay');
  const full = { ...fleet, one: usage(0, null, 90, 6.8) };
  assert.strictEqual(decide(toRanked(entries('four'), full, state(), NOW.getTime()), state(), NOW).action, 'stay');
});

test('a voluntary move waits out the cooldown, a limit move does not', () => {
  const recent = state({ lastSwitchAt: new Date(NOW.getTime() - 10_000).toISOString() });
  const ranked = toRanked(entries('four'), fleet, recent, NOW.getTime());
  assert.strictEqual(decide(ranked, recent, NOW).action, 'stay');
  const hot = toRanked(entries('four'), { ...fleet, four: usage(97, 1.7, 27, 100) }, recent, NOW.getTime());
  assert.strictEqual(decide(hot, recent, NOW).action, 'switch');
});

test('an unsaved or unmeasured active account is left alone', () => {
  const none = toRanked(entries('nobody'), fleet, state(), NOW.getTime());
  assert.match(decide(none, state(), NOW).reason, /not saved/);
  const blind = toRanked(entries('four'), { ...fleet, four: { ...fleet.four, status: 'relogin', fetchedAt: null } }, state(), NOW.getTime());
  assert.match(decide(blind, state(), NOW).reason, /no fresh usage/);
});

test('next and hold are saved per account and validated', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-auto-'));
  try {
    const file = path.join(dir, 'auto.json');
    assert.strictEqual(setPreferredNext('TWO', ['one', 'two'], file).preferredNext, 'two');
    assert.throws(() => setPreferredNext('ghost', ['one'], file), /No saved account/);
    const held = setHeld('two', true, ['one', 'two'], file);
    assert.deepStrictEqual(held.held, ['two']);
    assert.strictEqual(held.preferredNext, null);
    assert.deepStrictEqual(setHeld('two', false, ['one', 'two'], file).held, []);
    assert.strictEqual(readAutoState(file).settings.threshold, 95);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a tick switches Claude Code only and clears a chosen next once it is used', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-auto-'));
  try {
    const stateFile = path.join(dir, 'auto.json');
    setPreferredNext('three', ['one', 'two', 'three', 'four'], stateFile);
    const switched: string[] = [];
    const switcher = {
      listSessions: () => ({ sessions: entries('two').map(entry => ({ alias: entry.alias, email: entry.email })) }),
      currentCodeIdentity: () => ({ email: 'two@x.com', name: 'two', accountUuid: null }),
      switchCode: (alias: string) => {
        switched.push(alias);
        return { alias, email: `${alias}@x.com`, name: alias, install: 'code', previous: 'two', accountRestored: true };
      },
    } as unknown as ISwitcher;
    const hot = { ...fleet, two: usage(97, 1.6, 75, 68) };
    const lines: string[] = [];
    const auto = createAutoSwitch({
      switcher,
      refresh: async targets => Object.fromEntries(targets.map(target => [target.alias.toLowerCase(), hot[target.alias] as ILiveUsage])),
      stateFile,
      credPath: '',
      slotFile: alias => alias,
      now: () => NOW,
      log: line => lines.push(line),
    });

    const result = await auto.tick();
    assert.deepStrictEqual(switched, ['three']);
    assert.ok(result.switched);
    assert.strictEqual(result.accounts.find(entry => entry.active)?.alias, 'three');
    const saved = readAutoState(stateFile);
    assert.strictEqual(saved.preferredNext, null);
    assert.strictEqual(saved.lastSwitchAt, NOW.toISOString());
    assert.match(lines[0] ?? '', /two -> three/);

    const dry = await auto.tick({ dryRun: true });
    assert.strictEqual(switched.length, 1);
    assert.strictEqual(dry.switched, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Claude Desktop moves only once its account hits the limit, to an account with a saved Desktop login', () => {
  const captured = (alias: string) => alias !== 'three';
  const calm = toRanked(entries('one'), { ...fleet, two: usage(90, 1, 75, 68) }, state(), NOW.getTime());
  assert.strictEqual(decideDesktop(calm, 'two', captured, state(), NOW).action, 'stay');

  const hit = toRanked(entries('one'), { ...fleet, two: usage(100, 1, 75, 68) }, state(), NOW.getTime());
  const go = decideDesktop(hit, 'two', captured, state(), NOW);
  assert.strictEqual(go.action, 'switch');
  assert.strictEqual(go.target, 'four');

  const cooling = state({ lastDesktopSwitchAt: new Date(NOW.getTime() - 60_000).toISOString() });
  assert.strictEqual(decideDesktop(hit, 'two', captured, cooling, NOW).action, 'stay');
  assert.strictEqual(decideDesktop(hit, 'two', () => false, state(), NOW).action, 'stay');
});

test('a tick only points Claude Desktop at another window when its account is out, and never restarts it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-auto-'));
  try {
    const stateFile = path.join(dir, 'auto.json');
    const switcher = {
      listSessions: () => ({
        sessions: entries('one').map(entry => ({ alias: entry.alias, email: entry.email, active: entry.alias === 'two', desktopCaptured: true })),
      }),
      currentCodeIdentity: () => ({ email: 'one@x.com', name: 'one', accountUuid: null }),
      switchCode: () => assert.fail('Claude Code has room'),
    } as unknown as ISwitcher;
    const out = { ...fleet, one: usage(10, 1, 20, 100), two: usage(100, 1.6, 75, 68) };
    const auto = createAutoSwitch({
      switcher,
      refresh: async targets => Object.fromEntries(targets.map(target => [target.alias.toLowerCase(), out[target.alias as keyof typeof out] as ILiveUsage])),
      stateFile,
      credPath: '',
      slotFile: alias => alias,
      now: () => NOW,
      log: () => undefined,
    });
    const result = await auto.tick();
    assert.strictEqual(result.desktopDecision.action, 'switch');
    assert.notStrictEqual(result.desktopDecision.target, 'two');
    assert.match(result.desktopDecision.reason, /ready in its own window/);
    assert.strictEqual(readAutoState(stateFile).lastDesktopSwitchAt, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a launcher left on an older or removed copy of ClaudeDeck is stale, a newer or equal one is kept', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-launch-'));
  try {
    const copy = (version: string) => {
      const root = path.join(dir, version);
      writeJsonFile(path.join(root, '.claude-plugin', 'plugin.json'), { version });
      fs.mkdirSync(path.join(root, 'engine', 'bin'), { recursive: true });
      const bin = path.join(root, 'engine', 'bin', 'claudedeck.js');
      fs.writeFileSync(bin, '');
      return bin;
    };
    const old = copy('1.3.0');
    const fresh = copy('1.4.0');
    assert.strictEqual(launcherBin(launcherScript('node.exe', old)), old);
    assert.ok(launcherIsStale(launcherScript('node.exe', old), fresh));
    assert.ok(!launcherIsStale(launcherScript('node.exe', fresh), old));
    assert.ok(!launcherIsStale(launcherScript('node.exe', fresh), fresh));
    assert.ok(launcherIsStale(launcherScript('node.exe', path.join(dir, 'gone', 'claudedeck.js')), old));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the sign in launcher runs auto switch hidden', () => {
  const script = launcherScript('C:\\node\\node.exe', 'C:\\deck\\bin\\claudedeck.js');
  assert.match(script, /shell\.Run """C:\\node\\node\.exe"" ""C:\\deck\\bin\\claudedeck\.js"" auto", 0, False/);
});
