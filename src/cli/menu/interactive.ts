import readline from 'node:readline';
import { IConfigContext, IScheduler } from '../../core/interfaces';
import { ITaskActions } from '../interfaces';
import { showMenu } from './menu-view';
import { clearConsole, color, MENU_ITEMS } from './theme';

const EXIT_CHOICE = '0';

async function runLineMenu(context: IConfigContext, scheduler: IScheduler, actions: ITaskActions): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question: string): Promise<string> => new Promise(resolve => rl.question(question, resolve));
  try {
    for (;;) {
      showMenu(context, scheduler, scheduler.summary(context));
      const choice = (await ask('Choose: ')).trim();
      if (choice === EXIT_CHOICE) return;
      await actions.execute(choice);
    }
  } finally {
    rl.close();
  }
}

export async function runInteractive(
  context: IConfigContext,
  scheduler: IScheduler,
  actions: ITaskActions
): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    await runLineMenu(context, scheduler, actions);
    return;
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  let selected = 0;
  let busy = false;
  let info = scheduler.summary(context);
  let message = '';
  let queued = false;
  let closed = false;

  await new Promise<void>((resolve, reject) => {
    function render(nextMessage = message): void {
      message = nextMessage;
      if (closed || queued) return;
      queued = true;
      setImmediate(() => {
        queued = false;
        if (closed) return;
        showMenu(context, scheduler, info, selected, message);
      });
    }

    function detach(): void {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off('keypress', onKeypress);
    }

    function close(): void {
      closed = true;
      detach();
      clearConsole();
      console.log('ClaudeDeck closed.');
      resolve();
    }

    async function runSelected(): Promise<void> {
      const item = MENU_ITEMS[selected];
      if (!item) return;
      if (item.choice === EXIT_CHOICE) {
        close();
        return;
      }
      busy = true;
      process.stdin.setRawMode(false);
      process.stdout.write('\n');
      try {
        await actions.execute(item.choice);
        info = scheduler.summary(context);
        process.stdin.setRawMode(true);
        busy = false;
        render(color(item.code, `Done: ${item.label}`));
      } catch (error) {
        detach();
        reject(error);
      }
    }

    function onKeypress(value: string, key: readline.Key = {}): void {
      if (busy) return;
      if (key.ctrl && key.name === 'c') {
        close();
        return;
      }
      if (key.name === 'up') {
        selected = selected === 0 ? MENU_ITEMS.length - 1 : selected - 1;
        render('');
        return;
      }
      if (key.name === 'down') {
        selected = selected === MENU_ITEMS.length - 1 ? 0 : selected + 1;
        render('');
        return;
      }
      if (key.name === 'return' || key.name === 'enter' || key.name === 'space') {
        void runSelected();
        return;
      }
      if (key.name === 'escape' || String(value).toLowerCase() === 'q') close();
    }

    process.stdin.on('keypress', onKeypress);
    showMenu(context, scheduler, info, selected);
  });
}
