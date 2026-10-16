import path from 'node:path';
import { readCodeAccount } from '../accounts/identity';
import { ILiveUsage, ISessionListEntry } from '../accounts/interfaces';
import { createLiveUsage, targetsFor } from '../accounts/live-usage';
import { codeAccountPath, codeCredentialsPath, sessionSlot } from '../accounts/paths';
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
