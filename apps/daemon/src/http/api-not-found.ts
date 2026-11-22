import type { Express, Request } from 'express';

import { getRouteRegistrationInventory } from '../route-registration-guard.js';
import { createCompatApiErrorResponse } from './api-errors.js';
import { recordApiFailure } from './api-failure-journal.js';

/** First path segments under `/api/` that the daemon's own routes declare. */
function declaredApiNamespaces(app: Express): Set<string> {
  const namespaces = new Set<string>();
  for (const { path } of getRouteRegistrationInventory(app)) {
    const namespace = /^\/api\/([\w-]+)(?:\/|$)/u.exec(path)?.[1];
    if (namespace) namespaces.add(namespace);
  }
  return namespaces;
}

/**
 * Journal path for a request no route matched. Only a declared top-level
 * namespace survives; every caller-controlled segment is dropped.
 */
export function unmatchedApiPathShape(apiRelativePath: string, namespaces: ReadonlySet<string>): string {
  const namespace = apiRelativePath.split('/').find(Boolean);
  return namespace && namespaces.has(namespace) ? `/api/:unmatched/${namespace}` : '/api/:unmatched';
}

/**
 * Terminal `/api` handler: a request no route matched gets a structured 404
 * and a journal entry, instead of Express's HTML default that diagnostics
 * never see. Register it after every API route.
 */
export function registerApiNotFoundFallback(app: Express): void {
  const namespaces = declaredApiNamespaces(app);
  app.use('/api', (req: Request, res, next) => {
    // Express answers OPTIONS with an Allow header only once the stack falls through.
    if (req.method === 'OPTIONS') return next();
    const status = 404;
    const code = 'NOT_FOUND';
    recordApiFailure({
      at: new Date().toISOString(),
      request: req,
      routeTemplate: unmatchedApiPathShape(req.path, namespaces),
      status,
      code,
      retryable: false,
    });
    // The caller sees its own path (query excluded); only the shape above is journaled.
    res.status(status).json(createCompatApiErrorResponse(code, `No API route for ${req.method} ${req.baseUrl}${req.path}`));
  });
}
