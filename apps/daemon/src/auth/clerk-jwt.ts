/**
 * Clerk JWT verifier for the open-design daemon.
 *
 * Spec 101 — see specs/101-open-design-platform/contracts/clerk-jwt.contract.md
 *
 * Responsibilities:
 *   1. Verify signature, exp/iat/nbf, authorized parties via @clerk/backend.verifyToken().
 *   2. Manually verify `iss === CLERK_FRONTEND_API` (Clerk SDK does NOT do this).
 *   3. Manually verify the org-context shape (`o.id`, `o.slg`, `o.rol` present).
 *   4. Throw a typed `ClerkVerificationError` with a structured `kind` for each failure mode.
 *
 * Subdomain ↔ org-slug enforcement is performed by the caller (resolver + tenant
 * context middleware), not here, so the verifier stays single-purpose.
 */
import { verifyToken } from '@clerk/backend';
import { TokenVerificationErrorReason } from '@clerk/backend/errors';

/**
 * Failure-mode discriminator returned on every verification error.
 *
 * - `expired`: token's exp is in the past (beyond clock-skew tolerance).
 * - `invalid_signature`: signature did not validate against the configured key.
 * - `missing_org`: `o.slg`, `o.id`, or `o.rol` is missing/empty.
 * - `iss_mismatch`: `iss` does not match `CLERK_FRONTEND_API`.
 * - `not_yet_valid`: `iat`/`nbf` is in the future beyond clock skew.
 * - `invalid`: any other verification failure (catch-all).
 * - `config_error`: env vars missing — operator misconfiguration.
 */
export type ClerkVerificationErrorKind =
  | 'expired'
  | 'invalid_signature'
  | 'missing_org'
  | 'iss_mismatch'
  | 'not_yet_valid'
  | 'invalid'
  | 'config_error';

/**
 * Structured shape of a successfully verified Clerk session token.
 * Only the fields the daemon needs for tenant resolution + audit logs are exposed.
 */
export type ClerkVerifiedClaims = {
  sub: string;
  sid: string;
  o: {
    id: string;
    slg: string;
    rol: string;
  };
};

/**
 * Typed error thrown by `verifyClerkSession`. The `kind` field maps 1:1 onto
 * the contract's documented failure modes — callers (the auth middleware in
 * server.ts) switch on it to choose the appropriate HTTP response and audit log
 * event.
 */
export class ClerkVerificationError extends Error {
  public readonly kind: ClerkVerificationErrorKind;
  public readonly reason?: string;

  constructor(kind: ClerkVerificationErrorKind, message: string, reason?: string) {
    super(message);
    this.name = 'ClerkVerificationError';
    this.kind = kind;
    if (reason !== undefined) this.reason = reason;
  }
}

/**
 * ±60s allowed difference between Clerk's clock and ours.
 * Contract: clock-skew tolerance ±60s.
 */
const CLOCK_SKEW_MS = 60_000;

type EnvConfig = {
  frontendApi: string;
  authorizedParties: string[];
  jwtKey: string | undefined;
};

function readEnvConfig(): EnvConfig {
  const frontendApi = process.env.CLERK_FRONTEND_API;
  if (!frontendApi || frontendApi.trim().length === 0) {
    throw new ClerkVerificationError(
      'config_error',
      'CLERK_FRONTEND_API env var is required for JWT verification.',
    );
  }
  const rawAuthorized = process.env.AUTHORIZED_PARTIES ?? '';
  const authorizedParties = rawAuthorized
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return {
    frontendApi: frontendApi.trim(),
    authorizedParties,
    jwtKey: process.env.CLERK_JWT_KEY,
  };
}

/**
 * Verify a Clerk session JWT and return the structured claims required by the
 * daemon. Throws `ClerkVerificationError` (with `kind`) on every failure.
 */
export async function verifyClerkSession(token: string): Promise<ClerkVerifiedClaims> {
  if (!token || typeof token !== 'string') {
    throw new ClerkVerificationError('invalid', 'Empty or non-string token.');
  }

  const env = readEnvConfig();
  const verifyOptions: Parameters<typeof verifyToken>[1] = {
    authorizedParties: env.authorizedParties.length > 0 ? env.authorizedParties : undefined,
    clockSkewInMs: CLOCK_SKEW_MS,
  };
  if (env.jwtKey) {
    verifyOptions.jwtKey = env.jwtKey;
  }

  // `@clerk/backend.verifyToken` is wrapped with `withLegacyReturn` — it
  // throws on verification failure and returns the JwtPayload directly on
  // success. The package's TypeScript declaration (`Promise<JwtReturnType<...>>`)
  // is misleading at runtime; we handle the throw-style contract here.
  let payload: Record<string, unknown>;
  try {
    payload = (await verifyToken(token, verifyOptions)) as unknown as Record<string, unknown>;
  } catch (err) {
    throw mapClerkError(err as Error);
  }

  // Manual `iss` check — @clerk/backend does NOT validate the issuer claim.
  if (typeof payload.iss !== 'string' || payload.iss !== env.frontendApi) {
    throw new ClerkVerificationError(
      'iss_mismatch',
      `Issuer mismatch: token iss="${payload.iss ?? '<missing>'}" expected="${env.frontendApi}".`,
    );
  }

  // Org-context shape check — the v2 payload uses `o = { id, slg, rol }`.
  const org = extractOrg(payload);
  if (!org) {
    throw new ClerkVerificationError(
      'missing_org',
      'Token missing required organization context (o.id, o.slg, o.rol).',
    );
  }

  if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
    throw new ClerkVerificationError(
      'invalid',
      'Token missing required sub/sid claims.',
    );
  }

  return {
    sub: payload.sub,
    sid: payload.sid,
    o: org,
  };
}

/**
 * Pull the org context out of either the v2 `o = {id, slg, rol}` payload OR
 * the legacy flat `org_id` / `org_slug` / `org_role` payload. We prefer the
 * v2 shape (matches the contract) but accept legacy for forward-compat with
 * older Clerk environments.
 */
function extractOrg(payload: Record<string, unknown>): ClerkVerifiedClaims['o'] | null {
  const v2 = payload['o'];
  if (v2 && typeof v2 === 'object') {
    const o = v2 as Record<string, unknown>;
    if (
      typeof o['id'] === 'string' &&
      o['id'].length > 0 &&
      typeof o['slg'] === 'string' &&
      o['slg'].length > 0 &&
      typeof o['rol'] === 'string' &&
      o['rol'].length > 0
    ) {
      return { id: o['id'], slg: o['slg'], rol: o['rol'] };
    }
  }

  const legacyId = payload['org_id'];
  const legacySlg = payload['org_slug'];
  const legacyRol = payload['org_role'];
  if (
    typeof legacyId === 'string' &&
    legacyId.length > 0 &&
    typeof legacySlg === 'string' &&
    legacySlg.length > 0 &&
    typeof legacyRol === 'string' &&
    legacyRol.length > 0
  ) {
    return { id: legacyId, slg: legacySlg, rol: legacyRol };
  }

  return null;
}

/**
 * Map @clerk/backend's `TokenVerificationError.reason` strings onto our
 * structured `kind` discriminator. Anything we don't explicitly recognize
 * collapses to `invalid`.
 */
function mapClerkError(err: { reason?: string; message?: string } | Error): ClerkVerificationError {
  const reason =
    'reason' in err && typeof err.reason === 'string'
      ? err.reason
      : undefined;
  const message =
    'message' in err && typeof err.message === 'string'
      ? err.message
      : 'Token verification failed.';

  switch (reason) {
    case TokenVerificationErrorReason.TokenExpired:
      return new ClerkVerificationError('expired', message, reason);
    case TokenVerificationErrorReason.TokenInvalidSignature:
      return new ClerkVerificationError('invalid_signature', message, reason);
    case TokenVerificationErrorReason.TokenNotActiveYet:
    case TokenVerificationErrorReason.TokenIatInTheFuture:
      return new ClerkVerificationError('not_yet_valid', message, reason);
    default:
      return new ClerkVerificationError('invalid', message, reason);
  }
}
