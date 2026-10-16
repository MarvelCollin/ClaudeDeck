import { IScheduler } from '../core/interfaces';
import { macosScheduler } from './macos';
import { windowsScheduler } from './windows';

export function selectScheduler(platform: NodeJS.Platform = process.platform): IScheduler {
  if (platform === 'win32') return windowsScheduler;
  if (platform === 'darwin') return macosScheduler;
  throw new Error('Only Windows and macOS are supported.');
}

export { macosScheduler, windowsScheduler };
