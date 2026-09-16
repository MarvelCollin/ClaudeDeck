import fs from 'node:fs';
import path from 'node:path';
import { RunCounts } from '../types';

const EMPTY_COUNTS: RunCounts = { runs: 0, success: 0, failed: 0, incomplete: 0 };

function readText(file: string): string {
  return fs.readFileSync(file, 'utf8').replace(/\0/g, '');
}

export function appendLog(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, text, 'utf8');
}

export function logCounts(file: string): RunCounts {
  if (!fs.existsSync(file)) return { ...EMPTY_COUNTS };
  const text = readText(file);
  const runs = (text.match(/^\[.+\] start\r?$/gm) || []).length;
  const success = (text.match(/^\[.+\] exit 0\r?$/gm) || []).length;
  const failed = (text.match(/^\[.+\] exit (?!0\r?$)\d+\r?$/gm) || []).length;
  return { runs, success, failed, incomplete: runs - success - failed };
}

export function lastRunTime(file: string): string {
  if (!fs.existsSync(file)) return '-';
  const matches = [...readText(file).matchAll(/^\[(.+)\] start\r?$/gm)];
  const latest = matches[matches.length - 1]?.[1];
  if (!latest) return '-';
  const date = new Date(latest);
  return Number.isNaN(date.getTime()) ? latest : date.toLocaleString();
}

export function readLogLines(file: string, limit = 400): string[] {
  if (!fs.existsSync(file)) return [];
  return readText(file).split(/\r?\n/).filter(Boolean).slice(-limit);
}
