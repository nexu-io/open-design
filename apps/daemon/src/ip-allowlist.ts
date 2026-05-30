import type { Request, Response, NextFunction } from "express";
import { effectivePeerFromReq, isLoopbackAddress } from "./proxy-trust.js";

/**
 * Creates an IP allowlist middleware. When `allowedHosts` is non-empty and
 * the daemon is bound to a non-loopback address, only IPs matching the
 * allowlist (plus loopback) are permitted. When `allowedHosts` is empty,
 * all connections are allowed.
 *
 * Entries may be plain IPs ("192.168.1.5") or CIDR ranges
 * ("192.168.1.0/24"). Loopback addresses (127.0.0.1, ::1) are always
 * allowed so local tools-dev and the desktop app are never locked out.
 *
 * **IPv6 limitation:** Only IPv4 addresses are supported. IPv6 entries
 * (e.g. `fd00::1`, `fe80::1`) are silently ignored with a console
 * warning. For IPv6-heavy networks, use Tailscale (which provides IPv4
 * CGNAT addresses) or a reverse proxy that normalizes to IPv4.
 */
export function createIpAllowlistMiddleware(allowedHosts: string[]) {
  if (allowedHosts.length === 0) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  const entries = allowedHosts.map(parseEntry);

  return (req: Request, res: Response, next: NextFunction) => {
    // Direct-loopback bypass: when the TCP peer is loopback, always allow
    // regardless of proxy-trust state. This preserves localhost bootstrap
    // when OD_TRUST_PROXY=1 and no X-Forwarded-For is present (where
    // effectivePeerFromReq would return '').
    if (isLoopbackAddress(req.socket?.remoteAddress)) return next();

    const clientIp = effectivePeerFromReq(req);

    if (isLoopbackAddress(clientIp)) return next();

    const allowed = entries.some((entry) => entry.matches(clientIp));
    if (!allowed) {
      const normalized = clientIp.startsWith("::ffff:") ? clientIp.slice(7) : clientIp;
      console.warn(`[od] ip-allowlist: blocked ${normalized} (not in [${allowedHosts.join(", ")}])`);
      res.status(403).json({ error: "FORBIDDEN", reason: "IP not in allowlist" });
      return;
    }
    next();
  };
}

interface IpMatcher {
  matches(ip: string): boolean;
}

function parseEntry(raw: string): IpMatcher {
  const trimmed = raw.trim();
  if (trimmed.includes(':')) {
    console.warn(`[od] ip-allowlist: IPv6 entry "${trimmed}" is not supported — entry ignored. Use Tailscale (IPv4 CGNAT) or a reverse proxy that normalizes to IPv4.`);
    return { matches: () => false };
  }
  if (trimmed.includes("/")) {
    const parts = trimmed.split("/");
    const network = parts[0] ?? "";
    const bits = parseInt(parts[1] ?? "0", 10);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) {
      console.warn(`[od] ip-allowlist: invalid CIDR "${trimmed}" — bits must be 0-32, entry ignored`);
      return { matches: () => false };
    }
    return {
      matches(ip: string) {
        const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
        return isInCidr(normalized, network, bits);
      },
    };
  }
  // Plain IP — treat as /32
  return {
    matches(ip: string) {
      const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
      return isInCidr(normalized, trimmed, 32);
    },
  };
}

function isInCidr(ip: string, network: string, bits: number): boolean {
  const ipNum = ipToNum(ip);
  const netNum = ipToNum(network);
  if (ipNum === null || netNum === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (netNum & mask);
}

function ipToNum(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) return null;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}
