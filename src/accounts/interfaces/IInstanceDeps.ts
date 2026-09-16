import { IClaudeProcess } from './IClaudeProcess';

export interface IInstanceDeps {
  slotOf: (alias: string) => string;
  dirOf: (alias: string) => string;
  listProcesses: () => IClaudeProcess[];
  kill: (pids: number[]) => number;
  launch: (exe: string, args: string[]) => number | undefined;
  locate: () => string;
  defaultDir: string;
}
