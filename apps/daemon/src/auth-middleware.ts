import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Creates an API key authentication middleware. When `enabled` is true,
 * non-loopback requests must carry a valid API key via the
 * `Authorization: Bearer <key>` or `X-API-Key: <key>` header.
 *
 * Loopback requests, health checks, and CORS preflights are always allowed
 * so local tools-dev and the desktop app continue to work without keys.
 */
export function createAuthMiddleware(options: {
  enabled: boolean;
  resolveKeys: () => Promise<string[]>;
}) {
  if (!options.enabled) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    if (isLoopback(req.socket.remoteAddress)) return next();
    if (isTailscale(req.socket.remoteAddress)) return next();
    if (req.method === "OPTIONS") return next();
    if (req.path === "/api/health") return next();

    const candidate = extractKey(req);
    if (!candidate) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="Open Design Daemon"');
      res.status(401).json({ error: "UNAUTHORIZED", reason: "API key required" });
      return;
    }

    const validKeys = await options.resolveKeys();
    const a = Buffer.from(candidate);
    const valid = validKeys.some((k) => {
      const b = Buffer.from(k);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
    if (!valid) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="Open Design Daemon"');
      res.status(401).json({ error: "UNAUTHORIZED", reason: "Invalid API key" });
      return;
    }

    next();
  };
}

function isLoopback(ip: string | undefined): boolean {
  if (!ip) return false;
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function isTailscale(ip: string | undefined): boolean {
  if (!ip) return false;
  const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) return false;
  const num = ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
  // 100.64.0.0/10 — CGNAT range used by Tailscale
  const mask = (~0 << 22) >>> 0;
  const network = ((100 << 24) | (64 << 16)) >>> 0;
  return (num & mask) === network;
}

function extractKey(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const xKey = req.headers["x-api-key"];
  if (typeof xKey === "string") return xKey.trim();
  return null;
}
