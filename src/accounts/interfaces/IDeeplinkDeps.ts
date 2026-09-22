import { IClaudeProcess } from './IClaudeProcess';
import { IDeeplinkState } from './IDeeplinkState';

export interface IDeeplinkDeps {
  platform: NodeJS.Platform;
  readState: () => IDeeplinkState;
  writeState: (state: IDeeplinkState) => IDeeplinkState;
  readCommand: () => string | null;
  writeCommand: (command: string) => void;
  restoreCommand: (fallback: string | null, created: boolean) => void;
  wantedCommand: () => string;
  listProcesses: () => IClaudeProcess[];
  signedOut: (dir: string) => boolean;
  launch: (exe: string, args: string[]) => number | undefined;
  locate: () => string;
  now: () => Date;
}
