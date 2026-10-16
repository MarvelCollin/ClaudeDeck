import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import type { DeckState } from '../types'
import { blockText, level, parseBlock, reasonOf, sortForPane, stripSvg, stripText, until } from './view'

const NOW = '2026-10-16T07:00:00.000Z'
const NOW_MS = Date.parse(NOW)
const at = (hours: number) => new Date(NOW_MS + hours * 3_600_000).toISOString()
const win = (used: number, reset: number | null) => ({ usedPercent: used, resetsAt: reset === null ? null : at(reset) })

const ranked = (alias: string, patch: Record<string, unknown>) => ({
  alias,
  email: `${alias}@x.com`,
  active: false,
  held: false,
  status: 'ok',
  fiveHour: win(0, null),
  sevenDay: win(20, 100),
  usedPercent: 20,
  tier: 'idle',
  rank: 90000,
  hasRoom: true,
  ...patch,
})

const DECK: DeckState = {
  now: NOW,
  code: { email: 'four@x.com', name: 'Four', alias: 'four' },
  desktop: { email: 'two@x.com', name: 'Two' },
  desktopRunning: true,
  shareSession: true,
  sessions: ['one', 'two', 'three', 'four'].map(alias => ({
    alias,
    email: `${alias}@x.com`,
    name: alias[0]!.toUpperCase() + alias.slice(1),
    desktopActive: alias === 'two',
    desktopCaptured: true,
    windowOpen: false,
  })),
  live: {},
  ranked: [
    ranked('one', { sevenDay: win(48, 6.8), usedPercent: 48, rank: 87600.1 }),
    ranked('two', { fiveHour: win(38, 1), sevenDay: win(75, 68), usedPercent: 75, tier: 'live', rank: 1 }),
    ranked('three', { status: 'relogin', fiveHour: null, sevenDay: null, usedPercent: 0, tier: 'unknown', rank: null, hasRoom: false }),
    ranked('four', { active: true, fiveHour: win(40, 1.7), sevenDay: win(27, 100), usedPercent: 40, tier: 'live', rank: 1.7 }),
  ] as DeckState['ranked'],
  next: 'two',
  auto: {
    running: true,
    settings: { threshold: 95, landing: 85, cooldownSeconds: 60, intervalSeconds: 20 },
    preferredNext: null,
    held: [],
    lastDecision: { at: NOW, action: 'stay', target: null, reason: 'staying on four' },
    lastSwitchAt: null,
  },
}

const PANE = {
  title: 'ClaudeDeck',
  isFocused: false,
  bodyColumns: 46,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 80 },
  view: {},
}
const SCHEDULE = {
  summaryText: 'Monday at 00:00',
  installed: true,
  enabled: true,
  running: false,
  lastRun: '-',
  nextRun: '-',
  prompt: 'hi',
  wakeToRun: true,
  runWhenLocked: true,
  warmAllAccounts: false,
  schedules: [{ days: ['Monday'], times: ['00:00'] }],
  counts: { runs: 0, success: 0, failed: 0, incomplete: 0 },
}
const CMD = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 100 } }

function fakeDeck(on: On, calls: { route: string; body: unknown }[]) {
  on('process.run', (_, e) => {
    const route = e.argv[3] ?? ''
    const body = e.init?.stdin ? JSON.parse(e.init.stdin) : {}
    calls.push({ route, body })
    const data = route === 'state' ? DECK : route.startsWith('schedule') ? SCHEDULE : { ok: true }
    return { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, data }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('clock.now', () => ({ value: NOW_MS }))
}

test('times read in minutes, hours and days, and levels follow usage', () => {
  expect(until(at(0.5), NOW_MS)).toBe('30m')
  expect(until(at(1.6), NOW_MS)).toBe('1h 36m')
  expect(until(at(50), NOW_MS)).toBe('2d 2h')
  expect(until(at(-1), NOW_MS)).toBe(null)
  expect(level(30, false)).toBe('ok')
  expect(level(70, false)).toBe('warm')
  expect(level(90, false)).toBe('hot')
  expect(level(90, true)).toBe('stale')
})

test('schedule times round trip through the text form and reject bad input', () => {
  const block = parseBlock('mon wednesday at 09:00 14:30')
  expect(block).toEqual({ days: ['Monday', 'Wednesday'], times: ['09:00', '14:30'] })
  expect(blockText(block)).toBe('Monday Wednesday at 09:00 14:30')
  expect(() => parseBlock('someday at 09:00')).toThrow()
  expect(() => parseBlock('Monday at 9am')).toThrow()
})

test('the pane lists the active account first, then the next pick, and explains each one', () => {
  const order = sortForPane(DECK).map(entry => entry.alias)
  expect(order[0]).toBe('four')
  expect(order[1]).toBe('two')
  expect(order[order.length - 1]).toBe('three')
  expect(reasonOf(DECK.ranked[2]!, null, NOW_MS)).toMatch(/Sign in again/)
  expect(reasonOf(DECK.ranked[1]!, null, NOW_MS)).toBe('Session running, ends in 1h 0m.')
})

test('every account gets a card with the right actions on desktop and terminal', async ($, on) => {
  fakeDeck(on, [])
  await $.command.run({ command: 'deck', args: 'refresh', ...CMD })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'claudedeck', surface, component: 'Pane', requestId: 'claudedeck', props: PANE })
    expect(await ui.find({ key: 'login-three' })).toBeDefined()
    expect(await ui.find({ key: 'use-three' })).toBeUndefined()
    expect(await ui.find({ key: 'use-two' })).toBeDefined()
    expect(await ui.find({ key: 'use-four' })).toBeUndefined()
    expect(await ui.find({ key: 'next-one' })).toBeDefined()
    expect(await ui.find({ key: 'hold-four' })).toBeUndefined()
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
    await ui.unmount()
  }
})

test('Use now moves only Claude Code and Use next saves the pick', async ($, on) => {
  const calls: { route: string; body: unknown }[] = []
  fakeDeck(on, calls)
  await $.command.run({ command: 'deck', args: 'refresh', ...CMD })
  const ui = await $.ui.mount({ plugin: 'claudedeck', surface: 'desktop', component: 'Pane', requestId: 'claudedeck', props: PANE })
  await ui.press({ key: 'use-two' })
  await ui.press({ key: 'next-one' })
  await ui.unmount()
  expect(calls.find(call => call.route === 'accounts/switch')?.body).toEqual({ alias: 'two', code: true })
  expect(calls.find(call => call.route === 'auto/next')?.body).toEqual({ alias: 'one' })
})

test('the deck command finds accounts by name and refuses unknown ones', async ($, on) => {
  const calls: { route: string; body: unknown }[] = []
  fakeDeck(on, calls)
  await $.command.run({ command: 'deck', args: 'refresh', ...CMD })
  const picked = await $.command.run({ command: 'deck', args: 'next One', ...CMD })
  expect(picked.text ?? '').toBe('One goes next')
  expect(calls.find(call => call.route === 'auto/next')?.body).toEqual({ alias: 'one' })
  const missing = await $.command.run({ command: 'deck', args: 'use nobody', ...CMD })
  expect(missing.text ?? '').toMatch(/No saved account/)
})

test('the Background runs tab turns warming every account on', async ($, on) => {
  const calls: { route: string; body: unknown }[] = []
  fakeDeck(on, calls)
  await $.command.run({ command: 'deck', args: 'refresh', ...CMD })
  const ui = await $.ui.mount({ plugin: 'claudedeck', surface: 'desktop', component: 'Pane', requestId: 'claudedeck', props: PANE })
  await ui.press({ key: 'tab-schedule' })
  await ui.press({ key: 'warm-all' })
  await ui.unmount()
  expect(calls.find(call => call.route === 'schedule/save')?.body).toEqual({ warmAllAccounts: true })
})

const BAND = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} }

test('the strip above the prompt sums up the active account in one line', () => {
  const text = stripText(DECK, alias => DECK.sessions.find(entry => entry.alias === alias)?.name ?? '')
  expect(text).toBe('Auto · Four · session 40% · week 27% · next Two')
  const svg = stripSvg(DECK, alias => DECK.sessions.find(entry => entry.alias === alias)?.name ?? '')
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg).toContain('next Two')
})

test('the strip is always there and its button opens the sidebar', async ($, on) => {
  const opened: string[] = []
  fakeDeck(on, [])
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  await $.command.run({ command: 'deck', args: 'refresh', ...CMD })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'claudedeck', surface, component: 'AbovePrompt', props: BAND })
    expect((await ui.find({ key: 'deck-toggle' }))?.props?.label).toBe('Open')
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
    else expect(await ui.find({ type: 'Text', text: /session 40%/ })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'claudedeck', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'deck-toggle' })
  expect(opened).toEqual(['claudedeck'])
  expect((await ui.find({ key: 'deck-toggle' }))?.props?.label).toBe('Close')
  await ui.unmount()
})
