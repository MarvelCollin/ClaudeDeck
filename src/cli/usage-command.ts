import path from 'node:path';
import { readCodeAccount } from '../accounts/identity';
import { ILiveUsage, ILiveWindow, ISessionListEntry } from '../accounts/interfaces';
import { cachedUsage, createLiveUsage, targetsFor } from '../accounts/live-usage';
import { codeAccountPath, codeCredentialsPath, sessionSlot } from '../accounts/paths';
import { createSwitcher } from '../accounts/switcher';
import { ICodeSlotDeps } from './interfaces';

export function codeSlotFile(alias: string): string {
  return path.join(sessionSlot(alias), 'code.json');
}

export function defaultCodeSlotDeps(): ICodeSlotDeps {
  return {
    codeEmail: () => readCodeAccount(codeAccountPath())?.email ?? null,
    credPath: codeCredentialsPath(),
    slotFile: codeSlotFile,
  };
}

export async function refreshLiveUsage(
  sessions: readonly ISessionListEntry[],
  force = false,
  deps: ICodeSlotDeps = defaultCodeSlotDeps()
): Promise<Record<string, ILiveUsage>> {
  const targets = targetsFor(sessions, deps.codeEmail(), deps.credPath, deps.slotFile);
  return createLiveUsage().refreshAll(targets, force);
}

export function windowText(label: string, window: ILiveWindow | null, now = Date.now()): string {
  if (!window) return `${label} n/a`;
  const left = Math.round(100 - window.usedPercent);
  if (!window.resetsAt) return `${label} ${left}% left`;
  const minutes = Math.max(0, Math.round((Date.parse(window.resetsAt) - now) / 60000));
  const until = minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
  return `${label} ${left}% left, resets in ${until}`;
}

export function liveText(usage: ILiveUsage | null): string {
  if (!usage) return 'not checked yet';
  if (usage.status === 'relogin') return 'login expired, sign in again';
  if (usage.status === 'no-login') return 'no Claude Code login saved';
  const parts = [windowText('5h', usage.fiveHour), windowText('week', usage.sevenDay)].join('  ');
  return usage.status === 'ok' || usage.fetchedAt ? parts : `${parts}  (${usage.error ?? 'not available'})`;
}

export async function listJson(refresh: boolean): Promise<string> {
  const listing = createSwitcher().listSessions();
  const live = refresh ? await refreshLiveUsage(listing.sessions) : {};
  const codeEmail = defaultCodeSlotDeps().codeEmail()?.toLowerCase() ?? null;
  const accounts = listing.sessions.map(entry => ({
    alias: entry.alias,
    email: entry.email,
    name: entry.name,
    codeActive: entry.email.toLowerCase() === codeEmail,
    desktopActive: entry.active,
    desktopCaptured: entry.desktopCaptured,
    windowOpen: entry.instance.running,
    live: live[entry.alias.toLowerCase()] ?? cachedUsage(entry.alias),
    desktopUsage: entry.usage,
  }));
  const code = accounts.find(entry => entry.codeActive)?.alias ?? null;
  const desktop = accounts.find(entry => entry.desktopActive)?.alias ?? null;
  return JSON.stringify({ version: 1, codeAccount: code, desktopAccount: desktop, accounts }, null, 2);
}

export async function runUsageCommand(force: boolean): Promise<void> {
  const listing = createSwitcher().listSessions();
  if (!listing.sessions.length) {
    console.log('No saved accounts yet. Run "claudedeck save" to keep the current one.');
    return;
  }
  const live = await refreshLiveUsage(listing.sessions, force);
  const codeEmail = defaultCodeSlotDeps().codeEmail()?.toLowerCase() ?? null;
  const width = Math.max(...listing.sessions.map(entry => entry.alias.length), 5);
  for (const entry of listing.sessions) {
    const marker = entry.email.toLowerCase() === codeEmail ? '* ' : '  ';
    const usage = live[entry.alias.toLowerCase()] ?? cachedUsage(entry.alias);
    console.log(`${marker}${entry.alias.padEnd(width)}  ${liveText(usage)}`);
  }
}
