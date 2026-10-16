import { IAutoDecision, IAutoState, ILiveUsage, ILiveWindow, IRankedAccount, RankTier } from './interfaces';

export const WEEKLY_TIER_OFFSET_HOURS = 10 * 365 * 24;
export const AT_LIMIT = 99.5;
export const CONSUME_MARGIN_HOURS = 0.25;
const HOUR_MS = 3_600_000;

function resetMs(window: ILiveWindow | null): number | null {
  if (!window?.resetsAt) return null;
  const ms = Date.parse(window.resetsAt);
  return Number.isFinite(ms) ? ms : null;
}

export function rankOf(fiveHour: ILiveWindow | null, sevenDay: ILiveWindow | null, nowMs: number): { tier: RankTier; rank: number } {
  const session = resetMs(fiveHour);
  if (session !== null && session > nowMs) return { tier: 'live', rank: (session - nowMs) / HOUR_MS };
  const weekly = resetMs(sevenDay);
  if (weekly !== null && weekly > nowMs) {
    const unused = Math.max(100 - (sevenDay?.usedPercent ?? 0), 0.5);
    return { tier: 'idle', rank: WEEKLY_TIER_OFFSET_HOURS + (weekly - nowMs) / HOUR_MS / unused };
  }
  return { tier: 'unknown', rank: Number.POSITIVE_INFINITY };
}

export function usedOf(fiveHour: ILiveWindow | null, sevenDay: ILiveWindow | null): number {
  return Math.max(fiveHour?.usedPercent ?? 0, sevenDay?.usedPercent ?? 0);
}

export function toRanked(
  entries: readonly { alias: string; email: string; active: boolean }[],
  live: Record<string, ILiveUsage | null | undefined>,
  state: Pick<IAutoState, 'held' | 'settings'>,
  nowMs: number
): IRankedAccount[] {
  const held = new Set(state.held.map(alias => alias.toLowerCase()));
  return entries.map(entry => {
    const usage = live[entry.alias.toLowerCase()] ?? null;
    const ok = usage?.status === 'ok' || Boolean(usage?.fetchedAt && usage.status === 'error');
    const fiveHour = ok ? usage?.fiveHour ?? null : null;
    const sevenDay = ok ? usage?.sevenDay ?? null : null;
    const usedPercent = usedOf(fiveHour, sevenDay);
    const { tier, rank } = rankOf(fiveHour, sevenDay, nowMs);
    const isHeld = held.has(entry.alias.toLowerCase());
    return {
      alias: entry.alias,
      email: entry.email,
      active: entry.active,
      held: isHeld,
      status: usage ? (ok ? 'ok' : usage.status) : 'unchecked',
      fiveHour,
      sevenDay,
      usedPercent,
      tier,
      rank,
      hasRoom: ok && !isHeld && usedPercent < state.settings.landing,
    };
  });
}

export function order(list: readonly IRankedAccount[], preferred: string | null): IRankedAccount[] {
  const wanted = preferred?.toLowerCase() ?? null;
  return [...list].sort(
    (left, right) =>
      Number(right.alias.toLowerCase() === wanted) - Number(left.alias.toLowerCase() === wanted) ||
      left.rank - right.rank ||
      left.usedPercent - right.usedPercent ||
      left.alias.localeCompare(right.alias)
  );
}

export function nextPick(list: readonly IRankedAccount[], preferred: string | null): IRankedAccount | null {
  return order(
    list.filter(entry => !entry.active && entry.hasRoom),
    preferred
  )[0] ?? null;
}

function soonestReset(entry: IRankedAccount): number {
  const resets = [resetMs(entry.fiveHour), resetMs(entry.sevenDay)].filter((value): value is number => value !== null);
  return resets.length ? Math.min(...resets) : Number.POSITIVE_INFINITY;
}

export function decide(list: readonly IRankedAccount[], state: IAutoState, now: Date): IAutoDecision {
  const at = now.toISOString();
  const active = list.find(entry => entry.active) ?? null;
  const stay = (reason: string): IAutoDecision => ({ at, action: 'stay', from: active?.alias ?? null, target: null, trigger: 'none', reason });
  const go = (target: IRankedAccount, trigger: IAutoDecision['trigger'], reason: string): IAutoDecision => ({
    at,
    action: 'switch',
    from: active?.alias ?? null,
    target: target.alias,
    trigger,
    reason,
  });

  if (!active) return stay('Claude Code is on an account ClaudeDeck has not saved');
  if (active.status !== 'ok') return stay('no fresh usage for the active account yet');

  const { threshold, cooldownSeconds } = state.settings;
  const best = nextPick(list, state.preferredNext);

  if (active.usedPercent >= threshold) {
    if (best) return go(best, 'limit', `${active.alias} is at ${Math.round(active.usedPercent)}%`);
    if (active.usedPercent >= AT_LIMIT) {
      const escape = [...list]
        .filter(entry => !entry.active && !entry.held && entry.status === 'ok' && entry.usedPercent < AT_LIMIT)
        .sort((left, right) => left.usedPercent - right.usedPercent || soonestReset(left) - soonestReset(right))[0];
      if (escape) return go(escape, 'at-limit', `${active.alias} hit its limit, ${escape.alias} still has some room`);
    }
    return stay('every account is near its limit');
  }

  const sinceSwitch = state.lastSwitchAt ? now.getTime() - Date.parse(state.lastSwitchAt) : Number.POSITIVE_INFINITY;
  if (sinceSwitch < cooldownSeconds * 1000) return stay('just switched, waiting out the cooldown');

  if (active.tier === 'live') {
    const sooner = order(
      list.filter(entry => !entry.active && entry.hasRoom && entry.tier === 'live' && entry.rank < active.rank - CONSUME_MARGIN_HOURS),
      state.preferredNext
    )[0];
    if (sooner) return go(sooner, 'consume', `${sooner.alias} has a session that resets sooner`);
  }
  return stay(`staying on ${active.alias}`);
}
