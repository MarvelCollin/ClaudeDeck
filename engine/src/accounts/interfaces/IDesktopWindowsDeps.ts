import { IClaudeProcess } from './IClaudeProcess';

export interface IDesktopWindowsDeps {
  defaultProfileDir: string;
  profilesRoot: string;
  registryFile: string | undefined;
  slotOf: (alias: string) => string;
  listProcesses: () => IClaudeProcess[];
  launch: (command: string, args: string[]) => number | undefined;
  launchDefault: () => void;
  profileLauncher: () => { command: string; args: string[] };
  pause: (ms: number) => void;
  now: () => Date;
}
