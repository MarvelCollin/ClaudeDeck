import path from 'node:path';
import { readJsonFile } from '../core/fs/json';
import { cswapDataDir } from './cswap-sync';
import { ICswapPin } from './interfaces';

export const CSWAP_DEFAULT_THRESHOLD = 90;
export const CSWAP_MAX_PERCENT = 100;

export function readCswapPin(dir: string = cswapDataDir()): ICswapPin | null {
  const state = readJsonFile<{ cliPin?: { email?: unknown; max?: unknown } }>(path.join(dir, 'autoswitch_state.json'));
  const email = state?.cliPin?.email;
  if (typeof email !== 'string' || !email) return null;
  if (state?.cliPin?.max === true) return { email, untilPercent: CSWAP_MAX_PERCENT };
  const settings = readJsonFile<{ autoswitch?: { threshold?: unknown } }>(path.join(dir, 'settings.json'));
  const threshold = settings?.autoswitch?.threshold;
  const untilPercent = typeof threshold === 'number' && Number.isFinite(threshold) ? threshold : CSWAP_DEFAULT_THRESHOLD;
  return { email, untilPercent };
}
