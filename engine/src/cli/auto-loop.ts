import { createAutoSwitch, defaultAutoDeps } from '../accounts/auto-switch';
import { createSwitcher } from '../accounts/switcher';

export async function runAutoLoop(): Promise<void> {
  const auto = createAutoSwitch(defaultAutoDeps(createSwitcher()));
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  await auto.run(() => undefined, controller.signal);
}
