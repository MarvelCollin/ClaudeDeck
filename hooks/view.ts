import type { DeckState, Live, Ranked, ScheduleBlock, Session, Win } from '../types'

export const WIDTH = 300
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const PALETTE = [
  'text{font-family:"Styrene B","Anthropic Sans",system-ui,-apple-system,"Segoe UI",sans-serif;fill:#3d3929;font-variant-numeric:tabular-nums}',
  '.serif{font-family:"Copernicus","Tiempos Headline",Georgia,"Times New Roman",serif}',
  '.muted{fill:#7a776e}',
  '.label{font-size:10px;letter-spacing:.08em;fill:#7a776e}',
  '.track{fill:#ece8de}',
  '.ok{fill:#8a9a6a}',
  '.warm{fill:#d19a3e}',
  '.hot{fill:#c4553b}',
  '.stale{fill:#c9c5bb}',
  '.accent{fill:#d97757}',
  '@media (prefers-color-scheme: dark){text{fill:#ecebe6}.muted,.label{fill:#a5a29a}.track{fill:#3a3833}.ok{fill:#9db07a}.warm{fill:#e0ae55}.hot{fill:#e07a5f}.stale{fill:#56534c}.accent{fill:#e08a6b}}',
].join('')

export function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function until(iso: string | null, nowMs: number): string | null {
  if (!iso) return null
  const ms = Date.parse(iso) - nowMs
  if (!Number.isFinite(ms) || ms <= 0) return null
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

export function level(used: number, stale: boolean): 'ok' | 'warm' | 'hot' | 'stale' {
  if (stale) return 'stale'
  if (used >= 85) return 'hot'
  if (used >= 60) return 'warm'
  return 'ok'
}

function meter(x: number, width: number, label: string, win: Win | null, stale: boolean, nowMs: number): string {
  const used = Math.min(100, Math.max(0, win?.usedPercent ?? 0))
  const fill = Math.round((width * used) / 100)
  const value = win ? `${Math.round(used)}% used` : 'no data'
  const reset = win ? until(win.resetsAt, nowMs) : null
  const sub = reset ? `resets in ${reset}` : win ? 'not started' : ''
  return [
    `<text class="label" x="${x}" y="11">${esc(label.toUpperCase())}</text>`,
    `<text x="${x + width}" y="11" text-anchor="end" font-size="12" font-weight="600">${esc(value)}</text>`,
    `<rect class="track" x="${x}" y="18" width="${width}" height="6" rx="3"/>`,
    fill > 0 ? `<rect class="${level(used, stale)}" x="${x}" y="18" width="${fill}" height="6" rx="3"/>` : '',
    sub ? `<text class="muted" x="${x}" y="38" font-size="11">${esc(sub)}</text>` : '',
  ].join('')
}

export function metersSvg(account: Ranked, live: Live | null, nowMs: number): string {
  const stale = account.status !== 'ok'
  const fiveHour = account.fiveHour ?? live?.fiveHour ?? null
  const sevenDay = account.sevenDay ?? live?.sevenDay ?? null
  const half = (WIDTH - 16) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="42" viewBox="0 0 ${WIDTH} 42"><style>${PALETTE}</style>${meter(0, half, 'Session', fiveHour, stale, nowMs)}${meter(half + 16, half, 'Week', sevenDay, stale, nowMs)}</svg>`
}

export function metersAlt(account: Ranked): string {
  const pct = (win: Win | null) => (win ? `${Math.round(win.usedPercent)} percent used` : 'no data')
  return `Session ${pct(account.fiveHour)}, week ${pct(account.sevenDay)}`
}

export function headerSvg(deck: DeckState, nameOf: (alias: string | null) => string): string {
  const name = deck.code ? nameOf(deck.code.alias) || deck.code.name : 'Not signed in'
  const auto = deck.auto.running ? 'Auto switch on' : 'Auto switch off'
  const next = deck.next ? `next ${nameOf(deck.next)}` : 'no account with room'
  const status = `${auto}  ·  ${next}`
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="62" viewBox="0 0 ${WIDTH} 62"><style>${PALETTE}</style>`,
    `<text class="label" x="0" y="12">CLAUDE CODE IS ON</text>`,
    `<text class="serif" x="0" y="36" font-size="21" font-weight="500">${esc(name)}</text>`,
    `<circle class="${deck.auto.running ? 'accent' : 'stale'}" cx="4" cy="53" r="3.5"/>`,
    `<text class="muted" x="13" y="57" font-size="11.5">${esc(status)}</text>`,
    '</svg>',
  ].join('')
}

export function headerAlt(deck: DeckState, nameOf: (alias: string | null) => string): string {
  return `Claude Code is on ${deck.code ? nameOf(deck.code.alias) || deck.code.name : 'no account'}. Auto switch is ${deck.auto.running ? 'on' : 'off'}.`
}

export const STRIP_WIDTH = 470

function mini(x: number, width: number, label: string, win: Win | null, stale: boolean): string {
  const used = Math.min(100, Math.max(0, win?.usedPercent ?? 0))
  const fill = Math.round((width * used) / 100)
  const barX = x + (label === 'SESSION' ? 50 : 36)
  return [
    `<text class="label" x="${x}" y="16">${label}</text>`,
    `<rect class="track" x="${barX}" y="9" width="${width}" height="6" rx="3"/>`,
    fill > 0 ? `<rect class="${level(used, stale)}" x="${barX}" y="9" width="${fill}" height="6" rx="3"/>` : '',
    `<text x="${barX + width + 6}" y="17" font-size="12" font-weight="600">${win ? `${Math.round(used)}%` : 'n/a'}</text>`,
  ].join('')
}

export function stripSvg(deck: DeckState, nameOf: (alias: string | null) => string): string {
  const active = deck.ranked.find(entry => entry.active) ?? null
  const name = deck.code ? nameOf(deck.code.alias) || deck.code.name : 'Not signed in'
  const short = name.length > 14 ? `${name.slice(0, 13)}…` : name
  const stale = !active || active.status !== 'ok'
  const next = deck.next ? `next ${nameOf(deck.next)}` : 'no account with room'
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${STRIP_WIDTH}" height="24" viewBox="0 0 ${STRIP_WIDTH} 24"><style>${PALETTE}</style>`,
    `<circle class="${deck.auto.running ? 'accent' : 'stale'}" cx="5" cy="12" r="4"/>`,
    `<text class="serif" x="15" y="17" font-size="13.5" font-weight="600">${esc(short)}</text>`,
    mini(120, 56, 'SESSION', active?.fiveHour ?? null, stale),
    mini(270, 44, 'WEEK', active?.sevenDay ?? null, stale),
    `<text class="muted" x="392" y="17" font-size="11.5">${esc(next.length > 14 ? `${next.slice(0, 13)}…` : next)}</text>`,
    '</svg>',
  ].join('')
}

export function stripText(deck: DeckState, nameOf: (alias: string | null) => string): string {
  const active = deck.ranked.find(entry => entry.active) ?? null
  const pct = (win: Win | null | undefined) => (win ? `${Math.round(win.usedPercent)}%` : 'n/a')
  const name = deck.code ? nameOf(deck.code.alias) || deck.code.name : 'not signed in'
  const next = deck.next ? `next ${nameOf(deck.next)}` : 'no account with room'
  return `${deck.auto.running ? 'Auto' : 'Manual'} · ${name} · session ${pct(active?.fiveHour)} · week ${pct(active?.sevenDay)} · ${next}`
}

export function reasonOf(account: Ranked, live: Live | null, nowMs: number): string {
  if (account.status === 'relogin' || live?.status === 'relogin') return 'Login expired. Sign in again to use it.'
  if (account.status === 'no-login') return 'No Claude Code login saved for this account.'
  if (account.held) return 'Held out of auto switch.'
  if (account.status === 'unchecked') return 'Usage not checked yet.'
  if (account.tier === 'live') {
    const reset = until(account.fiveHour?.resetsAt ?? null, nowMs)
    return reset ? `Session running, ends in ${reset}.` : 'Session running.'
  }
  if (account.tier === 'idle') {
    const reset = until(account.sevenDay?.resetsAt ?? null, nowMs)
    const left = Math.round(100 - (account.sevenDay?.usedPercent ?? 0))
    return reset ? `Idle. ${left}% of the week left, it resets in ${reset}.` : `Idle. ${left}% of the week left.`
  }
  return 'No usage data yet.'
}

export function sortForPane(deck: DeckState): Ranked[] {
  const preferred = deck.auto.preferredNext?.toLowerCase() ?? null
  const weight = (entry: Ranked) =>
    entry.active ? 0 : entry.alias === deck.next ? 1 : entry.alias.toLowerCase() === preferred ? 2 : entry.status === 'relogin' ? 4 : 3
  return [...deck.ranked].sort(
    (left, right) => weight(left) - weight(right) || (left.rank ?? Infinity) - (right.rank ?? Infinity) || left.alias.localeCompare(right.alias)
  )
}

export function sessionOf(deck: DeckState, alias: string): Session | null {
  return deck.sessions.find(entry => entry.alias === alias) ?? null
}

export function displayName(deck: DeckState | null, alias: string | null): string {
  if (!deck || !alias) return ''
  return sessionOf(deck, alias)?.name ?? alias
}

export function blockText(block: ScheduleBlock): string {
  return `${block.days.join(' ')} at ${block.times.join(' ')}`
}

export function parseBlock(text: string): ScheduleBlock {
  const [daysPart = '', timesPart = ''] = text.split(/\bat\b/i)
  const days = daysPart
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(token => DAYS.find(day => day.toLowerCase().startsWith(token.toLowerCase().slice(0, 3))))
  if (!days.length || days.some(day => !day)) throw new Error('Write the days like "Monday Tuesday at 09:00 14:00".')
  const times = timesPart.split(/[\s,]+/).filter(Boolean)
  if (!times.length || times.some(time => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    throw new Error('Write the times as 24 hour HH:mm, for example 09:00 14:30.')
  }
  return { days: [...new Set(days as string[])], times: [...new Set(times)] }
}
