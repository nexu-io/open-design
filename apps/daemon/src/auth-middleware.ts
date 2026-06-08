import type { Request, Response, NextFunction } from "express";
import { effectivePeerFromReq, isLoopbackAddress } from "./proxy-trust.js";

export interface AuthMiddlewareOptions {
  enabledRef: { value: boolean };
  networkExposed: boolean;
  isLocalPeer: (ip: string | undefined) => boolean;
  resolveHashes: () => Promise<string[]>;
  verifyKey: (candidate: string, hashes: string[]) => boolean;
  resolveSession: (token: string) => boolean;
  extractSessionCookie: (cookieHeader: string | undefined) => string | null;
}

const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/ready",
  "/api/version",
  "/login",
  "/app-icon.svg",
  "/logo.svg",
]);

function isPublicPath(path: string, method: string): boolean {
  if (method === "OPTIONS") return true;
  if (PUBLIC_PATHS.has(path)) return true;
  if (path === "/api/auth/login" && method === "POST") return true;
  if (path === "/api/auth/logout" && method === "POST") return true;
  if (path === "/api/auth/reset-keys" && method === "POST") return true;
  if (path === "/api/mcp/oauth/callback" && method === "GET") return true;
  return false;
}

/**
 * Creates an authentication middleware with two modes:
 *
 * 1. Keys exist (`enabled` = true): ALL requests must carry a valid API key
 *    or session cookie, including from localhost. This prevents tunnel proxies
 *    from bypassing auth.
 *
 * 2. No keys but network-exposed (`enabled` = false, `networkExposed` = true):
 *    localhost is allowed through (so the admin can generate keys from
 *    Settings). Non-loopback requests are redirected to /login — since no
 *    keys exist, external devices cannot authenticate and remain locked out.
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  if (!options.enabledRef.value && !options.networkExposed) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    if (isPublicPath(req.path, req.method)) return next();

    // No keys configured — allow localhost, block everyone else.
    // Use effectivePeer so a same-host proxy with OD_TRUST_PROXY=1
    // cannot bypass auth when XFF shows a remote client. When proxy trust
    // is enabled and XFF is missing, effectivePeerFromReq returns '' —
    // fail closed so a misconfigured proxy cannot open the bootstrap path
    // to remote clients. Bootstrap routes (/login, /api/auth/reset-keys)
    // are public paths that bypass this middleware entirely and check
    // req.socket.remoteAddress directly in server.ts.
    if (!options.enabledRef.value) {
      const peer = effectivePeerFromReq(req);
      if (options.isLocalPeer(peer)) return next();
      return rejectRequest(req, res, "No API keys configured — access from localhost only");
    }

    // Keys exist — authenticate via header or session cookie.
    const candidate = extractKey(req);
    if (candidate) {
      const hashes = await options.resolveHashes();
      if (options.verifyKey(candidate, hashes)) return next();
      return rejectRequest(req, res, "Invalid API key");
    }

    const cookieToken = options.extractSessionCookie(req.headers.cookie);
    if (cookieToken && options.resolveSession(cookieToken)) {
      return next();
    }

    return rejectRequest(req, res, "API key required");
  };
}

function rejectRequest(req: Request, res: Response, reason: string) {
  const acceptsHtml = req.headers.accept?.includes("text/html");
  if (acceptsHtml) {
    const next = req.originalUrl || req.url;
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    res.redirect(302, `/login?next=${encodeURIComponent(safeNext)}`);
    return;
  }
  res.setHeader("WWW-Authenticate", 'Bearer realm="Open Design Daemon"');
  res.status(401).json({ error: "UNAUTHORIZED", reason });
}

function extractKey(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const xKey = req.headers["x-api-key"];
  if (typeof xKey === "string") return xKey.trim();
  return null;
}
