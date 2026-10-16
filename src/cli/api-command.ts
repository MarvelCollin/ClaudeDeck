import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { nextPick, toRanked } from '../accounts/auto-rank';
import {
  installAutoTask,
  isRunning,
  readAutoState,
  removeAutoTask,
  setHeld,
  setPreferredNext,
  updateAutoState,
} from '../accounts/auto-switch';
import { ILiveUsage } from '../accounts/interfaces';
import { cachedUsage } from '../accounts/live-usage';
import { createSwitcher } from '../accounts/switcher';
import { errorMessage } from '../core/fs/json';
import { userDataDir } from '../core/paths';
import { IScheduleDraft } from '../web/interfaces';
import { createService } from '../web/service';
import { refreshLiveUsage } from './usage-command';

type Body = Record<string, unknown>;

function aliasOf(body: Body, question: string): string {
  if (typeof body.alias !== 'string' || !body.alias) throw new Error(question);
  return body.alias;
}

function binPath(): string {
  return path.resolve(__dirname, '..', '..', 'bin', 'claudedeck.js');
}

export async function deckState(refresh: boolean) {
  const switcher = createSwitcher();
  const listing = switcher.listSessions();
  const code = switcher.currentCodeIdentity();
  const codeEmail = code?.email.toLowerCase() ?? null;
  const fresh = refresh ? await refreshLiveUsage(listing.sessions, true) : {};
  const live: Record<string, ILiveUsage | null> = {};
  for (const entry of listing.sessions) {
    live[entry.alias] = fresh[entry.alias.toLowerCase()] ?? cachedUsage(entry.alias);
  }
  const auto = readAutoState();
  const now = new Date();
  const ranked = toRanked(
    listing.sessions.map(entry => ({ alias: entry.alias, email: entry.email, active: entry.email.toLowerCase() === codeEmail })),
    Object.fromEntries(Object.entries(live).map(([alias, value]) => [alias.toLowerCase(), value])),
    auto,
    now.getTime()
  );
  return {
    now: now.toISOString(),
    code: code ? { email: code.email, name: code.name, alias: ranked.find(entry => entry.active)?.alias ?? null } : null,
    desktop: listing.current ? { email: listing.current.email, name: listing.current.name } : null,
    desktopRunning: listing.running,
    shareSession: listing.shareSession,
    sessions: listing.sessions.map(entry => ({
      alias: entry.alias,
      email: entry.email,
      name: entry.name,
      desktopActive: entry.active,
      desktopCaptured: entry.desktopCaptured,
      windowOpen: entry.instance.running,
      desktopUsage: entry.usage,
    })),
    live,
    ranked,
    next: nextPick(ranked, auto.preferredNext)?.alias ?? null,
    auto: {
      running: isRunning(auto, now),
      settings: auto.settings,
      preferredNext: auto.preferredNext,
      held: auto.held,
      lastDecision: auto.lastDecision,
      lastSwitchAt: auto.lastSwitchAt,
    },
  };
}

function knownAliases(): string[] {
  return createSwitcher().listSessions().sessions.map(entry => entry.alias);
}

function startAuto(): { started: boolean } {
  if (isRunning(readAutoState(), new Date())) return { started: false };
  const child = spawn(process.execPath, [binPath(), 'auto'], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return { started: true };
}

export async function runApi(route: string, body: Body = {}): Promise<unknown> {
  switch (route) {
    case 'state':
      return deckState(body.refresh === true);
    case 'schedule':
      return createService().scheduleState();
    case 'schedule/save':
      return createService().saveSchedule(body as IScheduleDraft);
    case 'schedule/start':
      return createService().startBackground();
    case 'schedule/stop':
      return createService().stopBackground();
    case 'schedule/run':
      return createService().runNow();
    case 'schedule/log':
      return createService().readLog(typeof body.limit === 'number' ? body.limit : 200);
    case 'accounts/save':
      return createSwitcher().sync({
        install: typeof body.install === 'string' ? body.install : undefined,
        codeOnly: body.codeOnly === true,
      });
    case 'accounts/switch':
      return body.code === true
        ? createSwitcher().switchCode(aliasOf(body, 'Which account should Claude Code use?'))
        : createSwitcher().switchTo(aliasOf(body, 'Which account should I switch to?'));
    case 'accounts/forget':
      return createSwitcher().forget(aliasOf(body, 'Which account should I forget?'));
    case 'accounts/open':
      return createSwitcher().openAccount(aliasOf(body, 'Which account should I open?'), { fresh: body.fresh === true });
    case 'accounts/close':
      return createSwitcher().closeAccount(aliasOf(body, 'Which account should I close?'));
    case 'accounts/sharing':
      if (typeof body.enabled !== 'boolean') throw new Error('Should shared history be on or off?');
      return createSwitcher().setSharing(body.enabled);
    case 'auto/next':
      return setPreferredNext(typeof body.alias === 'string' && body.alias ? body.alias : null, knownAliases());
    case 'auto/hold':
      return setHeld(aliasOf(body, 'Which account?'), body.hold !== false, knownAliases());
    case 'auto/settings':
      return updateAutoState(state => ({
        ...state,
        settings: {
          ...state.settings,
          ...Object.fromEntries(
            ['threshold', 'landing', 'cooldownSeconds', 'intervalSeconds']
              .filter(key => typeof body[key] === 'number')
              .map(key => [key, body[key]])
          ),
        },
      }));
    case 'auto/start':
      return startAuto();
    case 'auto/install':
      return { script: installAutoTask(userDataDir(), binPath()) };
    case 'auto/remove':
      return { removed: removeAutoTask() };
    default:
      throw new Error(`Unknown api route "${route}".`);
  }
}

function readStdin(): string {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

export async function runApiCommand(argv: string[]): Promise<void> {
  const [, route = 'state', raw] = argv;
  try {
    const text = raw === '-' ? readStdin() : raw ?? '';
    const body = text.trim() ? (JSON.parse(text) as Body) : {};
    const data = await runApi(route, body);
    process.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: errorMessage(error) })}\n`);
  }
}
