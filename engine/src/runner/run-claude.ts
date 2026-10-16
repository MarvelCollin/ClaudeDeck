import { claudeCommand } from '../core/claude-cli';
import { loadConfig } from '../core/config/loader';
import { errorMessage } from '../core/fs/json';
import { IInvocation } from '../core/interfaces';
import { appendLog } from '../core/logging/run-log';
import { IRunnerDeps } from './interfaces';
import { defaultWarmDeps, spawnClaude, warmAccounts, warmLogLines } from './warm-accounts';

function argValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function stamp(text: string): string {
  return `[${new Date().toISOString()}] ${text}\n`;
}

const DEFAULT_RUNNER_DEPS: IRunnerDeps = {
  command: (prompt, model) => claudeCommand(prompt, model),
  run: (invocation, env) => spawnClaude(invocation, env, 0),
  warmDeps: defaultWarmDeps,
};

export async function runClaudeOnce(
  argv: string[] = process.argv.slice(2),
  overrides: Partial<IRunnerDeps> = {}
): Promise<number> {
  const deps: IRunnerDeps = { ...DEFAULT_RUNNER_DEPS, ...overrides };
  const context = loadConfig(argValue(argv, '--config'));
  let exitCode = 1;
  let invocation: IInvocation | null = null;
  appendLog(context.logPath, stamp('start'));
  try {
    invocation = deps.command(context.config.prompt, context.config.model);
    const result = deps.run(invocation, process.env);
    if (result.error) throw new Error(result.error);
    if (result.stdout) appendLog(context.logPath, result.stdout);
    if (result.stderr) appendLog(context.logPath, result.stderr);
    exitCode = typeof result.status === 'number' ? result.status : 1;
  } catch (error) {
    const message = errorMessage(error);
    appendLog(context.logPath, `${message}\n`);
    console.error(message);
  }
  if (context.config.warmAllAccounts && invocation) {
    const ready = invocation;
    try {
      const results = await warmAccounts(deps.warmDeps(() => ready));
      for (const line of warmLogLines(results)) appendLog(context.logPath, stamp(line));
    } catch (error) {
      appendLog(context.logPath, stamp(`warm failed: ${errorMessage(error)}`));
    }
  }
  appendLog(context.logPath, stamp(`exit ${exitCode}`));
  return exitCode;
}
