import type { Express } from 'express';

export interface RouteRegistration {
  method: string;
  path: string;
}

const routeInventorySymbol = Symbol.for('open-design.routeInventory');

const guardedRouteKeys = new Set([
  'POST /api/projects/:id/export/pdf',
  'POST /api/projects/:id/media/generate',
]);

const guardedMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'all', 'use'] as const;

export function guardedRouteKey(method: string, path: unknown): string | null {
  if (typeof path !== 'string') return null;
  const key = `${method.toUpperCase()} ${path}`;
  return guardedRouteKeys.has(key) ? key : null;
}

export function installRouteRegistrationGuard(app: Express): void {
  const seen = new Set<string>();
  const inventory: RouteRegistration[] = [];
  (app as unknown as { [routeInventorySymbol]: RouteRegistration[] })[routeInventorySymbol] = inventory;

  for (const method of guardedMethods) {
    const original = (app as any)[method].bind(app) as (...args: unknown[]) => unknown;
    (app as any)[method] = (path: unknown, ...handlers: unknown[]) => {
      if (typeof path === 'string') {
        inventory.push({ method: method.toUpperCase(), path });
      }
      const key = guardedRouteKey(method, path);
      if (key) {
        if (seen.has(key)) {
          throw new Error(`duplicate guarded route registration: ${key}`);
        }
        seen.add(key);
      }
      return original(path, ...handlers);
    };
  }
}

export function getRouteRegistrationInventory(app: Express): RouteRegistration[] {
  return [
    ...((app as unknown as { [routeInventorySymbol]?: RouteRegistration[] })[routeInventorySymbol] ?? []),
  ];
}
