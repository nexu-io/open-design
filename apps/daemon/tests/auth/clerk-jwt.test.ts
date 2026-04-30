/**
 * T011 — Clerk JWT verifier tests (RED before T012).
 *
 * Spec 101 contract: specs/101-open-design-platform/contracts/clerk-jwt.contract.md
 *
 * Test matrix:
 *   (a) valid JWT verifies
 *   (b) expired JWT rejected (kind: 'expired')
 *   (c) invalid signature rejected (kind: 'invalid_signature')
 *   (d) missing `o.slg` rejected (kind: 'missing_org')
 *   (e) `iss` mismatch rejected (kind: 'iss_mismatch')
 *   (f) clock skew ±60s tolerance — 30s old accepted, 90s old rejected
 */
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import {
  ClerkVerificationError,
  verifyClerkSession,
  type ClerkVerifiedClaims,
} from '../../src/auth/clerk-jwt.js';
import {
  DEFAULT_TEST_ISSUER,
  generateTestKeyPair,
  signTestToken,
  type TestKeyPair,
} from './mock-clerk-jwks.js';

const ENV_KEYS = ['CLERK_FRONTEND_API', 'AUTHORIZED_PARTIES', 'CLERK_JWT_KEY'] as const;
type EnvKey = (typeof ENV_KEYS)[number];

let originalEnv: Record<EnvKey, string | undefined>;
let primaryKey: TestKeyPair;
let foreignKey: TestKeyPair;

function snapshotEnv(): Record<EnvKey, string | undefined> {
  const snap = {} as Record<EnvKey, string | undefined>;
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap: Record<EnvKey, string | undefined>): void {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

function buildBaseClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: 'user_2RfWKJREkjKbHZy0Wqa5qrHeAnb',
    sid: 'sess_2Ro7e2IxrffdqBboq8KfB6eGbIy',
    o: { id: 'org_2T0bBcDeFgHiJkLmNoPqRsTuVwX', slg: 'tenant-a', rol: 'admin' },
    azp: 'https://app.holalumina.com',
    ...overrides,
  };
}

beforeAll(async () => {
  originalEnv = snapshotEnv();
  primaryKey = await generateTestKeyPair('test-kid-primary');
  foreignKey = await generateTestKeyPair('test-kid-foreign');
});

afterEach(() => {
  restoreEnv(originalEnv);
});

function setEnvForPrimaryKey(): void {
  process.env.CLERK_FRONTEND_API = DEFAULT_TEST_ISSUER;
  process.env.AUTHORIZED_PARTIES = 'https://app.holalumina.com';
  process.env.CLERK_JWT_KEY = primaryKey.publicKeyPem;
}

describe('verifyClerkSession', () => {
  test('(a) accepts a valid JWT signed by trusted JWKS', async () => {
    setEnvForPrimaryKey();
    const token = await signTestToken(buildBaseClaims(), { keyPair: primaryKey });

    const claims: ClerkVerifiedClaims = await verifyClerkSession(token);

    expect(claims.sub).toBe('user_2RfWKJREkjKbHZy0Wqa5qrHeAnb');
    expect(claims.sid).toBe('sess_2Ro7e2IxrffdqBboq8KfB6eGbIy');
    expect(claims.o.id).toBe('org_2T0bBcDeFgHiJkLmNoPqRsTuVwX');
    expect(claims.o.slg).toBe('tenant-a');
    expect(claims.o.rol).toBe('admin');
  });

  test('(b) rejects an expired JWT with kind=expired', async () => {
    setEnvForPrimaryKey();
    const nowSeconds = Math.floor(Date.now() / 1000);
    // Issued 10 minutes ago, expired 9 minutes ago — well outside ±60s skew.
    const token = await signTestToken(buildBaseClaims(), {
      keyPair: primaryKey,
      iat: nowSeconds - 600,
      exp: nowSeconds - 540,
      nbf: nowSeconds - 605,
    });

    await expect(verifyClerkSession(token)).rejects.toMatchObject({
      kind: 'expired',
    });
    await expect(verifyClerkSession(token)).rejects.toBeInstanceOf(ClerkVerificationError);
  });

  test('(c) rejects a JWT signed by an untrusted key with kind=invalid_signature', async () => {
    setEnvForPrimaryKey();
    // Sign with foreignKey but env still trusts primaryKey.
    const token = await signTestToken(buildBaseClaims(), { keyPair: foreignKey });

    await expect(verifyClerkSession(token)).rejects.toMatchObject({
      kind: 'invalid_signature',
    });
  });

  test('(d) rejects a JWT missing o.slg with kind=missing_org', async () => {
    setEnvForPrimaryKey();
    const claims = buildBaseClaims({
      // org object present but slg omitted.
      o: { id: 'org_2T0bBcDeFgHiJkLmNoPqRsTuVwX', rol: 'admin' },
    });
    const token = await signTestToken(claims, { keyPair: primaryKey });

    await expect(verifyClerkSession(token)).rejects.toMatchObject({
      kind: 'missing_org',
    });

    // Also: `o` claim entirely absent should be missing_org.
    const noOrgToken = await signTestToken(buildBaseClaims({ o: undefined }), {
      keyPair: primaryKey,
    });
    await expect(verifyClerkSession(noOrgToken)).rejects.toMatchObject({
      kind: 'missing_org',
    });
  });

  test('(e) rejects a JWT whose iss does not match CLERK_FRONTEND_API', async () => {
    setEnvForPrimaryKey();
    const token = await signTestToken(buildBaseClaims(), {
      keyPair: primaryKey,
      issuer: 'https://attacker.clerk.accounts.dev',
    });

    await expect(verifyClerkSession(token)).rejects.toMatchObject({
      kind: 'iss_mismatch',
    });
  });

  test('(f) clock-skew tolerance: accept iat 30s old, reject iat 90s in the future', async () => {
    setEnvForPrimaryKey();
    const nowSeconds = Math.floor(Date.now() / 1000);

    // 30s old token — within skew, exp still in future → accept.
    const okToken = await signTestToken(buildBaseClaims(), {
      keyPair: primaryKey,
      iat: nowSeconds - 30,
      exp: nowSeconds + 30,
      nbf: nowSeconds - 35,
    });
    await expect(verifyClerkSession(okToken)).resolves.toMatchObject({ o: { slg: 'tenant-a' } });

    // 90s in the FUTURE iat (clock skew exceeded) → reject.
    // Clerk's TokenIatInTheFuture is signalled when iat - clockSkew > now.
    const futureToken = await signTestToken(buildBaseClaims(), {
      keyPair: primaryKey,
      iat: nowSeconds + 90,
      exp: nowSeconds + 600,
      nbf: nowSeconds + 85,
    });
    await expect(verifyClerkSession(futureToken)).rejects.toBeInstanceOf(ClerkVerificationError);
  });
});
