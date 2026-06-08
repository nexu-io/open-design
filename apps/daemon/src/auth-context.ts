import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const DEFAULT_TRUSTED_EMAIL_HEADER = 'cf-access-authenticated-user-email';

export interface DaemonUser {
  readonly email: string;
  readonly dirHash: string;
  readonly dataDir: string;
  readonly source: 'trusted-header' | 'dev-fallback';
}

export interface AuthenticatedRequest extends Request {
  user?: DaemonUser;
}

export interface AuthContextOptions {
  /** Root data dir; per-user dirs are resolved under `<baseDataDir>/users/`. */
  baseDataDir: string;
  /**
   * When true, requests without a trusted identity header are rejected.
   * When false, missing identity falls back to `devUser` for local use.
   * Defaults to `OD_MULTITENANT=1`.
   */
  multitenant?: boolean;
  /** Email used when no identity header is present and multitenant=false. */
  devUser?: string;
  /** Optional explicit email allowlist. */
  allowlist?: ReadonlySet<string>;
  /** Project root, used to discover `config/allowlist.txt` when present. */
  projectRoot?: string;
  /** Header whose value contains the authenticated user email. */
  headerName?: string;
  /** Paths inside the mounted middleware that should stay unauthenticated. */
  publicPaths?: readonly string[] | ReadonlySet<string>;
}

export interface AuthContextMiddleware extends RequestHandler {
  /** Derive the same user shape the middleware attaches to requests. */
  resolveUser(email: string): DaemonUser;
  /** True when requests without a trusted identity header are rejected. */
  multitenant: boolean;
  /** The local-development fallback user attached when multitenant=false. */
  devUser: DaemonUser;
}

export function normalizeDaemonEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || /\s/.test(email)) return null;
  const pieces = email.split('@');
  if (pieces.length !== 2 || !pieces[0] || !pieces[1]) return null;
  return email;
}

function normalizeHeaderName(value: string | undefined): string {
  const headerName = (value ?? DEFAULT_TRUSTED_EMAIL_HEADER).trim().toLowerCase();
  if (!headerName || /[\s:]/.test(headerName)) {
    throw new Error('auth context headerName must be a valid HTTP header name');
  }
  return headerName;
}

function normalizeAllowlist(
  allowlist: ReadonlySet<string> | undefined,
): ReadonlySet<string> | undefined {
  if (!allowlist) return undefined;
  const normalized = new Set<string>();
  for (const entry of allowlist) {
    const email = normalizeDaemonEmail(entry);
    if (email) normalized.add(email);
  }
  return normalized;
}

function readDefaultAllowlist(projectRoot: string | undefined): ReadonlySet<string> | undefined {
  if (!projectRoot) return undefined;
  const file = path.join(projectRoot, 'config', 'allowlist.txt');
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }

  const allowlist = new Set<string>();
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const email = normalizeDaemonEmail(trimmed);
    if (email) allowlist.add(email);
  }
  return allowlist.size > 0 ? allowlist : undefined;
}

function userDirHash(email: string): string {
  return crypto.createHash('sha1').update(email).digest('hex').slice(0, 12);
}

function publicPathSet(
  publicPaths: AuthContextOptions['publicPaths'],
): ReadonlySet<string> {
  if (!publicPaths) return new Set();
  if (publicPaths instanceof Set) return publicPaths;
  return new Set(publicPaths);
}

export function createAuthContextMiddleware(options: AuthContextOptions): AuthContextMiddleware {
  const baseDataDir = path.resolve(options.baseDataDir);
  const multitenant = options.multitenant ?? process.env.OD_MULTITENANT === '1';
  const rawDevUser = options.devUser ?? process.env.OD_DEV_USER ?? 'local@dev';
  const devUser = normalizeDaemonEmail(rawDevUser);
  if (!devUser) {
    throw new Error('auth context devUser must be an email address');
  }

  const headerName = normalizeHeaderName(
    options.headerName ?? process.env.OD_TRUSTED_EMAIL_HEADER,
  );
  const allowlist =
    options.allowlist === undefined
      ? readDefaultAllowlist(options.projectRoot)
      : normalizeAllowlist(options.allowlist);
  const publicPaths = publicPathSet(options.publicPaths);

  function resolveUser(
    emailInput: string,
    source: DaemonUser['source'] = 'trusted-header',
  ): DaemonUser {
    const email = normalizeDaemonEmail(emailInput);
    if (!email) throw new Error('auth context user email must be valid');
    const dirHash = userDirHash(email);
    const dataDir = multitenant ? path.join(baseDataDir, 'users', dirHash) : baseDataDir;
    return { email, dirHash, dataDir, source };
  }

  const fallbackUser = resolveUser(devUser, 'dev-fallback');

  const middleware: RequestHandler = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    if (publicPaths.has(req.path)) {
      next();
      return;
    }

    const email = normalizeDaemonEmail(req.get(headerName));
    if (email) {
      if (allowlist && !allowlist.has(email)) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'email not in allowlist' });
        return;
      }
      req.user = resolveUser(email, 'trusted-header');
      next();
      return;
    }

    if (multitenant) {
      res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: `missing ${headerName} header`,
      });
      return;
    }

    req.user = fallbackUser;
    next();
  };

  return Object.assign(middleware, {
    resolveUser: (email: string) => resolveUser(email),
    multitenant,
    devUser: fallbackUser,
  });
}
