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
  sortForPane,
  until,
} from './view'

const PANE = 'claudedeck'
const POLL_MS = 20_000

const deckA = atom({ plugin: 'claudedeck', key: 'deck' } as const, null)
const scheduleA = atom({ plugin: 'claudedeck', key: 'schedule' } as const, null)
const logA = atom({ plugin: 'claudedeck', key: 'log' } as const, [])
const tabA = atom({ plugin: 'claudedeck', key: 'tab' } as const, 'accounts')
const busyA = atom({ plugin: 'claudedeck', key: 'busy' } as const, null)
const errorA = atom({ plugin: 'claudedeck', key: 'error' } as const, null)
const confirmA = atom({ plugin: 'claudedeck', key: 'confirm' } as const, null)
const alertedA = atom({ plugin: 'claudedeck', key: 'alerted' } as const, [])
const lastCodeA = atom({ plugin: 'claudedeck', key: 'lastCode' } as const, null)

type $ = EngineInterface

function deckBin($: $): string {
  return `${$.plugin.root.replace(/\\/g, '/')}/../bin/claudedeck.js`
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
    const active = deck.ranked.find(entry => entry.active)
    if (active && active.usedPercent >= 90 && !deck.next) {
      await alertOnce($, `full:${Math.floor(nowMs / 3_600_000)}`, 'Every account is close to its limit', alerted, fresh)
    }
    await update($, alertedA, () => fresh)
    await update($, lastCodeA, () => codeAlias)
    await update($, deckA, () => deck)
    await update($, errorA, () => null)
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

async function act($: $, busy: string, route: string, body: Record<string, unknown>, done: string) {
  await update($, busyA, () => busy)
  await update($, errorA, () => null)
  try {
    const data = await api<unknown>($, route, body)
    if (route.startsWith('schedule/')) await update($, scheduleA, () => data as Schedule)
    await refresh($)
    $.ui.toast(done)
    return done
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await update($, errorA, () => message)
    $.ui.toast(message, { timeoutMs: 8000 })
    return message
  } finally {
    await update($, busyA, () => null)
  }
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

function openPane($: $) {
  return $.ui.open({ id: PANE, title: 'ClaudeDeck', columns: 46 })
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
  '/deck                 open the ClaudeDeck pane',
  '/deck use <name>      move Claude Code to that account now',
  '/deck next <name>     use that account next, /deck next clear to undo',
  '/deck hold <name>     keep an account out of auto switch, /deck release <name>',
  '/deck auto on         start auto switch now and at every sign in',
  '/deck refresh         fetch live usage for every account',
].join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'deck',
      description: 'ClaudeDeck: accounts, live usage, auto switch, next account',
      argumentHint: '[use|next|hold|release <name> | auto on | refresh]',
    })
    void refresh($)
    void openPane($)
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
      return { text: 'ClaudeDeck pane opened.' }
    }
    if (verb === 'help') return { text: HELP }
    if (verb === 'refresh') {
      await refresh($, true)
      return { text: 'Usage refreshed.' }
    }
    if (verb === 'auto') {
      if (arg !== 'on') return { text: HELP }
      return { text: await act($, 'Turning on auto switch', 'auto/install', {}, 'Auto switch is on and starts at every sign in') }
    }
    if (verb === 'next' && arg === 'clear') {
      return { text: await act($, 'Clearing your pick', 'auto/next', { alias: null }, 'The ranking picks the next account again') }
    }
    if (['use', 'next', 'hold', 'release'].includes(verb)) {
      const alias = findAlias(deck, arg)
      if (!alias) return { text: `No saved account matches "${arg}".` }
      const name = displayName(deck, alias)
      if (verb === 'use') return { text: await act($, `Moving Claude Code to ${name}`, 'accounts/switch', { alias, code: true }, `Claude Code is on ${name}`) }
      if (verb === 'next') return { text: await act($, `Setting ${name} as next`, 'auto/next', { alias }, `${name} goes next`) }
      return {
        text: await act($, verb === 'hold' ? `Holding ${name}` : `Releasing ${name}`, 'auto/hold', { alias, hold: verb === 'hold' }, verb === 'hold' ? `${name} is held` : `${name} is back in auto switch`),
      }
    }
    return { text: HELP }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Button, Text, Code } = els
    const Input = 'Input' in els ? els.Input : undefined
    const Select = 'Select' in els ? els.Select : undefined
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

    return (
      <Box flexDirection="column" gap={1}>
        {tabs}
        {notice}
        {Svg ? (
          <Svg source={headerSvg(deck, nameOf)} alt={headerAlt(deck, nameOf)} />
        ) : (
          <Text weight="semibold">{headerAlt(deck, nameOf)}</Text>
        )}
        {sortForPane(deck).map(entry => {
          const session = sessionOf(deck, entry.alias)
          const live = deck.live[entry.alias] ?? null
          const isPick = entry.alias.toLowerCase() === preferred
          const needsLogin = entry.status === 'relogin' || live?.status === 'relogin'
          const usable = !entry.active && entry.status === 'ok' && !entry.held
          const tags = [
            entry.active ? 'Claude Code' : '',
            session?.desktopActive ? 'Desktop' : '',
            !entry.active && entry.alias === deck.next ? (isPick ? 'Next, your pick' : 'Next') : '',
            !entry.active && isPick && entry.alias !== deck.next ? 'Your pick' : '',
            session?.windowOpen ? 'Window open' : '',
          ].filter(Boolean)
          const pendingForget = confirm === `forget:${entry.alias}`
          const moreOptions = [
            session?.windowOpen ? { value: 'close', label: 'Close its Desktop window' } : { value: 'open', label: 'Open in its own Desktop window' },
            ...(session?.desktopActive ? [] : [{ value: 'desktop', label: 'Switch Desktop too (restarts Desktop)' }]),
            { value: 'forget', label: 'Forget this account' },
          ]
          const onMore = (value: string) => {
            if (value === 'forget') return void update($, confirmA, () => `forget:${entry.alias}`)
            if (value === 'open') return void act($, 'Opening a Desktop window', 'accounts/open', { alias: entry.alias }, 'Window opening')
            if (value === 'close') return void act($, 'Closing its window', 'accounts/close', { alias: entry.alias }, 'Window closed')
            if (value === 'desktop') return void act($, 'Switching Desktop, it restarts', 'accounts/switch', { alias: entry.alias }, 'Desktop is reopening')
          }
          return (
            <Box
              key={`card-${entry.alias}`}
              flexDirection="column"
              borderStyle="round"
              borderColor={entry.active ? 'claude' : undefined}
              borderDimColor={!entry.active}
              paddingX={1}
            >
              <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                <Text weight="semibold" bold={entry.active}>
                  {session?.name ?? entry.alias}
                </Text>
                {tags.length > 0 && <Text color={entry.active ? 'claude' : undefined} dimColor={!entry.active}>{tags.join(' · ')}</Text>}
              </Box>
              <Text dimColor size="footnote">
                {entry.email}
              </Text>
              {Svg ? (
                <Svg source={metersSvg(entry, live, nowMs)} alt={metersAlt(entry)} />
              ) : (
                <Text>{metersAlt(entry)}</Text>
              )}
              <Text dimColor={!needsLogin} color={needsLogin ? 'error' : undefined} size="footnote">
                {reasonOf(entry, live, nowMs)}
              </Text>
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
                      label="Use now"
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
                  {Select ? (
                    <Select key={`more-${entry.alias}`} label="More" options={moreOptions} onSelect={(value: string) => onMore(value)} />
                  ) : (
                    moreOptions.map(option => (
                      <Button key={`more-${option.value}-${entry.alias}`} label={option.label} onPress={() => onMore(option.value)} />
                    ))
                  )}
                </Box>
              )}
            </Box>
          )
        })}
        <Box flexDirection="column">
          <Text dimColor size="footnote">
            {deck.auto.running
              ? `Auto switch checks every ${deck.auto.settings.intervalSeconds}s and moves Claude Code at ${deck.auto.settings.threshold}%.`
              : 'Auto switch is off, so Claude Code stays on its account until you move it.'}
            {deck.auto.lastDecision
              ? ` Last check ${Math.max(0, Math.round((nowMs - Date.parse(deck.auto.lastDecision.at)) / 1000))}s ago: ${deck.auto.lastDecision.reason}.`
              : ''}
          </Text>
        </Box>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {!deck.auto.running && (
            <Button key="auto-on" label="Turn on auto switch" variant="primary" onPress={() => void act($, 'Turning on auto switch', 'auto/install', {}, 'Auto switch is on')} />
          )}
          <Button key="refresh" label="Refresh usage" onPress={() => void refresh($, true)} />
          <Button key="save" label="Save signed-in account" onPress={() => void act($, 'Saving the Claude Code login', 'accounts/save', { codeOnly: true }, 'Saved')} />
          <Button
            key="share"
            label={`Shared history: ${deck.shareSession ? 'on' : 'off'}`}
            onPress={() => void act($, 'Saving', 'accounts/sharing', { enabled: !deck.shareSession }, 'Saved')}
          />
        </Box>
      </Box>
    )
  })
}
