import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { ILiveUsage } from '../src/accounts/interfaces';
import { TOKEN_URL } from '../src/accounts/live-usage';
import { loadConfig } from '../src/core/config/loader';
import { readLogLines } from '../src/core/logging/run-log';
import { runClaudeOnce } from '../src/runner/run-claude';
import { IWarmDeps, IWarmRun } from '../src/runner/interfaces';
import {
  CONFIG_DIR_ENV,
  hasLiveWindow,
  skipReason,
  TEMP_PREFIX,
  warmAccounts,
  warmEnv,
  warmLogLines,
} from '../src/runner/warm-accounts';

const NOW = new Date('2026-10-16T10:00:00Z');
const LATER = new Date(NOW.getTime() + 3_600_000).toISOString();
const EARLIER = new Date(NOW.getTime() - 60_000).toISOString();

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cd-warm-'));
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value), 'utf8');
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
}

function usage(patch: Partial<ILiveUsage>): ILiveUsage {
  return {
    status: 'ok',
    fiveHour: { usedPercent: 0, resetsAt: null },
    sevenDay: { usedPercent: 20, resetsAt: LATER },
    fetchedAt: NOW.toISOString(),
    checkedAt: NOW.toISOString(),
    error: null,
    backoffUntil: null,
    ...patch,
  };
}

interface ISeen {
  configDir: string;
  credentials: Record<string, unknown>;
  account: Record<string, unknown>;
  env: NodeJS.ProcessEnv;
}

function setup(live: Record<string, ILiveUsage>, run: (seen: ISeen) => IWarmRun, patch: Partial<IWarmDeps> = {}) {
  const dir = tempDir();
  const slots = path.join(dir, 'sessions');
  const credPath = path.join(dir, 'home', '.claude', '.credentials.json');
  const tempRoot = path.join(dir, 'tmp');
  writeJson(credPath, { claudeAiOauth: { accessToken: 'active', refreshToken: 'active-r', expiresAt: NOW.getTime() + 7_200_000 } });
  for (const alias of ['one', 'two', 'three', 'four', 'five']) {
    writeJson(path.join(slots, alias, 'code.json'), {
      accessToken: `${alias}-a`,
      refreshToken: `${alias}-r`,
      expiresAt: NOW.getTime() + 7_200_000,
    });
    writeJson(path.join(slots, alias, 'account.json'), { emailAddress: `${alias}@x.com`, accountUuid: `${alias}-uuid` });
  }
  const seen: ISeen[] = [];
  const deps: IWarmDeps = {
    accounts: () => ['one', 'two', 'three', 'four', 'five'].map(alias => ({ alias, email: `${alias}@x.com` })),
    codeEmail: () => 'one@x.com',
    held: () => ['four'],
    refresh: async () => live,
    credPath,
    slotDir: alias => path.join(slots, alias),
    tempRoot,
    fetch: (async () => {
      throw new Error('no network in tests');
    }) as typeof fetch,
    now: () => NOW,
    invocation: () => ({ command: 'claude', args: ['-p', 'hi', '--model', 'haiku'] }),
    run: (_invocation, env) => {
      const configDir = env[CONFIG_DIR_ENV] as string;
      const entry = {
        configDir,
        credentials: readJson(path.join(configDir, '.credentials.json')),
        account: readJson(path.join(configDir, '.claude.json')),
        env,
      };
      seen.push(entry);
      return run(entry);
    },
    ...patch,
  };
  return { dir, slots, credPath, tempRoot, deps, seen };
}

const ok: IWarmRun = { status: 0, stdout: 'Hello!', stderr: '', error: null };

test('a live 5h window is one that resets in the future', () => {
  assert.strictEqual(hasLiveWindow(usage({ fiveHour: { usedPercent: 3, resetsAt: LATER } }), NOW), true);
  assert.strictEqual(hasLiveWindow(usage({ fiveHour: { usedPercent: 3, resetsAt: EARLIER } }), NOW), false);
  assert.strictEqual(hasLiveWindow(usage({ fiveHour: { usedPercent: 0, resetsAt: null } }), NOW), false);
  assert.strictEqual(hasLiveWindow(null, NOW), false);
});

test('held, expired, running and week capped accounts are skipped', () => {
  assert.match(skipReason(usage({}), true, NOW) ?? '', /held/);
  assert.match(skipReason(usage({ status: 'relogin' }), false, NOW) ?? '', /sign in again/);
  assert.match(skipReason(usage({ status: 'no-login' }), false, NOW) ?? '', /no saved/);
  assert.match(skipReason(usage({ fiveHour: { usedPercent: 4, resetsAt: LATER } }), false, NOW) ?? '', /already running/);
  assert.match(skipReason(usage({ sevenDay: { usedPercent: 100, resetsAt: LATER } }), false, NOW) ?? '', /weekly/);
  assert.strictEqual(skipReason(usage({}), false, NOW), null);
  assert.strictEqual(skipReason(null, false, NOW), null);
});

test('the warm env points at the temp folder and drops api keys', () => {
  const env = warmEnv({ PATH: 'p', ANTHROPIC_API_KEY: 'k', CLAUDE_CODE_OAUTH_TOKEN: 't', ANTHROPIC_AUTH_TOKEN: 'x' }, '/tmp/w');
  assert.deepStrictEqual(env, { PATH: 'p', [CONFIG_DIR_ENV]: '/tmp/w' });
});

test('only idle accounts are warmed, each from its own slot, and the active login is never touched', async () => {
  const live = {
    two: usage({}),
    three: usage({ fiveHour: { usedPercent: 12, resetsAt: LATER } }),
    four: usage({}),
    five: usage({ status: 'relogin' }),
  };
  const { dir, credPath, tempRoot, deps, seen } = setup(live, () => ok);
  try {
    const before = fs.readFileSync(credPath, 'utf8');
    const results = await warmAccounts(deps);
    assert.deepStrictEqual(
      results.map(entry => [entry.alias, entry.action]),
      [
        ['one', 'skipped'],
        ['two', 'warmed'],
        ['three', 'skipped'],
        ['four', 'skipped'],
        ['five', 'skipped'],
      ]
    );
    assert.strictEqual(seen.length, 1);
    assert.deepStrictEqual(seen[0]?.credentials, {
      claudeAiOauth: { accessToken: 'two-a', refreshToken: 'two-r', expiresAt: NOW.getTime() + 7_200_000 },
    });
    assert.deepStrictEqual(seen[0]?.account.oauthAccount, { emailAddress: 'two@x.com', accountUuid: 'two-uuid' });
    assert.strictEqual(fs.readFileSync(credPath, 'utf8'), before);
    assert.strictEqual(fs.existsSync(seen[0]?.configDir as string), false);
    assert.deepStrictEqual(fs.readdirSync(tempRoot).filter(name => name.startsWith(TEMP_PREFIX)), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a token rotated during the run is written back to the slot, an unchanged one is left alone', async () => {
  const live = { two: usage({}), three: usage({}) };
  const { dir, slots, deps } = setup(live, seen => {
    if (seen.credentials.claudeAiOauth && (seen.credentials.claudeAiOauth as { accessToken: string }).accessToken === 'two-a') {
      writeJson(path.join(seen.configDir, '.credentials.json'), {
        claudeAiOauth: { accessToken: 'two-new', refreshToken: 'two-r2', expiresAt: NOW.getTime() + 28_800_000 },
      });
    }
    return ok;
  }, { held: () => ['four', 'five'] });
  try {
    const threeBefore = fs.statSync(path.join(slots, 'three', 'code.json')).mtimeMs;
    const results = await warmAccounts(deps);
    assert.strictEqual(results.find(entry => entry.alias === 'two')?.rotated, true);
    assert.strictEqual(results.find(entry => entry.alias === 'three')?.rotated, false);
    assert.deepStrictEqual(readJson(path.join(slots, 'two', 'code.json')), {
      accessToken: 'two-new',
      refreshToken: 'two-r2',
      expiresAt: NOW.getTime() + 28_800_000,
    });
    assert.strictEqual(fs.statSync(path.join(slots, 'three', 'code.json')).mtimeMs, threeBefore);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an expired slot token is refreshed before the run and a dead one fails without running', async () => {
  const live = { two: usage({}), three: usage({}) };
  const calls: string[] = [];
  const { dir, slots, deps, seen } = setup(live, () => ok, {
    held: () => ['four', 'five'],
    fetch: (async (_input: string | URL | Request, init?: RequestInit) => {
      calls.push(String(_input));
      const body = JSON.parse(String(init?.body)) as { refresh_token: string };
      if (body.refresh_token === 'three-r') return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      return new Response(JSON.stringify({ access_token: 'two-fresh', expires_in: 28800, refresh_token: 'two-r3' }), { status: 200 });
    }) as typeof fetch,
  });
  try {
    for (const alias of ['two', 'three']) {
      writeJson(path.join(slots, alias, 'code.json'), { accessToken: `${alias}-a`, refreshToken: `${alias}-r`, expiresAt: NOW.getTime() - 1000 });
    }
    const results = await warmAccounts(deps);
    assert.deepStrictEqual(calls, [TOKEN_URL, TOKEN_URL]);
    assert.strictEqual(results.find(entry => entry.alias === 'two')?.action, 'warmed');
    assert.strictEqual(results.find(entry => entry.alias === 'two')?.rotated, true);
    assert.deepStrictEqual(results.find(entry => entry.alias === 'three'), {
      alias: 'three',
      action: 'failed',
      reason: 'login expired, sign in again',
      rotated: false,
    });
    assert.strictEqual(seen.length, 1);
    assert.strictEqual((seen[0]?.credentials.claudeAiOauth as { accessToken: string }).accessToken, 'two-fresh');
    assert.strictEqual(readJson(path.join(slots, 'two', 'code.json')).refreshToken, 'two-r3');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a failed claude run reports its last error line and still cleans up', async () => {
  const { dir, tempRoot, deps } = setup({ two: usage({}) }, () => ({ status: 1, stdout: '', stderr: 'boom\nInvalid API key\n', error: null }), {
    held: () => ['three', 'four', 'five'],
  });
  try {
    const results = await warmAccounts(deps);
    assert.deepStrictEqual(results.find(entry => entry.alias === 'two'), {
      alias: 'two',
      action: 'failed',
      reason: 'Invalid API key',
      rotated: false,
    });
    assert.deepStrictEqual(fs.readdirSync(tempRoot), []);
    const lines = warmLogLines(results);
    assert.strictEqual(lines[lines.length - 1], 'warm done: 0 warmed, 1 failed, 4 skipped');
    assert.ok(lines.includes('warm two: failed, Invalid API key'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a scheduled run with the flag on logs every account after the main run', async () => {
  const { dir, deps } = setup({ two: usage({}) }, () => ok, { held: () => ['three', 'four', 'five'] });
  try {
    const configPath = path.join(dir, 'claudedeck.config.json');
    const config = {
      taskName: 'T',
      macLabel: 'm',
      prompt: 'hi',
      model: 'haiku',
      logFile: 'run.log',
      wakeToRun: true,
      runWhenLocked: true,
      warmAllAccounts: true,
      schedules: [{ days: ['Monday'], times: ['00:00'] }],
    };
    writeJson(configPath, config);
    assert.strictEqual(loadConfig(configPath).config.warmAllAccounts, true);
    const main: string[] = [];
    await runClaudeOnce(['--config', configPath], {
      command: (prompt, model) => ({ command: 'claude', args: ['-p', prompt, '--model', model] }),
      run: (invocation, env) => {
        main.push(`${invocation.args.join(' ')} ${env[CONFIG_DIR_ENV] ?? 'default'}`);
        return ok;
      },
      warmDeps: () => deps,
    });
    assert.deepStrictEqual(main, ['-p hi --model haiku default']);    const lines = readLogLines(path.join(dir, 'run.log'));
    assert.match(lines[0] ?? '', /\] start$/);
    assert.ok(lines.some(line => line.endsWith('warm two: warmed, started the 5h window')));
    assert.ok(lines.some(line => line.endsWith('warm done: 1 warmed, 0 failed, 4 skipped')));
    assert.match(lines[lines.length - 1] ?? '', /\] exit \d+$/);
    writeJson(configPath, { ...config, warmAllAccounts: 'yes' });
    assert.throws(() => loadConfig(configPath), /warmAllAccounts is required/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
