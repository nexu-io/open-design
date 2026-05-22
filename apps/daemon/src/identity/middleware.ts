// Express middleware that resolves Identity once per request and
// attaches it to `req.identity`. Consumers (chat-run lifecycle,
// message attribution, post-run history commits) read through
// `req.identity` instead of resolving from scratch.
//
// Resolving once at middleware time and propagating via the durable
// `run` object (which outlives the HTTP request) avoids subtle
// "identity changed mid-run" bugs without needing AsyncLocalStorage.

import type { Request, RequestHandler } from 'express';
import { resolveIdentity, type Identity } from './types.js';

// Augment Express's Request interface so `req.identity` is typed
// everywhere it's read. Co-located with the middleware that sets it.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Resolved Identity for this request. Populated by the identity
       * middleware; undefined only if the middleware hasn't run yet
       * (e.g., a handler registered before the middleware was wired).
       */
      identity?: Identity;
    }
  }
}

/**
 * Create the identity-resolution middleware. Resolves once per
 * request and attaches the result to `req.identity`. Identity
 * resolution is fast (env-var reads only, today) and shouldn't fail.
 *
 * Pass an explicit env for tests; defaults to process.env in production.
 */
export function createIdentityMiddleware(
  env: NodeJS.ProcessEnv = process.env,
): RequestHandler {
  return (req: Request, _res, next) => {
    req.identity = resolveIdentity(req, env);
    next();
  };
}
