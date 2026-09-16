export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export type ClaudeModel = 'haiku';

export interface Schedule {
  days: Weekday[];
  times: string[];
}

export interface AppConfig {
  taskName: string;
  macLabel: string;
  prompt: string;
  model: ClaudeModel;
  logFile: string;
  wakeToRun: boolean;
  runWhenLocked: boolean;
  schedules: Schedule[];
}

export interface ConfigContext {
  config: AppConfig;
  configPath: string;
  configHash: string;
  logPath: string;
}

export interface RunCounts {
  runs: number;
  success: number;
  failed: number;
  incomplete: number;
}

export interface SchedulerSummary {
  installed: boolean;
  enabled: boolean;
  running: boolean;
  state: string;
  lastRun: string;
  nextRun: string;
  counts: RunCounts;
  loaded?: boolean;
  lastResult?: string;
}

export type SchedulerName = 'windows' | 'macos';

export interface Scheduler {
  readonly name: SchedulerName;
  exists(context: ConfigContext): boolean;
  install(context: ConfigContext): void;
  summary(context: ConfigContext): SchedulerSummary;
  status(context: ConfigContext): void;
  runNow(context: ConfigContext): void;
  stop(context: ConfigContext): void;
  disable(context: ConfigContext): void;
  enable(context: ConfigContext): void;
  deleteTask(context: ConfigContext): void;
  openLog(context: ConfigContext): void;
}
