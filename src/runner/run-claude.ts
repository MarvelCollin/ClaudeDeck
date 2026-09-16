import { spawnSync } from 'node:child_process';
import { claudeCommand } from '../core/claude-cli';
import { loadConfig } from '../core/config/loader';
import { errorMessage } from '../core/fs/json';
import { appendLog } from '../core/logging/run-log';
import { packageRoot } from '../core/paths';

function argValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function stamp(text: string): string {
  return `[${new Date().toISOString()}] ${text}\n`;
}

export function runClaudeOnce(argv: string[] = process.argv.slice(2)): number {
  const context = loadConfig(argValue(argv, '--config'));
  let exitCode = 1;
  appendLog(context.logPath, stamp('start'));
  try {
    const invocation = claudeCommand(context.config.prompt, context.config.model);
    const result = spawnSync(invocation.command, invocation.args, {
      cwd: packageRoot,
      encoding: 'utf8',
      shell: false,
    });
    if (result.error) throw result.error;
    if (result.stdout) appendLog(context.logPath, result.stdout);
    if (result.stderr) appendLog(context.logPath, result.stderr);
    exitCode = typeof result.status === 'number' ? result.status : 1;
  } catch (error) {
    const message = errorMessage(error);
    appendLog(context.logPath, `${message}\n`);
    console.error(message);
  } finally {
    appendLog(context.logPath, stamp(`exit ${exitCode}`));
  }
  return exitCode;
}
