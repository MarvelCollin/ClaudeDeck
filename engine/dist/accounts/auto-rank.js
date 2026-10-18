"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOT_STARTED_RANK = exports.DESKTOP_COOLDOWN_MS = exports.EXPIRY_GAP_HOURS = exports.EXPIRING_HOURS = exports.AT_LIMIT = void 0;
exports.weekHoursLeft = weekHoursLeft;
exports.rankOf = rankOf;
exports.usedOf = usedOf;
exports.toRanked = toRanked;
exports.order = order;
exports.nextPick = nextPick;
exports.hoursText = hoursText;
exports.expiringPick = expiringPick;
exports.decide = decide;
exports.decideDesktop = decideDesktop;
exports.AT_LIMIT = 99.5;
exports.EXPIRING_HOURS = 48;
exports.EXPIRY_GAP_HOURS = 12;
exports.DESKTOP_COOLDOWN_MS = 5 * 60 * 1000;
exports.NOT_STARTED_RANK = Number.MAX_SAFE_INTEGER;
const HOUR_MS = 3_600_000;
function resetMs(window) {
    if (!window?.resetsAt)
        return null;
    const ms = Date.parse(window.resetsAt);
    return Number.isFinite(ms) ? ms : null;
}
function compare(left, right) {
    if (left === right)
        return 0;
    return left < right ? -1 : 1;
}
function weekHoursLeft(sevenDay, nowMs) {
    const weekly = resetMs(sevenDay);
    return weekly !== null && weekly > nowMs ? (weekly - nowMs) / HOUR_MS : null;
}
function rankOf(fiveHour, sevenDay, nowMs) {
    const session = resetMs(fiveHour);
    const hours = weekHoursLeft(sevenDay, nowMs);
    if (session !== null && session > nowMs)
        return { tier: 'live', rank: hours ?? exports.NOT_STARTED_RANK };
    if (hours !== null || sevenDay)
        return { tier: 'idle', rank: hours ?? exports.NOT_STARTED_RANK };
    return { tier: 'unknown', rank: Number.POSITIVE_INFINITY };
}
function current(window, nowMs) {
    const reset = resetMs(window);
    return window && reset !== null && reset <= nowMs ? { ...window, usedPercent: 0 } : window;
}
function usedOf(fiveHour, sevenDay) {
    return Math.max(fiveHour?.usedPercent ?? 0, sevenDay?.usedPercent ?? 0);
}
function toRanked(entries, live, state, nowMs) {
    const held = new Set(state.held.map(alias => alias.toLowerCase()));
    return entries.map(entry => {
        const usage = live[entry.alias.toLowerCase()] ?? null;
        const ok = usage?.status === 'ok' || Boolean(usage?.fetchedAt && usage.status === 'error');
        const fiveHour = ok ? current(usage?.fiveHour ?? null, nowMs) : null;
        const sevenDay = ok ? current(usage?.sevenDay ?? null, nowMs) : null;
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
function weekLeft(entry) {
    return 100 - (entry.sevenDay?.usedPercent ?? 0);
}
function order(list, preferred) {
    const wanted = preferred?.toLowerCase() ?? null;
    return [...list].sort((left, right) => Number(right.alias.toLowerCase() === wanted) - Number(left.alias.toLowerCase() === wanted) ||
        compare(Math.floor(left.rank), Math.floor(right.rank)) ||
        Number(right.tier === 'live') - Number(left.tier === 'live') ||
        compare(weekLeft(right), weekLeft(left)) ||
        compare(left.usedPercent, right.usedPercent) ||
        left.alias.localeCompare(right.alias));
}
function nextPick(list, preferred) {
    return order(list.filter(entry => !entry.active && entry.hasRoom), preferred)[0] ?? null;
}
function soonestReset(entry) {
    const resets = [resetMs(entry.fiveHour), resetMs(entry.sevenDay)].filter((value) => value !== null);
    return resets.length ? Math.min(...resets) : Number.POSITIVE_INFINITY;
}
function hoursText(hours) {
    if (hours < 1)
        return `${Math.max(1, Math.round(hours * 60))}m`;
    if (hours < 48)
        return `${Math.round(hours)}h`;
    return `${Math.round(hours / 24)}d`;
}
function expiringPick(list, active, preferred) {
    return order(list.filter(entry => !entry.active &&
        entry.hasRoom &&
        entry.rank <= exports.EXPIRING_HOURS &&
        entry.rank < active.rank - exports.EXPIRY_GAP_HOURS), preferred)[0] ?? null;
}
function decide(list, state, now) {
    const at = now.toISOString();
    const active = list.find(entry => entry.active) ?? null;
    const stay = (reason) => ({ at, action: 'stay', from: active?.alias ?? null, target: null, trigger: 'none', reason });
    const go = (target, trigger, reason) => ({
        at,
        action: 'switch',
        from: active?.alias ?? null,
        target: target.alias,
        trigger,
        reason,
    });
    if (!active)
        return stay('Claude Code is on an account ClaudeDeck has not saved');
    if (active.status !== 'ok')
        return stay('no fresh usage for the active account yet');
    const { threshold, cooldownSeconds } = state.settings;
    const best = nextPick(list, state.preferredNext);
    if (active.usedPercent >= threshold) {
        if (best)
            return go(best, 'limit', `${active.alias} is at ${Math.round(active.usedPercent)}%`);
        if (active.usedPercent >= exports.AT_LIMIT) {
            const escape = [...list]
                .filter(entry => !entry.active && !entry.held && entry.status === 'ok' && entry.usedPercent < exports.AT_LIMIT)
                .sort((left, right) => left.usedPercent - right.usedPercent || soonestReset(left) - soonestReset(right))[0];
            if (escape)
                return go(escape, 'at-limit', `${active.alias} hit its limit, ${escape.alias} still has some room`);
        }
        return stay('every account is near its limit');
    }
    const sinceSwitch = state.lastSwitchAt ? now.getTime() - Date.parse(state.lastSwitchAt) : Number.POSITIVE_INFINITY;
    if (sinceSwitch < cooldownSeconds * 1000)
        return stay('just switched, waiting out the cooldown');
    const expiring = expiringPick(list, active, state.preferredNext);
    if (expiring) {
        return go(expiring, 'expiring', `${expiring.alias} has ${Math.round(weekLeft(expiring))}% of its week left and it resets in ${hoursText(expiring.rank)}, so it is spent before that quota is lost`);
    }
    return stay(`staying on ${active.alias}`);
}
function decideDesktop(list, desktopAlias, canDesktop, state, now) {
    const at = now.toISOString();
    const current = list.find(entry => entry.alias === desktopAlias) ?? null;
    const stay = (reason) => ({ at, action: 'stay', from: desktopAlias, target: null, trigger: 'none', reason });
    if (!current)
        return stay('Claude Desktop is on an account ClaudeDeck has not saved');
    if (current.status !== 'ok')
        return stay('no fresh usage for the Claude Desktop account yet');
    if (current.usedPercent < exports.AT_LIMIT)
        return stay(`Claude Desktop stays on ${current.alias} until it hits its limit`);
    const since = state.lastDesktopSwitchAt ? now.getTime() - Date.parse(state.lastDesktopSwitchAt) : Number.POSITIVE_INFINITY;
    if (since < exports.DESKTOP_COOLDOWN_MS)
        return stay('just moved Claude Desktop, waiting out the cooldown');
    const ready = list.filter(entry => entry.alias !== current.alias && entry.hasRoom && canDesktop(entry.alias));
    const target = order(ready.filter(entry => !entry.active), state.preferredNext)[0] ?? order(ready, state.preferredNext)[0];
    if (!target)
        return stay(`${current.alias} hit its limit and no other account has a saved Desktop login with room`);
    return { at, action: 'switch', from: current.alias, target: target.alias, trigger: 'at-limit', reason: `${current.alias} hit its limit in Claude Desktop, ${target.alias} is ready in its own window` };
}
