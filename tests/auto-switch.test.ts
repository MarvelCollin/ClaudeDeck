import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { decide, nextPick, rankOf, toRanked } from '../src/accounts/auto-rank';
import {
  createAutoSwitch,
  launcherScript,
  normalizeAutoState,
  readAutoState,
  setHeld,
  setPreferredNext,
} from '../src/accounts/auto-switch';
import { IAutoState, ILiveUsage, ISwitcher } from '../src/accounts/interfaces';

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

test('a live 5h session ranks ahead of any idle account', () => {
  const live = rankOf({ usedPercent: 90, resetsAt: at(4.9) }, { usedPercent: 99, resetsAt: at(1) }, NOW.getTime());
  const idle = rankOf(null, { usedPercent: 0, resetsAt: at(1) }, NOW.getTime());
  assert.strictEqual(live.tier, 'live');
  assert.strictEqual(idle.tier, 'idle');
  assert.ok(live.rank < idle.rank);
});

test('idle accounts with the most quota about to expire rank first', () => {
  const soon = rankOf(null, { usedPercent: 48, resetsAt: at(6.8) }, NOW.getTime());
  const later = rankOf(null, { usedPercent: 26, resetsAt: at(100) }, NOW.getTime());
  const ahead = rankOf(null, { usedPercent: 74, resetsAt: at(68) }, NOW.getTime());
  assert.ok(soon.rank < later.rank);
  assert.ok(later.rank < ahead.rank);
});

test('below the threshold Claude Code stays on its account unless a sooner session can be used', () => {
  const ranked = toRanked(entries('four'), fleet, state(), NOW.getTime());
  const decision = decide(ranked, state(), NOW);
  assert.strictEqual(decision.action, 'switch');
  assert.strictEqual(decision.target, 'two');
  assert.strictEqual(decision.trigger, 'consume');

  const calm = toRanked(entries('two'), fleet, state(), NOW.getTime());
  assert.strictEqual(decide(calm, state(), NOW).action, 'stay');
});

test('at the threshold it moves to the best account with room, and a chosen next wins', () => {
  const hot = { ...fleet, two: usage(96, 1.6, 75, 68) };
  const ranked = toRanked(entries('two'), hot, state(), NOW.getTime());
  const decision = decide(ranked, state(), NOW);
  assert.strictEqual(decision.action, 'switch');
  assert.strictEqual(decision.target, 'four');
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

test('sessions that reset within the same quarter hour are not worth a move', () => {
  const close = { ...fleet, two: usage(38, 1.7 - 0.1, 75, 68) };
  const ranked = toRanked(entries('four'), close, state(), NOW.getTime());
  assert.strictEqual(decide(ranked, state(), NOW).action, 'stay');
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

test('the sign in launcher runs auto switch hidden', () => {
  const script = launcherScript('C:\\node\\node.exe', 'C:\\deck\\bin\\claudedeck.js');
  assert.match(script, /shell\.Run """C:\\node\\node\.exe"" ""C:\\deck\\bin\\claudedeck\.js"" auto", 0, False/);
});
