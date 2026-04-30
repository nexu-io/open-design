/**
 * Test helpers for Clerk JWT verification.
 *
 * Provides:
 *   - generateTestKeyPair(): RSA-2048 key pair (RS256) — Clerk's actual algorithm
 *   - signTestToken(claims, opts): sign a JWT with the test private key
 *   - mockJwksEndpoint(handler): boot a tiny HTTP server returning a JWKS document
 *
 * NOTE: The daemon's `verifyClerkSession` injects the public key directly via the
 * `jwtKey` (PEM) option of `@clerk/backend.verifyToken`, so most unit tests do NOT
 * need the HTTP JWKS server — `signTestToken` + `getTestPublicKeyPem()` is enough.
 * The HTTP server is provided for integration tests that exercise the JWKS-fetch
 * code path.
 *
 * Why RS256 and not ECDSA: `@clerk/backend.loadClerkJwkFromPem` only supports RSA
 * PEM input (it hard-codes `kty: 'RSA', alg: 'RS256'` when converting PEM → JWK).
 * To exercise the real verifyToken code path we must use RS256.
 */
import { createServer, type Server } from 'node:http';
import {
  exportSPKI,
  exportPKCS8,
  generateKeyPair,
  importPKCS8,
  SignJWT,
  type CryptoKey,
} from 'jose';
import type { KeyObject } from 'node:crypto';

export type TestKeyPair = {
  /** Stable kid used in JWT header + JWKS document. */
  kid: string;
  /** Public key in SPKI/PEM form (suitable for @clerk/backend `jwtKey` option). */
  publicKeyPem: string;
  /** Private key in PKCS8/PEM form (kept for round-tripping/debugging). */
  privateKeyPem: string;
  /** jose KeyLike for the private key (used by SignJWT). */
  privateKey: CryptoKey | KeyObject;
  /** jose KeyLike for the public key. */
  publicKey: CryptoKey | KeyObject;
};

/**
 * Generate a fresh RS256 key pair for one test run.
 * extractable=true so we can export PEM for `jwtKey`.
 */
export async function generateTestKeyPair(kid = 'test-kid-1'): Promise<TestKeyPair> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', {
    modulusLength: 2048,
    extractable: true,
  });
  const publicKeyPem = await exportSPKI(publicKey as CryptoKey);
  const privateKeyPem = await exportPKCS8(privateKey as CryptoKey);
  return {
    kid,
    publicKeyPem,
    privateKeyPem,
    privateKey,
    publicKey,
  };
}

export type SignTestTokenOpts = {
  keyPair: TestKeyPair;
  /** Override default issuer; defaults to `https://test.clerk.accounts.dev`. */
  issuer?: string;
  /** Override `iat`. Defaults to now. */
  iat?: number;
  /** Override `exp`. Defaults to iat + 60. */
  exp?: number;
  /** Override `nbf`. Defaults to iat - 5. */
  nbf?: number;
  /** Override `azp`. */
  azp?: string;
  /** Override `headerType`/`typ`. Defaults to 'JWT'. */
  typ?: string;
};

export const DEFAULT_TEST_ISSUER = 'https://test.clerk.accounts.dev';

/**
 * Sign a JWT with the test private key.
 *
 * @param claims  arbitrary JWT claims; merged on top of any iat/exp/nbf/iss
 *                supplied via opts. Pass `null` for any standard claim to
 *                explicitly omit it (used to test missing-claim error paths).
 */
export async function signTestToken(
  claims: Record<string, unknown>,
  opts: SignTestTokenOpts,
): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const iat = opts.iat ?? nowSeconds;
  const exp = opts.exp ?? iat + 60;
  const nbf = opts.nbf ?? iat - 5;
  const issuer = opts.issuer ?? DEFAULT_TEST_ISSUER;

  // Build payload — explicit nulls in `claims` mean "omit that standard claim".
  const payload: Record<string, unknown> = { ...claims };
  if (!('iat' in payload)) payload.iat = iat;
  if (!('exp' in payload)) payload.exp = exp;
  if (!('nbf' in payload)) payload.nbf = nbf;
  if (!('iss' in payload)) payload.iss = issuer;
  if (opts.azp != null && !('azp' in payload)) payload.azp = opts.azp;

  // Strip explicit null sentinels.
  for (const key of Object.keys(payload)) {
    if (payload[key] === null) delete payload[key];
  }

  // jose's SignJWT expects iat/exp/nbf to be set via setX methods OR present in payload.
  // Avoid the helpers because they re-derive timestamps; trust our payload.
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', typ: opts.typ ?? 'JWT', kid: opts.keyPair.kid })
    .sign(opts.keyPair.privateKey);
}

export type JwksMockServer = {
  /** Full URL like `http://127.0.0.1:54321/.well-known/jwks.json`. */
  url: string;
  /** Origin like `http://127.0.0.1:54321`. */
  origin: string;
  /** Number of times the JWKS endpoint was hit. */
  hitCount: () => number;
  /** Stop the server. */
  close: () => Promise<void>;
};

/**
 * Boot a tiny HTTP server on an ephemeral port that serves a JWKS document
 * derived from the supplied key pair at `/.well-known/jwks.json`. Useful for
 * integration tests that exercise Clerk's remote JWKS fetch code path.
 */
export async function mockJwksEndpoint(keyPair: TestKeyPair): Promise<JwksMockServer> {
  const jwks = await keyPairToJwks(keyPair);
  let hits = 0;

  const server = createServer((req, res) => {
    if (!req.url) {
      res.statusCode = 404;
      res.end();
      return;
    }
    if (req.url === '/.well-known/jwks.json' || req.url === '/v1/jwks') {
      hits += 1;
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [jwks] }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Mock JWKS server failed to bind to an address.');
  }
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    url: `${origin}/.well-known/jwks.json`,
    origin,
    hitCount: () => hits,
    close: () => closeServer(server),
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function keyPairToJwks(keyPair: TestKeyPair): Promise<Record<string, unknown>> {
  // jose exports a CryptoKey; convert via exportJWK if needed. We re-import the
  // PEM to derive the JWK to avoid pulling in another dep — the `jose` import
  // tree provides exportJWK transitively, but we prefer an explicit conversion.
  const { exportJWK } = await import('jose');
  const jwk = await exportJWK(keyPair.publicKey as CryptoKey);
  return {
    ...jwk,
    kid: keyPair.kid,
    use: 'sig',
    alg: 'RS256',
  };
}

/**
 * Round-trip the private key PEM via importPKCS8 — useful when a test wants to
 * regenerate a CryptoKey from a stored PEM. Currently unused but kept for parity
 * with Clerk's PEM-as-string flow.
 */
export async function importPrivatePem(pem: string): Promise<CryptoKey | KeyObject> {
  return importPKCS8(pem, 'RS256', { extractable: true });
}
