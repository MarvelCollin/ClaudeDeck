import fs from 'node:fs';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { scheduleSummary } from '../../core/config/schedule';
import { IConfigContext, IInvocation, IScheduler } from '../../core/interfaces';
import { clearConsole, color, THEME } from './theme';

function askLine(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

function editorCommand(file: string): IInvocation {
  if (process.env.VISUAL) return { command: process.env.VISUAL, args: [file] };
  if (process.env.EDITOR) return { command: process.env.EDITOR, args: [file] };
  if (process.platform === 'win32') return { command: 'notepad.exe', args: [file] };
  if (process.platform === 'darwin') return { command: 'open', args: ['-W', '-t', file] };
  return { command: 'vi', args: [file] };
}

function openEditor(file: string): void {
  const editor = editorCommand(file);
  const result = spawnSync(editor.command, editor.args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${editor.command} failed with exit code ${result.status}.`);
}

export async function configureSchedule(
  context: IConfigContext,
  scheduler: IScheduler,
  install: () => void,
  reloadContext: () => void
): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Configure Schedule requires an interactive terminal.');
  }
  clearConsole();
  console.log(color(THEME.title, 'Configure Schedule'));
  console.log('');
  console.log(`Config: ${context.configPath}`);
  console.log(`Current: ${scheduleSummary(context.config)}`);
  console.log('');
  console.log('Opening the config JSON. Save and close the editor to continue.');
  console.log('');

  const previousConfig = fs.readFileSync(context.configPath, 'utf8');
  try {
    openEditor(context.configPath);
    reloadContext();
  } catch (error) {
    fs.writeFileSync(context.configPath, previousConfig, 'utf8');
    reloadContext();
    throw error;
  }

  console.log('');
  console.log(`Saved: ${context.configPath}`);
  console.log(`New schedule: ${scheduleSummary(context.config)}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const apply = (await askLine(rl, 'Apply background schedule now? [Y/n]: ')).trim().toLowerCase();
    if (apply !== 'n' && apply !== 'no') {
      install();
      scheduler.enable(context);
      console.log('Background schedule updated.');
    }
  } finally {
    rl.close();
  }
}
