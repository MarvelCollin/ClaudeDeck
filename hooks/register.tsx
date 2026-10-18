import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DeckState, Ranked, Schedule, Tab } from '../types'
import {
  blockText,
  displayName,
  headerAlt,
  headerSvg,
  metersAlt,
  metersSvg,
  parseBlock,
  reasonOf,
  sessionOf,
  seatOf,
  sortForPane,
  stripSvg,
  stripText,
  cardWidth,
  paneWidth,
  until,
} from './view'

const PANE = 'claudedeck'
const POLL_MS = 20_000
const JOB_TOAST_MS = 120_000
const STORE_DECK = 'deck'

const deckA = atom({ plugin: 'claudedeck', key: 'deck' } as const, null)
const scheduleA = atom({ plugin: 'claudedeck', key: 'schedule' } as const, null)
const logA = atom({ plugin: 'claudedeck', key: 'log' } as const, [])
const tabA = atom({ plugin: 'claudedeck', key: 'tab' } as const, 'accounts')
const busyA = atom({ plugin: 'claudedeck', key: 'busy' } as const, null)
const errorA = atom({ plugin: 'claudedeck', key: 'error' } as const, null)
const confirmA = atom({ plugin: 'claudedeck', key: 'confirm' } as const, null)
const alertedA = atom({ plugin: 'claudedeck', key: 'alerted' } as const, [])
const lastCodeA = atom({ plugin: 'claudedeck', key: 'lastCode' } as const, null)
const paneOpenA = atom({ plugin: 'claudedeck', key: 'paneOpen' } as const, false)

type $ = EngineInterface

function deckBin($: $): string {
  return `${$.plugin.root.replace(/\\/g, '/')}/engine/bin/claudedeck.js`
}

async function api<T>($: $, route: string, body: Record<string, unknown> = {}): Promise<T> {
  const run = await $.process.run(['node', deckBin($), 'api', route, '-'], { stdin: JSON.stringify(body), timeoutMs: 120_000 })
  const line = run.stdout.trim().split('\n').pop() ?? ''
  let parsed: { ok: boolean; data?: T; error?: string }
  try {
    parsed = JSON.parse(line)
  } catch {
    throw new Error((run.stderr || run.stdout || 'ClaudeDeck did not answer').trim().split('\n').pop() ?? 'ClaudeDeck did not answer')
  }
  if (!parsed.ok) throw new Error(parsed.error ?? 'ClaudeDeck failed')
  return parsed.data as T
}

async function alertOnce($: $, key: string, text: string, alerted: string[], fresh: string[]) {
  fresh.push(key)
  if (!alerted.includes(key)) $.ui.toast(text, { timeoutMs: 8000 })
}

async function refresh($: $, force = false): Promise<DeckState | null> {
  try {
    const deck = await api<DeckState>($, 'state', force ? { refresh: true } : {})
    const nowMs = Date.parse(deck.now)
    const alerted = await read($, alertedA)
    const fresh: string[] = []
    const lastCode = await read($, lastCodeA)
    const codeAlias = deck.code?.alias ?? null
    if (lastCode && codeAlias && lastCode !== codeAlias) {
      $.ui.toast(`Claude Code moved to ${displayName(deck, codeAlias)}`, { timeoutMs: 8000 })
    }
    for (const entry of deck.ranked) {
      if (entry.status === 'relogin') {
        await alertOnce($, `relogin:${entry.alias}`, `${displayName(deck, entry.alias)} needs a new sign in`, alerted, fresh)
      }
    }
    const job = deck.desktopJob
    if (job?.finishedAt && nowMs - Date.parse(job.finishedAt) < JOB_TOAST_MS) {
      const name = displayName(deck, job.alias)
      const failed = { save: 'save its login', add: 'open a sign in screen', switch: 'switch' }[job.action]
      const done = {
        save: `Saved the Claude Desktop login of ${name}`,
        add: 'Claude Desktop is on a sign in screen. Sign in with the other account, then press Save Desktop login.',
        switch: `Claude Desktop is on ${name} now`,
      }[job.action]
      const text = job.ok ? done : `Claude Desktop did not ${failed}: ${job.error ?? 'unknown error'}`
      await alertOnce($, `desktop:${job.finishedAt}`, text, alerted, fresh)
    }
    const nudge = deck.desktopNudge
    if (nudge) {
      const text = `${displayName(deck, nudge.from)} is out of usage. ${displayName(deck, nudge.target)} is ready in its own Claude Desktop window.`
      await alertOnce($, `nudge:${nudge.from}:${nudge.target}`, text, alerted, fresh)
    }
    const active = deck.ranked.find(entry => entry.active)
    if (active && active.usedPercent >= 90 && !deck.next) {
      await alertOnce($, `full:${Math.floor(nowMs / 3_600_000)}`, 'Every account is close to its limit', alerted, fresh)
    }
    await update($, alertedA, () => fresh)
    await update($, lastCodeA, () => codeAlias)
    await update($, deckA, () => deck)
    await update($, errorA, () => null)
    await $.store.set(STORE_DECK, deck).catch(() => undefined)
    $.ui.status(
      active ? `Code on ${displayName(deck, active.alias)} · session ${Math.round(active.fiveHour?.usedPercent ?? 0)}%` : undefined
    )
    return deck
  } catch (err) {
    await update($, errorA, () => (err instanceof Error ? err.message : String(err)))
    return null
  }
}

async function loadSchedule($: $) {
  try {
    const schedule = await api<Schedule>($, 'schedule')
    await update($, scheduleA, () => schedule)
  } catch (err) {
    await update($, errorA, () => (err instanceof Error ? err.message : String(err)))
  }
}

async function loadLog($: $) {
  try {
    const view = await api<{ lines: string[] }>($, 'schedule/log', { limit: 80 })
    await update($, logA, () => view.lines)
  } catch (err) {
    await update($, errorA, () => (err instanceof Error ? err.message : String(err)))
  }
}

async function act<T = unknown>($: $, busy: string, route: string, body: Record<string, unknown>, done: string | ((data: T) => string)) {
  await update($, busyA, () => busy)
  await update($, errorA, () => null)
  try {
    const data = await api<T>($, route, body)
    if (route.startsWith('schedule/')) await update($, scheduleA, () => data as Schedule)
    await refresh($)
    const text = typeof done === 'string' ? done : done(data)
    $.ui.toast(text)
    return text
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await update($, errorA, () => message)
    $.ui.toast(message, { timeoutMs: 8000 })
    return message
  } finally {
    await update($, busyA, () => null)
  }
}

type WindowOpened = { name: string; action: 'focused' | 'opened' | 'prepared' }

function openWindow($: $, deck: DeckState | null, alias: string) {
  const name = displayName(deck, alias)
  return act<WindowOpened>($, `Opening ${name} in Claude Desktop`, 'accounts/window', { alias }, data =>
    data.action === 'focused' ? `The Claude Desktop window of ${data.name} is in front` : `${data.name} opens in its own Claude Desktop window`
  )
}

async function handoff($: $, deck: DeckState | null, alias: string) {
  const name = displayName(deck, alias)
  const sessionId = await $.session.id()
  const cwd = await $.session.cwd()
  return act($, `Moving this session to ${name}`, 'session/handoff', { alias, sessionId, cwd }, `This session continues on ${name} in a new terminal window`)
}

async function relogin($: $, entry: Ranked) {
  const script = `${$.plugin.root.replace(/\\/g, '/')}/scripts/relogin.ps1`
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Email', entry.email, '-Deck', deckBin($)]
  const list = args.map(value => `'${value.replace(/'/g, "''")}'`).join(',')
  await $.process.run(['powershell.exe', '-NoProfile', '-Command', `Start-Process powershell.exe -ArgumentList ${list}`], {
    timeoutMs: 20_000,
  })
  const text = 'Sign in opened in a new window. Follow its steps.'
  $.ui.toast(text, { timeoutMs: 8000 })
  return text
}

async function openPane($: $) {
  await update($, paneOpenA, () => true)
  return $.ui.open({ id: PANE, title: 'ClaudeDeck', columns: 100 })
}

async function closePane($: $) {
  await update($, paneOpenA, () => false)
  await $.ui.close({ id: PANE })
}

async function togglePane($: $) {
  const panes = await $.ui.panes()
  if (panes.some(pane => pane.id === PANE)) await closePane($)
  else await openPane($)
}

function findAlias(deck: DeckState | null, text: string): string | null {
  if (!deck || !text) return null
  const wanted = text.toLowerCase()
  const match =
    deck.sessions.find(entry => entry.alias.toLowerCase() === wanted) ??
    deck.sessions.find(entry => entry.name.toLowerCase() === wanted) ??
    deck.sessions.find(entry => entry.email.toLowerCase().startsWith(wanted))
  return match?.alias ?? null
}

const HELP = [
  '/deck                 open or close the ClaudeDeck sidebar',
  '/deck use <name>      move Claude Code to that account now',
  '/deck desktop <name>  open that account in its own Claude Desktop window',
  '/deck continue <name> continue this session on that account in a terminal',
  '/deck next <name>     use that account next, /deck next clear to undo',
  '/deck hold <name>     keep an account out of auto switch, /deck release <name>',
  '/deck auto on         start auto switch now and at every sign in',
  '/deck refresh         fetch live usage for every account',
  '/deck import          bring in every account saved by claude-swap',
].join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const cached = (await $.store.get(STORE_DECK).catch(() => undefined)) as DeckState | undefined
    if (cached) await update($, deckA, current => current ?? cached)
    await $.command.register({
      name: 'deck',
      description: 'ClaudeDeck: accounts, live usage, auto switch, next account',
      argumentHint: '[use|next|hold|release <name> | auto on | refresh | import]',
    })
    void refresh($)
    const panes = await $.ui.panes()
    await update($, paneOpenA, () => panes.some(pane => pane.id === PANE))
    $.clock.every(POLL_MS, () => {
      void refresh($)
    })
    return next(e)
  })

  on('command.run', { command: 'deck' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ')
    const deck = (await read($, deckA)) ?? (await refresh($))
    if (verb === '' || verb === 'open') {
      void openPane($)
      return { text: 'ClaudeDeck sidebar opened.' }
    }
    if (verb === 'close') {
      await closePane($)
      return { text: 'ClaudeDeck sidebar closed.' }
    }
    if (verb === 'help') return { text: HELP }
    if (verb === 'refresh') {
      await refresh($, true)
      return { text: 'Usage refreshed.' }
    }
    if (verb === 'import') {
      return { text: await act($, 'Importing from claude-swap', 'accounts/import', {}, 'Imported the claude-swap accounts') }
    }
    if (verb === 'auto') {
      if (arg !== 'on') return { text: HELP }
      return { text: await act($, 'Turning on auto switch', 'auto/install', {}, 'Auto switch is on and starts at every sign in') }
    }
    if (verb === 'next' && arg === 'clear') {
      return { text: await act($, 'Clearing your pick', 'auto/next', { alias: null }, 'The ranking picks the next account again') }
    }
    if (['use', 'next', 'hold', 'release', 'desktop', 'continue'].includes(verb)) {
      const alias = findAlias(deck, arg)
      if (!alias) return { text: `No saved account matches "${arg}".` }
      const name = displayName(deck, alias)
      if (verb === 'desktop') return { text: await openWindow($, deck, alias) }
      if (verb === 'continue') return { text: await handoff($, deck, alias) }
      if (verb === 'use') return { text: await act($, `Moving Claude Code to ${name}`, 'accounts/switch', { alias, code: true }, `Claude Code is on ${name}`) }
      if (verb === 'next') return { text: await act($, `Setting ${name} as next`, 'auto/next', { alias }, `${name} goes next`) }
      return {
        text: await act($, verb === 'hold' ? `Holding ${name}` : `Releasing ${name}`, 'auto/hold', { alias, hold: verb === 'hold' }, verb === 'hold' ? `${name} is held` : `${name} is back in auto switch`),
      }
    }
    return { text: HELP }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    await update($, paneOpenA, () => false)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const deck = await read($, deckA)
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    const open = await read($, paneOpenA)
    const toggle = <Button key="deck-toggle" label={open ? 'Close' : 'Open'} onPress={() => void togglePane($)} />
    if (!deck) {
      const error = await read($, errorA)
      return (
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text dimColor>{error ? 'ClaudeDeck could not read your accounts' : 'ClaudeDeck is reading your accounts...'}</Text>
          {toggle}
        </Box>
      )
    }
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : undefined
    const nameOf = (alias: string | null) => displayName(deck, alias)
    const seat = seatOf(deck, e.surface)
    const nudge = seat === 'desktop' ? deck.desktopNudge : null
    return (
      <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
        {Svg ? <Svg source={stripSvg(deck, nameOf, seat)} alt={stripText(deck, nameOf, seat)} /> : <Text>{stripText(deck, nameOf, seat)}</Text>}
        {toggle}
        {nudge && <Text key="nudge-text" color="error">Out of usage</Text>}
        {nudge && <Button key="nudge-open" label={`Open ${nameOf(nudge.target)}`} variant="primary" onPress={() => void openWindow($, deck, nudge.target)} />}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Button, Text, Code } = els
    const Input = 'Input' in els ? els.Input : undefined
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : undefined
    const deck = await read($, deckA)
    const tab = await read($, tabA)
    const busy = await read($, busyA)
    const error = await read($, errorA)
    const confirm = await read($, confirmA)

    const tabs = (
      <Box key="tabs" flexDirection="row" gap={1}>
        {(['accounts', 'schedule', 'log'] as Tab[]).map(id => (
          <Button
            key={`tab-${id}`}
            label={id === 'accounts' ? 'Accounts' : id === 'schedule' ? 'Background runs' : 'Run log'}
            variant={tab === id ? 'primary' : 'secondary'}
            onPress={async () => {
              await update($, tabA, () => id)
              if (id === 'schedule') await loadSchedule($)
              if (id === 'log') await loadLog($)
            }}
          />
        ))}
      </Box>
    )

    const notice = (
      <Box key="notice" flexDirection="column">
        {busy && <Text dimColor>{busy}...</Text>}
        {error && <Text color="error">{error}</Text>}
      </Box>
    )

    if (tab === 'schedule') {
      const schedule = await read($, scheduleA)
      if (!schedule) {
        return (
          <Box flexDirection="column" gap={1}>
            {tabs}
            {notice}
            <Text dimColor>Reading the background schedule...</Text>
          </Box>
        )
      }
      const save = (draft: Record<string, unknown>, done: string) => act($, 'Saving the schedule', 'schedule/save', draft, done)
      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          {notice}
          <Box flexDirection="column">
            <Text weight="semibold">Background runs</Text>
            <Text dimColor>{schedule.summaryText}</Text>
          </Box>
          <Box flexDirection="column" borderStyle="round" paddingX={1}>
            <Text>
              {schedule.installed ? (schedule.enabled ? 'On' : 'Installed, turned off') : 'Not installed'}
              {schedule.running ? ' · running now' : ''}
            </Text>
            <Text dimColor>Last run {schedule.lastRun || 'never'} · next run {schedule.nextRun || 'not planned'}</Text>
            <Text dimColor>
              {schedule.counts.runs} runs · {schedule.counts.success} ok · {schedule.counts.failed} failed
            </Text>
          </Box>
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            {schedule.installed && schedule.enabled ? (
              <Button key="sched-stop" label="Turn off" onPress={() => void act($, 'Turning off background runs', 'schedule/stop', {}, 'Background runs are off')} />
            ) : (
              <Button key="sched-start" label="Turn on" variant="primary" onPress={() => void act($, 'Turning on background runs', 'schedule/start', {}, 'Background runs are on')} />
            )}
            <Button key="sched-run" label="Run once now" onPress={() => void act($, 'Starting a run', 'schedule/run', {}, 'A run started')} />
          </Box>
          {Input ? (
            <Input
              key="prompt"
              label="Prompt"
              value={schedule.prompt}
              submitLabel="Save"
              onSubmit={(value: string) => void save({ prompt: value }, 'Prompt saved')}
            />
          ) : (
            <Text>Prompt: {schedule.prompt}</Text>
          )}
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Button
              key="wake"
              label={`Wake to run: ${schedule.wakeToRun ? 'on' : 'off'}`}
              onPress={() => void save({ wakeToRun: !schedule.wakeToRun }, 'Saved')}
            />
            <Button
              key="locked"
              label={`Run when locked: ${schedule.runWhenLocked ? 'on' : 'off'}`}
              onPress={() => void save({ runWhenLocked: !schedule.runWhenLocked }, 'Saved')}
            />
            <Button
              key="warm-all"
              label={`Warm every account: ${schedule.warmAllAccounts ? 'on' : 'off'}`}
              onPress={() =>
                void save(
                  { warmAllAccounts: !schedule.warmAllAccounts },
                  schedule.warmAllAccounts ? 'Only the Claude Code account runs now' : 'Each run also starts the 5h window of every idle account'
                )
              }
            />
          </Box>
          {schedule.warmAllAccounts && (
            <Text key="warm-note" dimColor size="footnote">
              Each run also sends the prompt from every saved account without a running 5h window, in a temporary login folder, so Claude Code stays on its account.
            </Text>
          )}
          <Text weight="semibold">When it runs</Text>
          {schedule.schedules.map((block, index) => (
            <Box key={`block-${index}`} flexDirection="column">
              {Input ? (
                <Input
                  key={`block-input-${index}`}
                  label={`Times ${index + 1}`}
                  value={blockText(block)}
                  placeholder="Monday Tuesday at 09:00 14:00"
                  submitLabel="Save"
                  onSubmit={(value: string) => {
                    try {
                      const blocks = schedule.schedules.map((entry, at) => (at === index ? parseBlock(value) : entry))
                      void save({ schedules: blocks }, 'Times saved')
                    } catch (err) {
                      void update($, errorA, () => (err instanceof Error ? err.message : String(err)))
                    }
                  }}
                />
              ) : (
                <Text>{blockText(block)}</Text>
              )}
              {schedule.schedules.length > 1 && (
                <Button
                  key={`block-remove-${index}`}
                  label="Remove these times"
                  onPress={() => void save({ schedules: schedule.schedules.filter((_, at) => at !== index) }, 'Removed')}
                />
              )}
            </Box>
          ))}
          <Button
            key="block-add"
            label="Add more times"
            onPress={() => void save({ schedules: [...schedule.schedules, { days: ['Monday'], times: ['09:00'] }] }, 'Added')}
          />
        </Box>
      )
    }

    if (tab === 'log') {
      const lines = await read($, logA)
      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          {notice}
          <Box flexDirection="row" gap={1} alignItems="center">
            <Text weight="semibold">Run log</Text>
            <Button key="log-refresh" label="Refresh" onPress={() => void loadLog($)} />
          </Box>
          {lines.length ? <Code source={lines.join('\n')} wrap="wrap" /> : <Text dimColor>No runs logged yet.</Text>}
        </Box>
      )
    }

    if (!deck) {
      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          {notice}
          <Text dimColor>{error ? 'ClaudeDeck could not be read.' : 'Reading your accounts...'}</Text>
        </Box>
      )
    }

    const nowMs = Date.parse(deck.now)
    const nameOf = (alias: string | null) => displayName(deck, alias)
    const preferred = deck.auto.preferredNext?.toLowerCase() ?? null
    const width = paneWidth(e.props.bodyColumns)
    const roomy = e.surface !== 'terminal'
    const seat = seatOf(deck, e.surface)
    const home = seat !== 'desktop' || deck.desktopHome

    return (
      <Box flexDirection="column" gap={1}>
        {tabs}
        {notice}
        {Svg ? (
          <Svg source={headerSvg(deck, nameOf, width, seat)} alt={headerAlt(deck, nameOf, seat)} />
        ) : (
          <Text weight="semibold">{headerAlt(deck, nameOf, seat)}</Text>
        )}
        {sortForPane(deck, seat).map(entry => {
          const session = sessionOf(deck, entry.alias)
          const live = deck.live[entry.alias] ?? null
          const isPick = entry.alias.toLowerCase() === preferred
          const needsLogin = entry.status === 'relogin' || live?.status === 'relogin'
          const usable = !entry.active && entry.status === 'ok' && !entry.held
          const tags = [
            entry.active ? (seat === 'desktop' ? 'Terminal' : 'Claude Code') : '',
            session?.desktopActive ? (seat === 'desktop' ? 'This window' : 'Desktop') : '',
            !session?.desktopActive && session?.windowOpen ? 'Window open' : '',
            !entry.active && entry.alias === deck.next ? (isPick ? 'Next, your pick' : 'Next') : '',
            !entry.active && isPick && entry.alias !== deck.next ? 'Your pick' : '',
          ].filter(Boolean)
          const pendingForget = confirm === `forget:${entry.alias}`
          const canWindow = !session?.desktopActive && Boolean(session?.windowReady) && !needsLogin
          const canHandoff = seat === 'desktop' && !session?.desktopActive && entry.status === 'ok' && !entry.held && entry.hasRoom
          return (
            <Box
              key={`card-${entry.alias}`}
              flexDirection="column"
              borderStyle="round"
              borderColor={entry.active ? 'claude' : undefined}
              borderDimColor={!entry.active}
              paddingX={1}
              paddingY={roomy ? 1 : 0}
              gap={roomy ? 1 : 0}
            >
              <Box flexDirection="column">
                <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
                  <Text weight="semibold" bold={entry.active} wrap="truncate-end">
                    {session?.name ?? entry.alias}
                  </Text>
                  {tags.length > 0 && <Text color={entry.active ? 'claude' : undefined} dimColor={!entry.active} wrap="truncate-end">{tags.join(' · ')}</Text>}
                </Box>
                <Text dimColor size="footnote" wrap="truncate-end">
                  {entry.email}
                </Text>
              </Box>
              <Box flexDirection="column">
                {Svg ? (
                  <Svg source={metersSvg(entry, live, nowMs, cardWidth(width))} alt={metersAlt(entry)} />
                ) : (
                  <Text>{metersAlt(entry)}</Text>
                )}
                <Text dimColor={!needsLogin} color={needsLogin ? 'error' : undefined} size="footnote" wrap="wrap">
                  {reasonOf(entry, live, nowMs)}
                </Text>
                {!session?.desktopActive && !session?.windowReady && !needsLogin && (
                  <Text dimColor size="footnote" wrap="wrap">
                    No Claude Desktop window yet. Press Add Desktop account in your first Claude Desktop window and sign in with it.
                  </Text>
                )}
              </Box>
              {pendingForget ? (
                <Box flexDirection="row" gap={1}>
                  <Text color="error">Forget this account and its saved logins?</Text>
                  <Button
                    key={`forget-yes-${entry.alias}`}
                    label="Forget"
                    onPress={async () => {
                      await update($, confirmA, () => null)
                      await act($, `Forgetting ${nameOf(entry.alias)}`, 'accounts/forget', { alias: entry.alias }, 'Forgotten')
                    }}
                  />
                  <Button key={`forget-no-${entry.alias}`} label="Keep" onPress={() => update($, confirmA, () => null)} />
                </Box>
              ) : (
                <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="center">
                  {needsLogin && <Button key={`login-${entry.alias}`} label="Sign in again" variant="primary" onPress={() => void relogin($, entry)} />}
                  {usable && (
                    <Button
                      key={`use-${entry.alias}`}
                      label={seat === 'desktop' ? 'Use in terminal' : 'Use now'}
                      onPress={() =>
                        void act($, `Moving Claude Code to ${nameOf(entry.alias)}`, 'accounts/switch', { alias: entry.alias, code: true }, `Claude Code is on ${nameOf(entry.alias)}`)
                      }
                    />
                  )}
                  {!entry.active && !entry.held && !needsLogin && (
                    <Button
                      key={`next-${entry.alias}`}
                      label={isPick ? 'Clear next' : 'Use next'}
                      onPress={() =>
                        void act($, isPick ? 'Clearing your pick' : `Setting ${nameOf(entry.alias)} as next`, 'auto/next', { alias: isPick ? null : entry.alias }, isPick ? 'The ranking picks the next account again' : `${nameOf(entry.alias)} goes next`)
                      }
                    />
                  )}
                  {!entry.active && (
                    <Button
                      key={`hold-${entry.alias}`}
                      label={entry.held ? 'Release' : 'Hold'}
                      onPress={() =>
                        void act($, entry.held ? 'Releasing' : 'Holding', 'auto/hold', { alias: entry.alias, hold: !entry.held }, entry.held ? `${nameOf(entry.alias)} is back in auto switch` : `${nameOf(entry.alias)} is held`)
                      }
                    />
                  )}
                  {canWindow && (
                    <Button
                      key={`desktop-${entry.alias}`}
                      label={session?.windowOpen ? 'Show Desktop window' : 'Open in Desktop'}
                      onPress={() => void openWindow($, deck, entry.alias)}
                    />
                  )}
                  {canHandoff && (
                    <Button key={`handoff-${entry.alias}`} label="Continue in terminal" onPress={() => void handoff($, deck, entry.alias)} />
                  )}
                  <Button key={`forget-${entry.alias}`} label="Forget" dimColor onPress={() => update($, confirmA, () => `forget:${entry.alias}`)} />
                </Box>
              )}
            </Box>
          )
        })}
        <Box flexDirection="column">
          <Text dimColor size="footnote" wrap="wrap">
            {deck.auto.running
              ? `Auto switch checks every ${deck.auto.settings.intervalSeconds}s, spends the account whose week resets soonest first and moves the terminal Claude Code at ${deck.auto.settings.threshold}%. Claude Desktop never restarts: each account has its own window, and the strip offers the next one when this one runs out.`
              : 'Auto switch is off, so the terminal Claude Code stays on its account until you move it. Each account keeps its own Claude Desktop window.'}
            {seat === 'desktop' && deck.auto.lastDesktopDecision
              ? ` Last check ${Math.max(0, Math.round((nowMs - Date.parse(deck.auto.lastDesktopDecision.at)) / 1000))}s ago: ${deck.auto.lastDesktopDecision.reason}.`
              : deck.auto.lastDecision
                ? ` Last check ${Math.max(0, Math.round((nowMs - Date.parse(deck.auto.lastDecision.at)) / 1000))}s ago: ${deck.auto.lastDecision.reason}.`
                : ''}
          </Text>
        </Box>
        {confirm === 'desktop-add' && (
          <Box key="desktop-add-confirm" flexDirection="row" gap={1} flexWrap="wrap" alignItems="center">
            <Text color="claude">
              Save {deck.desktop?.name ?? 'the current login'} and open this window on a sign in screen? Only this window closes and opens again, the windows of other accounts keep running. Nothing is signed out.
            </Text>
            <Button
              key="desktop-add-yes"
              label="Open sign in"
              variant="primary"
              onPress={async () => {
                await update($, confirmA, () => null)
                await act($, 'Opening a Claude Desktop sign in screen', 'accounts/add-desktop', {}, 'Claude Desktop closes and opens on a sign in screen')
              }}
            />
            <Button key="desktop-add-no" label="Cancel" onPress={() => update($, confirmA, () => null)} />
          </Box>
        )}
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {!deck.auto.running && (
            <Button key="auto-on" label="Turn on auto switch" variant="primary" onPress={() => void act($, 'Turning on auto switch', 'auto/install', {}, 'Auto switch is on')} />
          )}
          <Button key="refresh" label="Refresh usage" onPress={() => void refresh($, true)} />
          <Button key="save" label="Save signed-in account" onPress={() => void act($, 'Saving the Claude Code login', 'accounts/save', { codeOnly: true }, 'Saved')} />
          {home && confirm !== 'desktop-add' && (
            <Button key="desktop-add" label="Add Desktop account" onPress={() => update($, confirmA, () => 'desktop-add')} />
          )}
        </Box>
        {!home && (
          <Text key="desktop-add-note" dimColor size="footnote" wrap="wrap">
            To add another Claude Desktop account, press Add Desktop account in your first Claude Desktop window.
          </Text>
        )}
      </Box>
    )
  })
}
