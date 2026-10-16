export type RouteKind = 'help' | 'web' | 'task';

export interface IRoute {
  kind: RouteKind;
  args: string[];
}
