import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import type { DeckState } from '../types'
import { blockText, cardWidth, headerSvg, level, metersSvg, paneWidth, parseBlock, reasonOf, seatOf, sortForPane, stripSvg, stripText, until } from './view'

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
  desktopHome: true,
  desktopJob: null,
  sessions: ['one', 'two', 'three', 'four'].map(alias => ({
    alias,
    email: `${alias}@x.com`,
    name: alias[0]!.toUpperCase() + alias.slice(1),
    desktopActive: alias === 'two',
    desktopCaptured: true,
    windowOpen: alias === 'two' || alias === 'four',
    windowReady: alias !== 'three',
  })),
  live: {},
  ranked: [
    ranked('one', { sevenDay: win(48, 6.8), usedPercent: 48, rank: 87600.1 }),
    ranked('two', { fiveHour: win(38, 1), sevenDay: win(75, 68), usedPercent: 75, tier: 'live', rank: 1 }),
    ranked('three', { status: 'relogin', fiveHour: null, sevenDay: null, usedPercent: 0, tier: 'unknown', rank: null, hasRoom: false }),
    ranked('four', { active: true, fiveHour: win(40, 1.7), sevenDay: win(27, 100), usedPercent: 40, tier: 'live', rank: 1.7 }),
  ] as DeckState['ranked'],
  next: 'two',
  desktopNudge: null,
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

function fakeDeck(on: On, calls: { route: string; body: unknown }[], deck: DeckState = DECK) {
  on('process.run', (_, e) => {
    const route = e.argv[3] ?? ''
    const body = e.init?.stdin ? JSON.parse(e.init.stdin) : {}
    calls.push({ route, body })
    const data = route === 'state' ? deck : route.startsWith('schedule') ? SCHEDULE : { ok: true }
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
  expect(reasonOf(DECK.ranked[1]!, null, NOW_MS)).toBe('Session running, ends in 1h 0m. 25% of the week left, lost if unused in 2d 20h.')
  expect(reasonOf(DECK.ranked[0]!, null, NOW_MS)).toBe('Idle. 52% of the week left, lost if unused in 6h 48m.')
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

test('Sign in again asks the engine to open the sign in window', async ($, on) => {
  const calls: { route: string; body: unknown }[] = []
  fakeDeck(on, calls)
  await $.command.run({ command: 'deck', args: 'refresh', ...CMD })
  const ui = await $.ui.mount({ plugin: 'claudedeck', surface: 'desktop', component: 'Pane', requestId: 'claudedeck', props: PANE })
  await ui.press({ key: 'login-three' })
  expect(calls.find(call => call.route === 'accounts/relogin')?.body).toEqual({ email: 'three@x.com' })
  await ui.unmount()
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

test('inside Claude Desktop the deck shows the account Desktop spends, not the terminal one', () => {
  const nameOf = (alias: string | null) => DECK.sessions.find(entry => entry.alias === alias)?.name ?? ''
  expect(seatOf(DECK, 'desktop')).toBe('desktop')
  expect(seatOf(DECK, 'terminal')).toBe('code')
  expect(seatOf({ ...DECK, desktop: null }, 'desktop')).toBe('code')
  expect(stripText(DECK, nameOf, 'desktop')).toContain('Two · session 38%')
  expect(stripText(DECK, nameOf, 'code')).toContain('Four · session 40%')
  expect(headerSvg(DECK, nameOf, 400, 'desktop')).toContain('CLAUDE DESKTOP IS ON')
  expect(sortForPane(DECK, 'desktop')[0]?.alias).toBe('two')
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

test('the strip shows before the first read and draws the last known deck at once', async ($, on) => {
  on('process.run', () => new Promise(() => {}))
  on('ui.panes', () => ({ value: [] }))
  const empty = await $.ui.mount({ plugin: 'claudedeck', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(await empty.find({ type: 'Text', text: /reading your accounts/ })).toBeDefined()
  expect((await empty.find({ key: 'deck-toggle' }))?.props?.label).toBe('Open')
  await empty.unmount()
})

test('a later session starts from the stored deck', async ($, on) => {
  mock.store(on, { deck: DECK })
  on('process.run', () => new Promise(() => {}))
  on('ui.panes', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: 'C:/deck', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'claudedeck', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ type: 'Text', text: /session 40%/ })).toBeDefined()
  await ui.unmount()
})

test('Open in Desktop starts or shows the account window at once, without closing this one', async ($, on) => {
  const calls: { route: string; body: unknown }[] = []
  fakeDeck(on, calls)
  await $.command.run({ command: 'deck', args: 'refresh', ...CMD })
  const ui = await $.ui.mount({ plugin: 'claudedeck', surface: 'desktop', component: 'Pane', requestId: 'claudedeck', props: PANE })
  expect(await ui.find({ key: 'desktop-two' })).toBeUndefined()
  expect(await ui.find({ key: 'desktop-three' })).toBeUndefined()
  expect((await ui.find({ key: 'desktop-one' }))?.props?.label).toBe('Open in Desktop')
  expect((await ui.find({ key: 'desktop-four' }))?.props?.label).toBe('Show Desktop window')
  await ui.press({ key: 'desktop-one' })
  expect(calls.find(call => call.route === 'accounts/window')?.body).toEqual({ alias: 'one' })
  expect(calls.find(call => call.route === 'accounts/switch')).toBeUndefined()
  await ui.unmount()
})

test('Continue in terminal hands this session to the account, only inside Claude Desktop', async ($, on) => {
  const calls: { route: string; body: unknown }[] = []
  fakeDeck(on, calls)
  on('session.id', () => ({ value: '0b027735-10d8-4834-855a-c5955e955568' }))
  on('session.cwd', () => ({ value: 'C:/work/app' }))
  await $.command.run({ command: 'deck', args: 'refresh', ...CMD })
  const terminal = await $.ui.mount({ plugin: 'claudedeck', surface: 'terminal', component: 'Pane', requestId: 'claudedeck', props: PANE })
  expect(await terminal.find({ key: 'handoff-one' })).toBeUndefined()
  await terminal.unmount()
  const ui = await $.ui.mount({ plugin: 'claudedeck', surface: 'desktop', component: 'Pane', requestId: 'claudedeck', props: PANE })
  expect(await ui.find({ key: 'handoff-two' })).toBeUndefined()
  expect(await ui.find({ key: 'handoff-three' })).toBeUndefined()
  await ui.press({ key: 'handoff-one' })
  expect(calls.find(call => call.route === 'session/handoff')?.body).toEqual({
    alias: 'one',
    sessionId: '0b027735-10d8-4834-855a-c5955e955568',
    cwd: 'C:/work/app',
  })
  await ui.unmount()
})

test('the strip in Claude Desktop offers the next window once its account is out', async ($, on) => {
  const calls: { route: string; body: unknown }[] = []
  const out = { ...DECK, desktopNudge: { from: 'two', target: 'one', reason: 'two hit its limit in Claude Desktop' } }
  fakeDeck(on, calls, out)
  on('ui.panes', () => ({ value: [] }))
  await $.command.run({ command: 'deck', args: 'refresh', ...CMD })
  const terminal = await $.ui.mount({ plugin: 'claudedeck', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await terminal.find({ key: 'nudge-open' })).toBeUndefined()
  await terminal.unmount()
  const ui = await $.ui.mount({ plugin: 'claudedeck', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect((await ui.find({ key: 'nudge-open' }))?.props?.label).toBe('Open One')
  await ui.press({ key: 'nudge-open' })
  expect(calls.find(call => call.route === 'accounts/window')?.body).toEqual({ alias: 'one' })
  await ui.unmount()
})

test('the strip stays plain while the Desktop account has room', async ($, on) => {
  fakeDeck(on, [])
  on('ui.panes', () => ({ value: [] }))
  await $.command.run({ command: 'deck', args: 'refresh', ...CMD })
  const ui = await $.ui.mount({ plugin: 'claudedeck', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ key: 'nudge-open' })).toBeUndefined()
  await ui.unmount()
})

test('Save Desktop login is gone, the first window keeps its own login', async ($, on) => {
  fakeDeck(on, [])
  await $.command.run({ command: 'deck', args: 'refresh', ...CMD })
  const ui = await $.ui.mount({ plugin: 'claudedeck', surface: 'desktop', component: 'Pane', requestId: 'claudedeck', props: PANE })
  expect(await ui.find({ key: 'desktop-save' })).toBeUndefined()
  await ui.unmount()
})

test('a window of another account sends you to the first window to add accounts', async ($, on) => {
  fakeDeck(on, [], { ...DECK, desktopHome: false })
  await $.command.run({ command: 'deck', args: 'refresh', ...CMD })
  const ui = await $.ui.mount({ plugin: 'claudedeck', surface: 'desktop', component: 'Pane', requestId: 'claudedeck', props: PANE })
  expect(await ui.find({ key: 'desktop-add' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /first Claude Desktop window/ })).toBeDefined()
  await ui.unmount()
})

test('Add Desktop account asks first, then opens a sign in screen without signing out', async ($, on) => {
  const calls: { route: string; body: unknown }[] = []
  fakeDeck(on, calls)
  await $.command.run({ command: 'deck', args: 'refresh', ...CMD })
  const ui = await $.ui.mount({ plugin: 'claudedeck', surface: 'desktop', component: 'Pane', requestId: 'claudedeck', props: PANE })
  await ui.press({ key: 'desktop-add' })
  expect(calls.find(call => call.route === 'accounts/add-desktop')).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Save Two and open this window on a sign in screen\? Only this window closes/ })).toBeDefined()
  await ui.press({ key: 'desktop-add-yes' })
  expect(calls.find(call => call.route === 'accounts/add-desktop')?.body).toEqual({})
  await ui.unmount()
})

test('the sidebar meters grow with the sidebar width', () => {
  expect(paneWidth(30)).toBe(300)
  expect(paneWidth(84)).toBe(572)
  expect(paneWidth(200)).toBe(760)
  expect(metersSvg(DECK.ranked[0]!, null, NOW_MS, 672)).toContain('width="672"')
  expect(cardWidth(paneWidth(84))).toBeLessThan(paneWidth(84))
})
