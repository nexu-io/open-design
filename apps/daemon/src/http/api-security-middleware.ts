// Authors: Leon Aburime using Claude Fable 5
// @ts-nocheck — carried over verbatim from server.ts's file-level @ts-nocheck.
// Strangler-fig MOVE of startServer's /api security middleware; do NOT copy.
/** @module api-security-middleware
 * The daemon's /api security middleware, registered on the Express app by
 * startServer: (1) optional bearer-token auth (active only when OD_API_TOKEN
 * is set and auth isn't disabled; loopback + probe + preview-scope exempt),
 * and (2) the cross-origin guard (Origin:null sandboxed-iframe allowlist,
 * fail-closed until the port resolves, paired browser-extension origins).
 *
 * Extracted verbatim from startServer. Registered as two functions so the
 * designSystemServices setup that sits between them in server.ts keeps its
 * exact Express registration order. `deps.getResolvedPort` is a live getter
 * because server.ts reassigns `resolvedPort` after listen (mirrors the
 * daemonUrl getter pattern in start-chat-run).
 */

import { isApiTokenMiddlewareEnabled } from '../api-token-auth.js';
import { isLoopbackPeerAddress, parseProjectPreviewAssetPath } from '../daemon-request-guards.js';
import { libraryExtensionAllowedOrigins } from '../library-tokens.js';
import { allowedBrowserPorts, isAllowedBrowserOrigin, isZeroConfigClipperLibraryRequest } from '../origin-validation.js';

export function registerApiBearerAuthMiddleware(app: any, deps: any) {
  const { apiToken, projectPreviewScopes } = deps;
  // Plan §3.K1 — bearer-token middleware.
  //
  // Active only when OD_API_TOKEN is set and API auth is not disabled.
  // Loopback origins skip the
  // check (the desktop UI / local CLI never carry a bearer); every
  // other request must present `Authorization: Bearer <token>` with a
  // value matching `OD_API_TOKEN`. Health / readiness / version remain
  // open so monitoring probes don't need the token. Server-minted
  // project preview asset scopes are also accepted for GETs so sandboxed
  // browser iframes can load HTML/CSS/JS without privileged headers.
  // Rich daemon status stays authenticated because it includes local
  // runtime paths.
  if (isApiTokenMiddlewareEnabled()) {
    const openProbePaths = new Set([
      '/health',
      '/api/health',
      '/ready',
      '/api/ready',
      '/version',
      '/api/version',
    ]);
    app.use('/api', (req, res, next) => {
      if (openProbePaths.has(req.path)) return next();
      if (req.method === 'GET') {
        const previewAsset = parseProjectPreviewAssetPath(req.path);
        if (
          previewAsset &&
          projectPreviewScopes.validate(previewAsset.projectId, previewAsset.scope)
        ) {
          return next();
        }
      }
      // Loopback short-circuit. We ignore the proxied X-Forwarded-For
      // header here because a reverse proxy MUST always forward the
      // bearer; the loopback bypass exists for the localhost desktop
      // UI which has no proxy in the path.
      if (isLoopbackPeerAddress(req.socket?.remoteAddress)) return next();
      const auth = req.get('authorization') ?? '';
      const match = /^Bearer\s+(\S+)\s*$/i.exec(auth);
      if (!match || match[1] !== apiToken) {
        return res.status(401).json({
          error: { code: 'API_TOKEN_REQUIRED', message: 'Authorization: Bearer <OD_API_TOKEN> required' },
        });
      }
      return next();
    });
  }
}

export function registerApiOriginGuardMiddleware(app: any, deps: any) {
  const { host, extraAllowedOrigins, getResolvedPort } = deps;
  // Chrome may strip the port from the Origin header on same-origin GET
  // requests. Only use this as a fallback for safe, idempotent GET requests;
  // mutating routes always require an exact origin/host match.
  function isPortlessLoopbackOrigin(origin) {
    return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])$/.test(origin);
  }

  // Routes that serve content to sandboxed iframes (Origin: null) for
  // read-only purposes.  All other /api routes reject Origin: null.
  const _NULL_ORIGIN_SAFE_GET_RE =
    /^\/projects\/[^/]+\/(?:raw|preview)\/|^\/codex-pets\/[^/]+\/spritesheet$|^\/asset-cache$/;

  // Reject cross-origin requests to API endpoints.
  // Health/version remain open for monitoring probes.
  // Non-browser clients (no Origin header) are always allowed.
  app.use('/api', (req, res, next) => {
    // Live artifact previews have stricter local-daemon validation and
    // loopback CORS handling on the route itself. Let that middleware produce
    // the structured error shape and preflight headers for preview embeds.
    if (/^\/live-artifacts\/[^/]+\/preview$/.test(req.path)) return next();

    // Zero-config browser extension: the OD Clipper only needs a liveness probe
    // plus POST /api/library/ingest. A web page cannot forge a
    // chrome-extension:// (or moz-extension://) origin, and the daemon is
    // loopback-bound, so these two bootstrap routes are auto-trusted without a
    // pairing handshake. Library read routes still fall through to the normal
    // origin guard.
    // NOTE: `req.path` here is mount-relative (the `/api` prefix is stripped),
    // so the predicate matches `/library/ingest`, not `/api/library/ingest`.
    if (isZeroConfigClipperLibraryRequest(req.method, req.path, req.headers.origin)) {
      return next();
    }

    const origin = req.headers.origin;
    // Non-browser client → allow.
    if (origin == null || origin === '') return next();

    // Origin: null (sandboxed iframes).  Only allowed for safe, read-only
    // routes that set their own CORS headers for canvas drawing.
    if (origin === 'null') {
      const isSafeReadOnly =
        req.method === 'GET' && _NULL_ORIGIN_SAFE_GET_RE.test(req.path);
      if (!isSafeReadOnly) {
        return res.status(403).json({ error: 'Origin: null not allowed for this route' });
      }
      return next();
    }

    // Fail-closed: block all browser origins until port is resolved.
    if (!getResolvedPort()) {
      return res.status(403).json({ error: 'Server initializing' });
    }

    const ports = allowedBrowserPorts(getResolvedPort());
    // Paired browser-extension origins are persisted in library_tokens and
    // seeded into this in-memory allowlist at boot / on pairing.
    const allowedOrigins = [...extraAllowedOrigins, ...libraryExtensionAllowedOrigins()];
    if (!isAllowedBrowserOrigin(origin, req.headers.host, ports, host, allowedOrigins)) {
      if (req.method !== 'GET' || !isPortlessLoopbackOrigin(String(origin))) {
        return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
      }
    }
    next();
  });
}
