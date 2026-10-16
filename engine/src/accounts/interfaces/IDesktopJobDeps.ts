export interface IDesktopJobDeps {
  file: string;
  node: string;
  bin: string;
  delayMs: number;
  spawn: (command: string, args: string[]) => number | undefined;
  pause: (ms: number) => void;
  now: () => Date;
}
