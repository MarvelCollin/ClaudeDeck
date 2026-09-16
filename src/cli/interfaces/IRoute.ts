export type RouteKind = 'panel' | 'help' | 'menu' | 'web' | 'task';

export interface IRoute {
  kind: RouteKind;
  args: string[];
}
