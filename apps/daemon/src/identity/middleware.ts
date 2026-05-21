// Express middleware that resolves Identity once per request and attaches
// it to `req.identity`. Consumers (chat-run lifecycle, message attribution,
// post-run history commits) read through `req.identity` instead of
// resolving from scratch.
//
// Identity is needed at multiple write boundaries during a single run
// (message upsert, agent run start, post-run commit). Resolving once at
// middleware time and propagating via the durable `run` object — which
// outlives the HTTP request — avoids subtle "identity changed mid-run"
// bugs and removes the need for AsyncLocalStorage (which the daemon
// doesn't use anywhere else).

import type { Request, RequestHandler } from 'express';
import { resolveIdentity, type Identity } from './types.js';

// Augment Express's Request interface so `req.identity` is typed
// everywhere it's read. This is the daemon's only Request augmentation
// today; co-locating it with the middleware that sets it keeps the
// type and the assignment in one file.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Resolved Identity for this request. Populated by the identity
       * middleware (apps/daemon/src/identity/middleware.ts) early in
       * the middleware chain; undefined only if the middleware hasn't
       * run yet (e.g., in a handler registered before the middleware
       * was wired).
       */
      identity?: Identity;
    }
  }
}

/**
 * Create the identity-resolution middleware. Resolves once per request,
 * attaches the result to `req.identity`, and calls `next()` without
 * blocking — identity resolution is fast (env-var reads only, today)
 * and shouldn't fail.
 *
 * Pass an explicit env for tests; defaults to process.env in production.
 * The factory pattern matches the daemon's other middleware-construction
 * conventions and makes the middleware trivially mockable.
 */
export function createIdentityMiddleware(
  env: NodeJS.ProcessEnv = process.env,
): RequestHandler {
  return (req: Request, _res, next) => {
    req.identity = resolveIdentity(req, env);
    next();
  };
}
