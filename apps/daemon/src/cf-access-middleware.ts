// Cloudflare Access JWT validation middleware for the Open Design daemon.
//
// Architecture:
//   When OD_TRUSTED_PROXY=1 is set the daemon runs behind a trusted reverse
//   proxy. If OD_CF_ACCESS_TEAM_DOMAIN and OD_CF_ACCESS_AUD are also
//   configured, every /api/* request must carry a valid
//   Cf-Access-Jwt-Assertion header issued by the configured Cloudflare
//   Access application. The JWT is validated against Cloudflare's public JWKS
//   endpoint.
//
//   Unlike the access-token middleware, Cloudflare mode does NOT exempt
//   loopback callers — in a hosted deployment, any process inside the
//   container (including installed CLIs) must present a valid JWT. Only
//   health/readiness/version/agents probes are open.
//
//   When OD_TRUSTED_PROXY=1 is set WITHOUT Cloudflare Access config, the
//   daemon trusts the proxy without additional JWT validation. It is the
//   operator's responsibility to ensure the reverse proxy is correctly
//   configured.
//
//   When OD_TRUSTED_PROXY is NOT set, the OD_ACCESS_TOKEN access-token
//   mechanism applies instead (see server.ts).
//
// Env vars:
//   OD_TRUSTED_PROXY           1 → trusted reverse proxy (no bearer token
//                                   required; Cloudflare JWT optional)
//   OD_CF_ACCESS_TEAM_DOMAIN   Your Cloudflare Access team domain
//                              (e.g. "myteam.cloudflareaccess.com")
//   OD_CF_ACCESS_AUD           The Application Audience (AUD) tag from your
//                              Cloudflare Access application policy
//
// Deprecated env vars (still work, print warning):
//   OD_BEHIND_PROXY=cloudflare → use OD_TRUSTED_PROXY=1 instead
//   OD_API_TOKEN=<token>       → use OD_ACCESS_TOKEN=<token> instead

import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cloudflare Access signs with RS256. No other algorithm is accepted. */
const ALLOWED_ALGORITHMS = new Set(["RS256"]);

/** JWKS cache TTL: Cloudflare rotates keys infrequently, so 1h is safe
 *  especially since we refresh on unknown-kid and signature failures. */
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** JWKS fetch timeout. Cloudflare's endpoint is fast; 5s is generous. */
const JWKS_FETCH_TIMEOUT_MS = 5000;

/** Clock skew tolerance for exp/nbf claims (seconds). */
const CLOCK_SKEW_S = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JwkKey {
	kty: string;
	kid: string;
	alg: string;
	n: string; // base64url-encoded modulus
	e: string; // base64url-encoded exponent
}

interface JwtHeader {
	alg: string;
	kid: string;
}

interface JwtPayload {
	aud: string | string[];
	exp: number;
	iss: string;
	email?: string;
	sub?: string;
	iat?: number;
	nbf?: number;
	type?: string;
	identity_nonce?: string;
	[key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Domain validation
// ---------------------------------------------------------------------------

/** Validate that the team domain looks like a Cloudflare Access domain.
 *  Rejects URLs with schemes, ports, paths, or userinfo to prevent SSRF. */
function validateTeamDomain(domain: string): string | null {
	try {
		// Reject anything that could be a URL with scheme/port/path
		if (
			domain.includes("://") ||
			domain.includes("/") ||
			domain.includes("@")
		) {
			return null;
		}
		// Strip trailing dot and lowercase
		const host = domain.replace(/\.$/, "").toLowerCase();
		// Allow bare hostnames and cloudflareaccess.com subdomains
		if (!host.includes(".")) return null; // no TLD
		// Require cloudflareaccess.com for production safety
		// (In development, any hostname can be allowed via OD_CF_ACCESS_UNSAFE_DOMAIN=1)
		if (
			!host.endsWith(".cloudflareaccess.com") &&
			process.env.OD_CF_ACCESS_UNSAFE_DOMAIN !== "1"
		) {
			return null;
		}
		return host;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// JWKS cache with rotation support
// ---------------------------------------------------------------------------

let jwksCache: Map<string, crypto.KeyObject> | null = null;
let jwksCacheExpiry = 0;
let jwksFetchInFlight: Promise<Map<string, crypto.KeyObject>> | null = null;

async function fetchJwks(
	teamDomain: string,
): Promise<Map<string, crypto.KeyObject>> {
	const url = `https://${teamDomain}/cdn-cgi/access/certs`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), JWKS_FETCH_TIMEOUT_MS);

	try {
		const res = await fetch(url, { signal: controller.signal });
		if (!res.ok) {
			throw new Error(
				`Cloudflare Access JWKS fetch failed: ${res.status} ${res.statusText} from ${url}`,
			);
		}
		const body = (await res.json()) as { keys: JwkKey[] };
		if (!body.keys || !Array.isArray(body.keys)) {
			throw new Error(
				`Cloudflare Access JWKS response missing 'keys' array from ${url}`,
			);
		}

		const keys = new Map<string, crypto.KeyObject>();
		for (const jwk of body.keys) {
			if (jwk.kty !== "RSA") continue;
			try {
				const key = crypto.createPublicKey({
					key: {
						kty: "RSA",
						n: jwk.n,
						e: jwk.e,
					},
					format: "jwk",
				});
				keys.set(jwk.kid, key);
			} catch {
				// skip unparseable keys
			}
		}
		return keys;
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Get JWKS keys, refreshing the cache when:
 *  - Cache is empty or expired (normal path)
 *  - `forceRefresh` is true (called on unknown-kid or signature failure)
 *
 * On refresh failure while forceRefresh is false, returns the stale cache
 * instead of throwing, so transient JWKS endpoint outages don't break all
 * traffic for an hour.
 */
async function getJwks(
	teamDomain: string,
	forceRefresh = false,
): Promise<Map<string, crypto.KeyObject>> {
	const now = Date.now();

	// Normal path: return valid cache
	if (!forceRefresh && jwksCache && now < jwksCacheExpiry) {
		return jwksCache;
	}

	// Deduplicate concurrent fetches
	if (jwksFetchInFlight) return jwksFetchInFlight;

	jwksFetchInFlight = fetchJwks(teamDomain)
		.then((keys) => {
			jwksCache = keys;
			jwksCacheExpiry = now + JWKS_CACHE_TTL_MS;
			return keys;
		})
		.catch((err) => {
			console.error("[cf-access] JWKS fetch failed:", err);
			// On refresh failure, keep serving the stale cache if available
			if (jwksCache) {
				console.warn(
					"[cf-access] Serving stale JWKS cache due to fetch failure",
				);
				// Extend stale cache by 5 minutes to avoid hammering the endpoint
				jwksCacheExpiry = now + 5 * 60 * 1000;
				return jwksCache;
			}
			throw err; // No cache at all — propagate the error
		})
		.finally(() => {
			jwksFetchInFlight = null;
		});

	return jwksFetchInFlight;
}

/** Invalidate the JWKS cache so the next request forces a fresh fetch. */
function invalidateJwksCache(): void {
	jwksCacheExpiry = 0;
}

// ---------------------------------------------------------------------------
// JWT decode + verify
// ---------------------------------------------------------------------------

function base64UrlDecode(input: string): string {
	return Buffer.from(
		input.replace(/-/g, "+").replace(/_/g, "/"),
		"base64",
	).toString("utf8");
}

function decodeJwt(
	token: string,
): { header: JwtHeader; payload: JwtPayload } | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const p0 = parts[0];
	const p1 = parts[1];
	if (!p0 || !p1) return null;
	try {
		const header = JSON.parse(base64UrlDecode(p0)) as JwtHeader;
		const payload = JSON.parse(base64UrlDecode(p1)) as JwtPayload;
		return { header, payload };
	} catch {
		return null;
	}
}

function verifyJwtSignature(
	token: string,
	key: crypto.KeyObject,
	alg: string,
): boolean {
	const parts = token.split(".");
	if (parts.length !== 3) return false;
	const p0 = parts[0];
	const p1 = parts[1];
	const p2 = parts[2];
	if (!p0 || !p1 || !p2) return false;

	const signingInput = `${p0}.${p1}`;
	const signature = Buffer.from(
		p2.replace(/-/g, "+").replace(/_/g, "/"),
		"base64",
	);

	// Map JWT alg to Node.js crypto algorithm
	const hashAlg: string = (() => {
		switch (alg) {
			case "RS256":
				return "RSA-SHA256";
			case "RS384":
				return "RSA-SHA384";
			case "RS512":
				return "RSA-SHA512";
			default:
				return "RSA-SHA256";
		}
	})();

	try {
		return crypto.verify(hashAlg, Buffer.from(signingInput), key, signature);
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// Claim validation
// ---------------------------------------------------------------------------

interface ClaimValidationError {
	code: string;
	message: string;
}

function validateClaims(
	payload: JwtPayload,
	header: JwtHeader,
	config: CloudflareAccessConfig,
	now: number,
): ClaimValidationError | null {
	// 1. Algorithm must be allowlisted
	if (!ALLOWED_ALGORITHMS.has(header.alg)) {
		return {
			code: "CF_ACCESS_BAD_ALG",
			message: `Cloudflare Access JWT algorithm '${header.alg}' is not allowed. Expected: RS256.`,
		};
	}

	// 2. exp must be present and numeric
	if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
		return {
			code: "CF_ACCESS_MISSING_EXP",
			message: "Cloudflare Access JWT is missing a valid expiration claim.",
		};
	}

	// 3. exp must not be in the past (with clock skew tolerance)
	if (payload.exp < now - CLOCK_SKEW_S) {
		return {
			code: "CF_ACCESS_EXPIRED",
			message: "Cloudflare Access JWT has expired.",
		};
	}

	// 4. nbf (not-before) must not be in the future
	if (typeof payload.nbf === "number" && payload.nbf > now + CLOCK_SKEW_S) {
		return {
			code: "CF_ACCESS_NOT_YET_VALID",
			message: "Cloudflare Access JWT is not yet valid (nbf in the future).",
		};
	}

	// 5. Issued-at sanity check: reject tokens from the far future
	if (typeof payload.iat === "number" && payload.iat > now + CLOCK_SKEW_S * 2) {
		return {
			code: "CF_ACCESS_FUTURE_IAT",
			message: "Cloudflare Access JWT issued-at time is in the future.",
		};
	}

	// 6. type must be "app" (Cloudflare Access application token)
	if (payload.type !== "app") {
		return {
			code: "CF_ACCESS_BAD_TYPE",
			message: "Cloudflare Access JWT type must be 'app'.",
		};
	}

	// 7. Audience must include the configured AUD tag
	const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
	if (!audList.includes(config.aud)) {
		return {
			code: "CF_ACCESS_INVALID_AUD",
			message: `Cloudflare Access JWT audience mismatch. Expected: ${config.aud}`,
		};
	}

	// 8. Issuer must match the team domain
	const expectedIssuer = `https://${config.teamDomain}`;
	if (payload.iss !== expectedIssuer) {
		return {
			code: "CF_ACCESS_INVALID_ISS",
			message: `Cloudflare Access JWT issuer mismatch. Expected: ${expectedIssuer}`,
		};
	}

	// 9. identity_nonce must be present (prevents replay attacks)
	if (!payload.identity_nonce) {
		return {
			code: "CF_ACCESS_MISSING_NONCE",
			message: "Cloudflare Access JWT is missing identity_nonce claim.",
		};
	}

	return null; // All claims valid
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export interface CloudflareAccessConfig {
	teamDomain: string;
	aud: string;
}

/** Resolve Cloudflare Access configuration from environment variables.
 *  Validates the team domain is a legitimate Cloudflare Access domain. */
export function resolveCloudflareAccessConfig(
	env: NodeJS.ProcessEnv = process.env,
): CloudflareAccessConfig | null {
	const rawDomain = (env.OD_CF_ACCESS_TEAM_DOMAIN ?? "").trim();
	const aud = (env.OD_CF_ACCESS_AUD ?? "").trim();
	if (!rawDomain || !aud) return null;

	const teamDomain = validateTeamDomain(rawDomain);
	if (!teamDomain) {
		console.error(
			`[cf-access] OD_CF_ACCESS_TEAM_DOMAIN="${rawDomain}" is not a valid ` +
				`Cloudflare Access domain. Expected: <team>.cloudflareaccess.com. ` +
				`Set OD_CF_ACCESS_UNSAFE_DOMAIN=1 to bypass this check in development.`,
		);
		return null;
	}

	return { teamDomain, aud };
}

const PROBE_PATHS = new Set([
	"/health",
	"/api/health",
	"/ready",
	"/api/ready",
	"/version",
	"/api/version",
	"/api/agents",
]);

function isProbePath(path: string): boolean {
	return PROBE_PATHS.has(path);
}

/**
 * Create Express middleware that validates Cloudflare Access JWT assertions.
 *
 * Security properties:
 *  - Loopback callers are NOT exempt (unlike bearer-token mode). In a hosted
 *    deployment, any process inside the container must present a valid JWT.
 *    Only health probes are open.
 *  - On unknown kid or first signature failure, JWKS is force-refreshed once
 *    and verification is retried before rejecting (handles key rotation).
 *  - Claims are exhaustively validated: alg, exp, nbf, iat, type, aud, iss,
 *    identity_nonce.
 *  - JWKS fetch has a 5s timeout and falls back to stale cache on failure.
 */
export function createCloudflareAccessMiddleware(
	config: CloudflareAccessConfig,
): (req: Request, res: Response, next: NextFunction) => void {
	return (req: Request, res: Response, next: NextFunction) => {
		// Health / readiness / version probes are always open for monitoring
		if (isProbePath(req.path)) return next();

		const jwtAssertion = (req.get("Cf-Access-Jwt-Assertion") ?? "").trim();

		if (!jwtAssertion) {
			return res.status(401).json({
				error: {
					code: "CF_ACCESS_REQUIRED",
					message:
						"Cloudflare Access JWT assertion required. " +
						"Requests must carry Cf-Access-Jwt-Assertion header.",
				},
			});
		}

		// Decode without verifying signature first to get header + claims
		const decoded = decodeJwt(jwtAssertion);
		if (!decoded) {
			return res.status(401).json({
				error: {
					code: "CF_ACCESS_INVALID",
					message: "Cloudflare Access JWT is malformed or cannot be decoded.",
				},
			});
		}

		const { header, payload } = decoded;

		// --- Phase 1: Validate claims (no I/O needed) ---
		const now = Math.floor(Date.now() / 1000);
		const claimError = validateClaims(payload, header, config, now);
		if (claimError) {
			return res.status(401).json({ error: claimError });
		}

		// --- Phase 2: Signature verification (async, fetches JWKS) ---
		//
		// The inner function is called with forceRefresh=false on first attempt,
		// then forceRefresh=true on retry if the key wasn't found or signature
		// didn't match (key rotation just happened).
		const tryVerify = async (forceRefresh: boolean): Promise<void> => {
			const keys = await getJwks(config.teamDomain, forceRefresh);

			const key = keys.get(header.kid);
			if (!key) {
				throw {
					code: "CF_ACCESS_UNKNOWN_KEY",
					status: 401,
					message: `Cloudflare Access JWT key '${header.kid}' not found in JWKS.`,
				};
			}

			if (!verifyJwtSignature(jwtAssertion, key, header.alg)) {
				throw {
					code: "CF_ACCESS_BAD_SIGNATURE",
					status: 401,
					message: "Cloudflare Access JWT signature verification failed.",
				};
			}

			// Attach verified user info to request for downstream handlers
			const user = {
				email: payload.email ?? "unknown",
				sub: payload.sub ?? undefined,
			} as { email: string; sub?: string };
			(
				req as Request & { cfAccessUser?: { email: string; sub?: string } }
			).cfAccessUser = user;
		};

		tryVerify(false)
			.then(() => next())
			.catch(async (err) => {
				// On unknown kid or bad signature, force a JWKS refresh and retry once.
				// This handles the key rotation window: Cloudflare publishes new keys
				// before revoking old ones, so a stale cache should still work. But if
				// the cache missed the rotation entirely (e.g. daemon was down), the
				// retry fixes it transparently.
				if (
					err &&
					typeof err === "object" &&
					(err as { code?: string }).code === "CF_ACCESS_UNKNOWN_KEY"
				) {
					console.warn(
						"[cf-access] Unknown kid, forcing JWKS refresh and retrying...",
					);
					invalidateJwksCache();
					try {
						await tryVerify(true);
						return next();
					} catch (retryErr) {
						err = retryErr;
					}
				}

				// For known errors with status codes, return clean JSON
				if (
					err &&
					typeof err === "object" &&
					(err as { status?: number }).status
				) {
					const e = err as { status: number; code: string; message: string };
					return res.status(e.status).json({
						error: { code: e.code, message: e.message },
					});
				}

				// Unexpected errors
				console.error("[cf-access] Unexpected validation error:", err);
				return res.status(503).json({
					error: {
						code: "CF_ACCESS_JWKS_ERROR",
						message:
							"Temporarily unable to validate Cloudflare Access credentials. " +
							"The JWKS endpoint may be unreachable.",
					},
				});
			});
	};
}

// ---------------------------------------------------------------------------
// Auth mode resolution
// ---------------------------------------------------------------------------

export type AuthMode = "none" | "trusted-proxy" | "access-token";

/**
 * Resolve the active authentication mode from environment variables.
 *
 * Priority:
 *   1. OD_TRUSTED_PROXY=1 → trusted proxy (with optional Cloudflare JWT)
 *   2. OD_BEHIND_PROXY=cloudflare (deprecated) → trusted proxy (strict CF check)
 *   3. OD_ACCESS_TOKEN set → access token (formerly bearer token)
 *   4. OD_API_TOKEN (deprecated) → access token
 *   5. Neither → no authentication (development / loopback only)
 *
 * New vars win over deprecated vars when both are set.
 *
 * When OD_BEHIND_PROXY=cloudflare is set but CF config is incomplete,
 * this throws at startup (preserving old strict behavior).
 * When OD_TRUSTED_PROXY=1 is set without CF config, trusted-proxy mode
 * is active with no additional JWT validation.
 */
export function resolveAuthMode(
	env: NodeJS.ProcessEnv = process.env,
): AuthMode {
	// 1. Check new OD_TRUSTED_PROXY (boolean flag)
	const trustedProxyRaw = (env.OD_TRUSTED_PROXY ?? "").trim();
	const isTrustedProxy = trustedProxyRaw === "1" || trustedProxyRaw === "true";

	if (isTrustedProxy) {
		return "trusted-proxy";
	}

	// 2. Check deprecated OD_BEHIND_PROXY (only "cloudflare" is valid)
	const behindProxy = (env.OD_BEHIND_PROXY ?? "").trim().toLowerCase();
	if (behindProxy === "cloudflare") {
		console.warn(
			"[auth] DEPRECATED: OD_BEHIND_PROXY is deprecated, use OD_TRUSTED_PROXY=1 instead",
		);
		// Preserve old strict behavior: require valid CF config
		const cfConfig = resolveCloudflareAccessConfig(env);
		if (!cfConfig) {
			throw new Error(
				`OD_BEHIND_PROXY=cloudflare is set but Cloudflare Access configuration ` +
					`is incomplete or invalid. Set OD_CF_ACCESS_TEAM_DOMAIN (must end with ` +
					`.cloudflareaccess.com) and OD_CF_ACCESS_AUD (from your Access ` +
					`application policy). Use OD_CF_ACCESS_UNSAFE_DOMAIN=1 in development ` +
					`to allow non-Cloudflare domains. ` +
					`(Tip: switch to OD_TRUSTED_PROXY=1 for proxy trust without Cloudflare requirements.)`,
			);
		}
		return "trusted-proxy";
	}

	// 3. Check new OD_ACCESS_TOKEN
	const accessToken = (env.OD_ACCESS_TOKEN ?? "").trim();
	if (accessToken.length > 0) return "access-token";

	// 4. Check deprecated OD_API_TOKEN
	const apiToken = (env.OD_API_TOKEN ?? "").trim();
	if (apiToken.length > 0) {
		console.warn(
			"[auth] DEPRECATED: OD_API_TOKEN is deprecated, use OD_ACCESS_TOKEN instead",
		);
		return "access-token";
	}

	return "none";
}
