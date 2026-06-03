import type { Express } from 'express';

const guardedRouteKeys = new Set([
  'POST /api/projects/:id/export/pdf',
  'POST /api/projects/:id/media/generate',
]);

const guardedMethods = ['get', 'post', 'put', 'patch', 'delete', 'options'] as const;

export function guardedRouteKey(method: string, path: unknown): string | null {
  if (typeof path !== 'string') return null;
  const key = `${method.toUpperCase()} ${path}`;
  return guardedRouteKeys.has(key) ? key : null;
}

export function installRouteRegistrationGuard(app: Express): void {
  const seen = new Set<string>();

  for (const method of guardedMethods) {
    const original = (app as any)[method].bind(app) as (...args: unknown[]) => unknown;
    (app as any)[method] = (path: unknown, ...handlers: unknown[]) => {
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
