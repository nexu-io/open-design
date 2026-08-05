import net from 'node:net';
import { randomUUID } from 'node:crypto';

export interface LocalAuthority {
  hostname: string;
  port: string;
}

export interface ProjectPreviewScopeRegistry {
  mint(projectId: string): string;
  validate(projectId: string, scope: string): boolean;
}

const PROJECT_PREVIEW_SCOPE_TTL_MS = 60 * 60 * 1000;
const PROJECT_PREVIEW_ASSET_PATH_RE = /^\/projects\/([^/]+)\/preview\/([^/]+)\/.+$/u;

export function normalizeLocalAuthority(value: unknown): LocalAuthority | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /[\s/@]/.test(trimmed) || trimmed.includes(',')) return null;

  try {
    const parsed = new URL(`http://${trimmed}`);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname || parsed.username || parsed.password || parsed.pathname !== '/') return null;
    return { hostname, port: parsed.port };
  } catch {
    return null;
  }
}

export function isLoopbackHostname(hostname: unknown): boolean {
  const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (normalized === 'localhost') return true;
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
  if (net.isIP(normalized) === 4) return normalized === '127.0.0.1' || normalized.startsWith('127.');
  return false;
}

export function isLoopbackPeerAddress(address: unknown): boolean {
  if (typeof address !== 'string') return false;
  const normalized = address.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!normalized) return false;
  if (normalized.startsWith('::ffff:')) return isLoopbackPeerAddress(normalized.slice('::ffff:'.length));
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
  if (net.isIP(normalized) === 4) return normalized === '127.0.0.1' || normalized.startsWith('127.');
  return false;
}

export function createProjectPreviewScopeRegistry(): ProjectPreviewScopeRegistry {
  const scopes = new Map<string, { projectId: string; expiresAt: number }>();

  function pruneExpired(now = Date.now()): void {
    for (const [scope, entry] of scopes) {
      if (entry.expiresAt <= now) scopes.delete(scope);
    }
  }

  return {
    mint(projectId: string): string {
      pruneExpired();
      const scope = randomUUID();
      scopes.set(scope, {
        projectId: String(projectId),
        expiresAt: Date.now() + PROJECT_PREVIEW_SCOPE_TTL_MS,
      });
      return scope;
    },
    validate(projectId: string, scope: string): boolean {
      const key = String(scope || '');
      const entry = scopes.get(key);
      if (!entry) return false;
      if (entry.expiresAt <= Date.now()) {
        scopes.delete(key);
        return false;
      }
      return entry.projectId === String(projectId);
    },
  };
}

export function parseProjectPreviewAssetPath(
  pathname: unknown,
): { projectId: string; scope: string } | null {
  const match = PROJECT_PREVIEW_ASSET_PATH_RE.exec(String(pathname || ''));
  if (!match) return null;
  try {
    return {
      projectId: decodeURIComponent(match[1]!),
      scope: match[2]!,
    };
  } catch {
    return null;
  }
}

export function localOriginFromHeader(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'null' || trimmed.includes(',')) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) return null;
    if (!isLoopbackHostname(parsed.hostname)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}
