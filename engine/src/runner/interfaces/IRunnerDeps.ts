import { IInvocation } from '../../core/interfaces';
import { ClaudeModel } from '../../core/types';
import { IWarmDeps } from './IWarmDeps';
import { IWarmRun } from './IWarmRun';

export interface IRunnerDeps {
  command: (prompt: string, model: ClaudeModel) => IInvocation;
  run: (invocation: IInvocation, env: NodeJS.ProcessEnv) => IWarmRun;
  warmDeps: (invocation: () => IInvocation) => IWarmDeps;
}
