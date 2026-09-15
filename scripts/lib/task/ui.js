const repoUrl = 'https://github.com/MarvelCollin/ClaudeCron';

const menuItems = [
  { label: 'Configure Schedule', choice: 'config', code: '33' },
  { label: 'Run Background', choice: 'background', code: '32' },
  { label: 'Stop Background', choice: 'stop-background', code: '31' },
  { label: 'Run once now', choice: 'run', code: '36' },
  { label: 'Open log', choice: 'log', code: '35' },
  { label: 'Open Control Panel', choice: 'web', code: '34' },
  { label: 'Exit', choice: '0', code: '90' },
];

const titleArt = [
  "   ______  __                        __          ______                           ",
  " .' ___  |[  |                      |  ]       .' ___  |                          ",
  "/ .'   \\_| | |  ,--.  __   _    .--.| | .---. / .'   \\_| _ .--.   .--.   _ .--.   ",
  "| |        | | `'_\\ :[  | | | / /'`\\' |/ /__\\\\| |       [ `/'`\\]/ .'`\\ \\[ `.-. |  ",
  "\\ `.___.'\\ | | // | |,| \\_/ |,| \\__/  || \\__.,\\ `.___.'\\ | |    | \\__. | | | | |  ",
  " `.____ .'[___]\\'-;__/'.__.'_/ '.__.;__]'.__.' `.____ .'[___]    '.__.' [___||__] ",
];

const uiWidth = Math.max(...titleArt.map(line => line.length));
const contentWidth = uiWidth - 4;
const theme = {
  border: '38;2;91;111;143',
  title: '38;2;102;217;232',
  label: '38;2;148;163;184',
  text: '38;2;226;232;240',
  muted: '38;2;100;116;139',
  selected: '1;38;2;103;232;249',
};

function color(code, value) {
  if (!process.stdout.isTTY) return value;
  return `\x1b[${code}m${value}\x1b[0m`;
}

function link(label, url) {
  if (!process.stdout.isTTY) return label;
  return `\x1b]8;;${url}\x1b\\${label}\x1b]8;;\x1b\\`;
}

function stripColor(value) {
  return String(value)
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\x1b]8;;[^\x1b]*\x1b\\/g, '');
}

function padText(value, width) {
  const text = String(value);
  return text + ' '.repeat(Math.max(0, width - stripColor(text).length));
}

function statusText(value, activeCode) {
  return value ? color(activeCode, 'On') : color('31', 'Off');
}

function runningText(value) {
  return value ? color('33', 'Running') : color('32', 'Not running');
}

function countText(info) {
  return [
    `${color('36', info.counts.runs)} total`,
    `${color('32', info.counts.success)} success`,
    `${color('31', info.counts.failed)} failed`,
    `${color('33', info.counts.incomplete)} incomplete`,
  ].join(', ');
}

function clearConsole() {
  if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[H');
}

function styledRow(value = '') {
  return padText(value, contentWidth);
}

function boxLine(left, fill, right) {
  return color(theme.border, `${left}${fill.repeat(uiWidth - 2)}${right}`);
}

function boxRow(value = '') {
  return `${color(theme.border, '|')} ${styledRow(value)} ${color(theme.border, '|')}`;
}

function blankRow() {
  return boxRow('');
}

function field(label, value, width = contentWidth) {
  return padText(`${color(theme.label, label.padEnd(12))} ${value}`, width);
}

function actionRow(item, selected) {
  const marker = selected ? color(theme.selected, '>') : color(theme.muted, ' ');
  const label = selected ? color(theme.selected, item.label) : color(item.code, item.label);
  return padText(`${marker} ${label}`, contentWidth);
}

function showMenu(context, platform, info, selected = 0, message = '') {
  const name = platform.name === 'macos' ? context.config.macLabel : context.config.taskName;
  clearConsole();
  for (const line of titleArt) console.log(color(theme.title, line));
  console.log('');
  console.log(boxLine('+', '-', '+'));
  console.log(boxRow(color('1;37', 'ClaudeCron Control Center')));
  console.log(blankRow());
  console.log(boxRow(field('Task', color(theme.text, name))));
  console.log(boxRow(field('Background', statusText(info.enabled, '32'))));
  console.log(boxRow(field('Current run', runningText(info.running))));
  console.log(boxRow(field('Last run', color(theme.text, info.lastRun))));
  console.log(boxRow(field('Next run', color(theme.text, info.nextRun))));
  console.log(boxRow(`${color(theme.label, 'Runs'.padEnd(12))} ${countText(info)}`));
  if (message) console.log(boxRow(`${color(theme.label, 'Status'.padEnd(12))} ${message}`));
  console.log(blankRow());
  console.log(boxRow(color('1;37', 'Choose Action')));
  for (let index = 0; index < menuItems.length; index += 1) {
    const item = menuItems[index];
    console.log(boxRow(actionRow(item, index === selected)));
  }
  console.log(blankRow());
  console.log(boxRow(`${color(theme.label, 'Repository'.padEnd(12))} ${color(theme.text, link('MarvelCollin/ClaudeCron', repoUrl))}`));
  console.log(boxRow(`${color(theme.label, 'Website'.padEnd(12))} ${color(theme.text, repoUrl)}`));
  console.log(boxRow(`${color(theme.label, 'Made by'.padEnd(12))} ${color(theme.text, 'Marvel Collin with \u2764\uFE0F')}`));
  console.log(blankRow());
  console.log(boxLine('+', '-', '+'));
  console.log(color('2', 'Use Up/Down, Enter/Space to select, Esc/Q to close.'));
}

module.exports = {
  clearConsole,
  color,
  menuItems,
  showMenu,
  theme,
};
