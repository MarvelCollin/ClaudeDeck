import { IConfigContext, IScheduler, ISchedulerSummary } from '../../core/interfaces';
import { IMenuItem } from '../interfaces';
import {
  clearConsole,
  color,
  CONTENT_WIDTH,
  link,
  MENU_ITEMS,
  padText,
  REPO_URL,
  THEME,
  TITLE_ART,
  UI_WIDTH,
} from './theme';

function statusText(value: boolean, activeCode: string): string {
  return value ? color(activeCode, 'On') : color('31', 'Off');
}

function runningText(value: boolean): string {
  return value ? color('33', 'Running') : color('32', 'Not running');
}

function countText(info: ISchedulerSummary): string {
  return [
    `${color('36', info.counts.runs)} total`,
    `${color('32', info.counts.success)} success`,
    `${color('31', info.counts.failed)} failed`,
    `${color('33', info.counts.incomplete)} incomplete`,
  ].join(', ');
}

function boxLine(left: string, fill: string, right: string): string {
  return color(THEME.border, `${left}${fill.repeat(UI_WIDTH - 2)}${right}`);
}

function boxRow(value = ''): string {
  return `${color(THEME.border, '|')} ${padText(value, CONTENT_WIDTH)} ${color(THEME.border, '|')}`;
}

function blankRow(): string {
  return boxRow('');
}

function field(label: string, value: string): string {
  return padText(`${color(THEME.label, label.padEnd(12))} ${value}`, CONTENT_WIDTH);
}

function actionRow(item: IMenuItem, selected: boolean): string {
  const marker = selected ? color(THEME.selected, '>') : color(THEME.muted, ' ');
  const label = selected ? color(THEME.selected, item.label) : color(item.code, item.label);
  return padText(`${marker} ${label}`, CONTENT_WIDTH);
}

export function showMenu(
  context: IConfigContext,
  scheduler: IScheduler,
  info: ISchedulerSummary,
  selected = 0,
  message = ''
): void {
  const name = scheduler.name === 'macos' ? context.config.macLabel : context.config.taskName;
  clearConsole();
  for (const line of TITLE_ART) console.log(color(THEME.title, line));
  console.log('');
  console.log(boxLine('+', '-', '+'));
  console.log(boxRow(color('1;37', 'ClaudeDeck Control Center')));
  console.log(blankRow());
  console.log(boxRow(field('Task', color(THEME.text, name))));
  console.log(boxRow(field('Background', statusText(info.enabled, '32'))));
  console.log(boxRow(field('Current run', runningText(info.running))));
  console.log(boxRow(field('Last run', color(THEME.text, info.lastRun))));
  console.log(boxRow(field('Next run', color(THEME.text, info.nextRun))));
  console.log(boxRow(`${color(THEME.label, 'Runs'.padEnd(12))} ${countText(info)}`));
  if (message) console.log(boxRow(`${color(THEME.label, 'Status'.padEnd(12))} ${message}`));
  console.log(blankRow());
  console.log(boxRow(color('1;37', 'Choose Action')));
  MENU_ITEMS.forEach((item, index) => console.log(boxRow(actionRow(item, index === selected))));
  console.log(blankRow());
  console.log(boxRow(`${color(THEME.label, 'Repository'.padEnd(12))} ${color(THEME.text, link('MarvelCollin/ClaudeDeck', REPO_URL))}`));
  console.log(boxRow(`${color(THEME.label, 'Website'.padEnd(12))} ${color(THEME.text, REPO_URL)}`));
  console.log(boxRow(`${color(THEME.label, 'Made by'.padEnd(12))} ${color(THEME.text, 'Marvel Collin with ❤️')}`));
  console.log(blankRow());
  console.log(boxLine('+', '-', '+'));
  console.log(color('2', 'Use Up/Down, Enter/Space to select, Esc/Q to close.'));
}
