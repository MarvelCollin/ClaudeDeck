import { IMenuItem, IMenuTheme } from '../interfaces';

export const REPO_URL = 'https://github.com/MarvelCollin/ClaudeDeck';

export const MENU_ITEMS: readonly IMenuItem[] = [
  { label: 'Configure Schedule', choice: 'config', code: '33' },
  { label: 'Run Background', choice: 'background', code: '32' },
  { label: 'Stop Background', choice: 'stop-background', code: '31' },
  { label: 'Run once now', choice: 'run', code: '36' },
  { label: 'Open log', choice: 'log', code: '35' },
  { label: 'Open Control Panel', choice: 'web', code: '34' },
  { label: 'Exit', choice: '0', code: '90' },
];

export const TITLE_ART = [
  ' ██████ ██       █████  ██   ██ ██████  ███████ ██████  ███████  ██████ ██   ██',
  '██      ██      ██   ██ ██   ██ ██   ██ ██      ██   ██ ██      ██      ██  ██ ',
  '██      ██      ███████ ██   ██ ██   ██ █████   ██   ██ █████   ██      █████  ',
  '██      ██      ██   ██ ██   ██ ██   ██ ██      ██   ██ ██      ██      ██  ██ ',
  ' ██████ ███████ ██   ██  ██████ ██████  ███████ ██████  ███████  ██████ ██   ██',
];

export const UI_WIDTH = Math.max(...TITLE_ART.map(line => line.length));
export const CONTENT_WIDTH = UI_WIDTH - 4;

export const THEME: IMenuTheme = {
  border: '38;2;91;111;143',
  title: '38;2;102;217;232',
  label: '38;2;148;163;184',
  text: '38;2;226;232;240',
  muted: '38;2;100;116;139',
  selected: '1;38;2;103;232;249',
};

export function color(code: string, value: string | number): string {
  if (!process.stdout.isTTY) return String(value);
  return `\x1b[${code}m${value}\x1b[0m`;
}

export function link(label: string, url: string): string {
  if (!process.stdout.isTTY) return label;
  return `\x1b]8;;${url}\x1b\\${label}\x1b]8;;\x1b\\`;
}

export function stripColor(value: string): string {
  return String(value)
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\x1b]8;;[^\x1b]*\x1b\\/g, '');
}

export function padText(value: string, width: number): string {
  const text = String(value);
  return text + ' '.repeat(Math.max(0, width - stripColor(text).length));
}

export function clearConsole(): void {
  if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[H');
}
