export type Win = { usedPercent: number; resetsAt: string | null }

export type LiveStatus = 'ok' | 'relogin' | 'error' | 'no-login'

export type Live = {
  status: LiveStatus
  fiveHour: Win | null
  sevenDay: Win | null
  fetchedAt: string | null
  error: string | null
}

export type Tier = 'live' | 'idle' | 'unknown'

export type Ranked = {
  alias: string
  email: string
  active: boolean
  held: boolean
  status: LiveStatus | 'unchecked'
  fiveHour: Win | null
  sevenDay: Win | null
  usedPercent: number
  tier: Tier
  rank: number | null
  hasRoom: boolean
}

export type Session = {
  alias: string
  email: string
  name: string
  desktopActive: boolean
  desktopCaptured: boolean
}

export type DesktopJob = {
  action: 'switch' | 'save' | 'add'
  alias: string | null
  startedAt: string
  finishedAt: string | null
  ok: boolean | null
  error: string | null
}

export type Decision = { at: string; action: 'stay' | 'switch'; target: string | null; reason: string }

export type AutoInfo = {
  running: boolean
  settings: { threshold: number; landing: number; cooldownSeconds: number; intervalSeconds: number }
  preferredNext: string | null
  held: string[]
  lastDecision: Decision | null
  lastDesktopDecision?: Decision | null
  lastSwitchAt: string | null
}

export type DeckState = {
  now: string
  code: { email: string; name: string; alias: string | null } | null
  desktop: { email: string; name: string } | null
  desktopRunning: boolean
  desktopJob: DesktopJob | null
  sessions: Session[]
  live: Record<string, Live | null>
  ranked: Ranked[]
  next: string | null
  auto: AutoInfo
}

export type ScheduleBlock = { days: string[]; times: string[] }

export type Schedule = {
  summaryText: string
  installed: boolean
  enabled: boolean
  running: boolean
  lastRun: string
  nextRun: string
  prompt: string
  wakeToRun: boolean
  runWhenLocked: boolean
  warmAllAccounts: boolean
  schedules: ScheduleBlock[]
  counts: { runs: number; success: number; failed: number; incomplete: number }
}

export type Tab = 'accounts' | 'schedule' | 'log'

declare module 'claude-code' {
  interface PluginState {
    claudedeck: {
      deck: DeckState | null
      schedule: Schedule | null
      log: string[]
      tab: Tab
      busy: string | null
      error: string | null
      confirm: string | null
      alerted: string[]
      lastCode: string | null
      paneOpen: boolean
    }
  }
}
