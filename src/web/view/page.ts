import fs from 'node:fs';
import path from 'node:path';
import { faviconHref, LOGO_SVG } from './logo';

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

const ASSET_DIR = path.join(__dirname, '..', 'assets');

const cache = new Map<string, string>();

function asset(name: string): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const text = fs.readFileSync(path.join(ASSET_DIR, name), 'utf8');
  cache.set(name, text);
  return text;
}

function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.split(key).join(value), template);
}

export function renderClientScript(token: string): string {
  return fill(asset('panel.js'), {
    __CLAUDEDECK_TOKEN__: token,
    __CLAUDEDECK_DAYS__: JSON.stringify(DAYS),
  });
}

export function renderPage(token: string): string {
  return fill(asset('panel.html'), {
    __CLAUDEDECK_FAVICON__: faviconHref(),
    __CLAUDEDECK_LOGO__: LOGO_SVG,
    __CLAUDEDECK_STYLES__: asset('panel.css'),
    __CLAUDEDECK_SCRIPT__: renderClientScript(token),
  });
}
