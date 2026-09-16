import { IAliasBody, IInstallBody, IPanelService, IScheduleDraft, ISharingBody } from './interfaces';

export type RouteHandler = (body: Record<string, unknown>) => unknown;

export function buildRoutes(service: IPanelService): Record<string, RouteHandler> {
  return {
    '/api/state': () => service.state(),
    '/api/ping': () => ({ ok: true }),
    '/api/schedule/save': body => service.saveSchedule(body as IScheduleDraft),
    '/api/schedule/start': () => service.startBackground(),
    '/api/schedule/stop': () => service.stopBackground(),
    '/api/schedule/run': () => service.runNow(),
    '/api/schedule/log': () => service.readLog(),
    '/api/accounts/sync': body => service.syncCurrent(body as IInstallBody),
    '/api/accounts/switch': body => service.switchAccount(body as IAliasBody),
    '/api/accounts/forget': body => service.forgetAccount(body as IAliasBody),
    '/api/accounts/sharing': body => service.setSharing(body as ISharingBody),
  };
}
