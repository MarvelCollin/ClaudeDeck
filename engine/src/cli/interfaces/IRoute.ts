export type RouteKind = 'help' | 'menu' | 'web' | 'task';

export interface IRoute {
  kind: RouteKind;
  args: string[];
}
