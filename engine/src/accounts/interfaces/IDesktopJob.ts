export type DesktopJobAction = 'switch' | 'save';

export interface IDesktopJob {
  action: DesktopJobAction;
  alias: string | null;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  error: string | null;
}
