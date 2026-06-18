import express from 'express';
import type { Express } from 'express';
import { betterAuth } from 'better-auth';
import { toNodeHandler } from 'better-auth/node';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { configuredAllowedOrigins, isLoopbackOrPrivateLanHost } from '../origin-validation.js';

const AUTH_SECRET_FILE = 'auth-secret';

export type OpenDesignAuthRuntime = {
  handler: express.RequestHandler;
  shutdown: () => Promise<void>;
};

export interface RegisterAuthRoutesDeps {
  dataDir: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Mount the better-auth email/password endpoints under `/api/auth/*`.
 *
 * Must be called BEFORE `express.json()` is installed on the app: better-auth
 * owns its own body parsing and breaks if the body is consumed upstream.
 *
 * Returns the runtime handle (carrying the `pg` pool's shutdown) so the caller
 * can close it during daemon teardown, or `null` when auth is disabled (no
 * `OPEN_DESIGN_DATABASE_URL` configured).
 */
export async function registerAuthRoutes(
  app: Express,
  deps: RegisterAuthRoutesDeps,
): Promise<OpenDesignAuthRuntime | null> {
  const runtime = await createOpenDesignAuth(deps);
  if (runtime) {
    app.all('/api/auth/*splat', runtime.handler);
  }
  return runtime;
}

export async function createOpenDesignAuth(options: {
  dataDir: string;
  env?: NodeJS.ProcessEnv;
}): Promise<OpenDesignAuthRuntime | null> {
  const env = options.env ?? process.env;
  const databaseUrl = (env.OPEN_DESIGN_DATABASE_URL ?? '').trim();
  if (databaseUrl.length === 0) return null;

  const pool = new Pool({ connectionString: databaseUrl });
  await ensureBetterAuthPostgresSchema(pool);

  // Deploy topology (Cloudflare tunnel → Traefik → daemon): the daemon
  // terminates plain HTTP behind a TLS proxy, so better-auth cannot derive its
  // public origin from the incoming request. Anchor it to the same allow-list
  // the daemon's own origin guard uses (OD_ALLOWED_ORIGINS), preferring an
  // explicit BETTER_AUTH_URL. When neither is set (pure localhost dev) we leave
  // baseURL unset and better-auth derives it per request.
  const allowedOrigins = configuredAllowedOrigins(env);
  const baseURL =
    (env.BETTER_AUTH_URL ?? '').trim() ||
    allowedOrigins.find((origin) => origin.startsWith('https://')) ||
    allowedOrigins[0] ||
    undefined;
  const useSecureCookies = baseURL ? baseURL.startsWith('https://') : undefined;

  const auth = betterAuth({
    appName: 'Open Design',
    basePath: '/api/auth',
    ...(baseURL ? { baseURL } : {}),
    database: pool,
    emailAndPassword: {
      enabled: true,
    },
    secret: resolveAuthSecret(options.dataDir, env),
    // CSRF: public origins must be explicitly allow-listed via
    // OD_ALLOWED_ORIGINS — never blanket-echo the request Origin. Loopback /
    // private-LAN origins are trusted unconditionally so the local web UI and
    // the `od` CLI (dynamic ports) work without per-port config; the daemon's
    // own origin guard already gates those.
    trustedOrigins: (request) => {
      const origin = request?.headers.get('origin');
      if (!origin) return allowedOrigins;
      try {
        const parsed = new URL(origin);
        if (isLoopbackOrPrivateLanHost(parsed.hostname)) {
          return [...allowedOrigins, parsed.origin];
        }
      } catch {
        return allowedOrigins;
      }
      return allowedOrigins;
    },
    ...(useSecureCookies === undefined ? {} : { advanced: { useSecureCookies } }),
  });
  const nodeHandler = toNodeHandler(auth);

  return {
    handler: (req, res) => nodeHandler(req, res),
    shutdown: async () => {
      await pool.end();
    },
  };
}

function resolveAuthSecret(dataDir: string, env: NodeJS.ProcessEnv): string {
  const configured = (env.BETTER_AUTH_SECRET ?? env.AUTH_SECRET ?? '').trim();
  if (configured.length > 0) return configured;

  fs.mkdirSync(dataDir, { recursive: true });
  const secretPath = path.join(dataDir, AUTH_SECRET_FILE);
  try {
    const existing = fs.readFileSync(secretPath, 'utf8').trim();
    if (existing.length > 0) return existing;
  } catch (error) {
    if (!isNodeErrorWithCode(error, 'ENOENT')) throw error;
  }

  const secret = randomBytes(32).toString('base64url');
  fs.writeFileSync(secretPath, `${secret}\n`, { mode: 0o600 });
  return secret;
}

function isNodeErrorWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

async function ensureBetterAuthPostgresSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "user" (
      "id" text PRIMARY KEY,
      "name" text NOT NULL,
      "email" text NOT NULL UNIQUE,
      "emailVerified" boolean NOT NULL DEFAULT false,
      "image" text,
      "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "session" (
      "id" text PRIMARY KEY,
      "expiresAt" timestamp NOT NULL,
      "token" text NOT NULL UNIQUE,
      "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "ipAddress" text,
      "userAgent" text,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session"("userId");

    CREATE TABLE IF NOT EXISTS "account" (
      "id" text PRIMARY KEY,
      "accountId" text NOT NULL,
      "providerId" text NOT NULL,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "accessToken" text,
      "refreshToken" text,
      "idToken" text,
      "accessTokenExpiresAt" timestamp,
      "refreshTokenExpiresAt" timestamp,
      "scope" text,
      "password" text,
      "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account"("userId");

    CREATE TABLE IF NOT EXISTS "verification" (
      "id" text PRIMARY KEY,
      "identifier" text NOT NULL,
      "value" text NOT NULL,
      "expiresAt" timestamp NOT NULL,
      "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification"("identifier");
  `);
}
