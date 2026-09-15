const readline = require('readline');
const { clearConsole, color, menuItems, showMenu } = require('./ui');

async function runLineMenu(context, platform, actions) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = question => new Promise(resolve => rl.question(question, resolve));
  try {
    while (true) {
      showMenu(context, platform, platform.summary(context));
      const choice = (await ask('Choose: ')).trim();
      if (choice === '0') return;
      await actions.execute(choice);
    }
  } finally {
    rl.close();
  }
}

async function runInteractive(context, platform, actions) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    await runLineMenu(context, platform, actions);
    return;
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  let selected = 0;
  let busy = false;
  let info = platform.summary(context);
  let message = '';
  let queued = false;
  let closed = false;

  await new Promise((resolve, reject) => {
    function render(nextMessage = message) {
      message = nextMessage;
      if (closed) return;
      if (queued) return;
      queued = true;
      setImmediate(() => {
        queued = false;
        if (closed) return;
        showMenu(context, platform, info, selected, message);
      });
    }

    function close() {
      closed = true;
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off('keypress', onKeypress);
      clearConsole();
      console.log('ClaudeDeck closed.');
      resolve();
    }

    async function runSelected() {
      const item = menuItems[selected];
      if (item.choice === '0') {
        close();
        return;
      }
      busy = true;
      process.stdin.setRawMode(false);
      process.stdout.write('\n');
      try {
        await actions.execute(item.choice);
        info = platform.summary(context);
        process.stdin.setRawMode(true);
        busy = false;
        render(color(item.code, `Done: ${item.label}`));
      } catch (err) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.off('keypress', onKeypress);
        reject(err);
      }
    }

    function onKeypress(value, key = {}) {
      if (busy) return;
      if (key.ctrl && key.name === 'c') {
        close();
        return;
      }
      if (key.name === 'up') {
        selected = selected === 0 ? menuItems.length - 1 : selected - 1;
        render('');
        return;
      }
      if (key.name === 'down') {
        selected = selected === menuItems.length - 1 ? 0 : selected + 1;
        render('');
        return;
      }
      if (key.name === 'return' || key.name === 'enter' || key.name === 'space') {
        runSelected();
        return;
      }
      if (key.name === 'escape' || String(value).toLowerCase() === 'q') {
        close();
      }
    }

    process.stdin.on('keypress', onKeypress);
    showMenu(context, platform, info, selected);
  });
}

module.exports = {
  runInteractive,
};
