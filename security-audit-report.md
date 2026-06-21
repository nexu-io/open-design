# Security Audit Report — Open Design

**Review Date:** 2026-06-21
**Scope:** Bootstrap auth flow, API token auth, origin validation, Docker deployment config
**Reviewer:** security-reviewer agent

---

## Summary

| Severity | Count |
|----------|-------|
| **Critical** | 0 |
| **High** | 3 |
| **Medium** | 4 |
| **Low** | 3 |
| **Non-Issue** | 3 |
| **Overall Risk** | **MEDIUM** |

---

## High Issues

### H1. Bootstrap Auth Fails Silently — User Gets a Broken App With No Error Feedback

**Severity:** HIGH
**Category:** Broken Authentication / User Experience
**Location:** `apps/web/src/App.tsx` lines 787–813

**Issue:**
The entire bootstrap `try/catch` block silently swallows every failure mode: network errors, 403 (not on loopback/private subnet), 401 (invalid nonce), and the 10-second timeout. The `catch` body is empty (lines 807–810):

```typescript
} catch {
  // daemon may not support bootstrap (older version, or no auth
  // configured; also catches AbortError after 10s timeout) —
  // proceed without a cookie.
}
```

When the daemon has `OD_API_TOKEN` set and the browser cannot complete the bootstrap handshake (non-loopback network, proxied request, expired nonce), every subsequent API call (`/api/agents`, `/api/projects`, `/api/config`, etc.) fails with 401. These fetches have their own error handling:

- `fetchAgentsStream` — catches errors and returns `[]` (line 838–846)
- `listProjects` — returns `[]` on error
- `fetchDaemonConfig` — fails silently
- `fetchComposioConfigFromDaemon` — fails silently

The user sees an empty, non-functional UI with no error message, no retry prompt, and no indication that authentication is the problem. The app appears broken with no remediation path.

**Exploitability:**
An attacker who can cause bootstrap to fail (e.g., by intercepting the bootstrap request on a shared network, or when the user is on a non-loopback, non-private-subnet connection with auth enabled) can degrade the UX to the point of unusability. More critically, a well-intentioned deployment behind a reverse proxy will silently fail for all users because `isProxiedRequest` rejects all bootstraps, and the error is invisible.

**Remediation:**
1. Distinguish failure modes: if `bootstrap-token` returns 403, the user needs to manually enter the API token — show an auth-required prompt or at minimum a console warning.
2. If all bootstrap attempts fail, surface a toast or banner: "Authentication failed — enter your API token in Settings or check your network."
3. Consider a retry mechanism for transient failures.
4. At minimum, log a `console.warn` so developers can diagnose the issue.

---

### H2. `OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET=1` Hardcoded in Docker Compose — No User Override Possible

**Severity:** HIGH
**Category:** Security Misconfiguration
**Location:** `deploy/docker-compose.yml` line 35

**Issue:**
The environment variable is set to a literal `1`, not a variable reference:

```yaml
- OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET=1
```

`deploy/.env.example` (line 24) warns:

> **WARNING:** Keep this 0 unless the daemon is behind Docker port publishing. When 1, any user on your LAN/VPN can mint a session cookie without knowing OD_API_TOKEN — the daemon trusts RFC1918 remote addresses directly.

Because it's hardcoded rather than using `${OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET:-1}`, a user who sets `OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET=0` in their `.env` file will **not** be able to override it. The `.env.example` caution is effectively misleading — users think they can control it, but docker-compose.yml overrides them.

**Exploitability:**
Currently mitigated because the port binding (`ports: - "127.0.0.1:7456:7456"`) restricts to localhost. However, a common deployment change is to remove the `127.0.0.1:` prefix to expose the daemon on the LAN or behind a reverse proxy. If a user does that without also changing `OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET`, **any machine on the LAN can mint a session cookie** — bypassing the API token entirely.

Combined attack chain:
1. User exposes port (removes `127.0.0.1:` binding)
2. Attacker on LAN reaches `http://<host>:7456/api/auth/bootstrap-token?clientTag=x`
3. Daemon sees Docker gateway IP (172.x.x.x) → `isPrivateSubnetAddress` returns true → nonce issued
4. Attacker exchanges nonce for `od-api-token` cookie
5. Attacker now has full API access equivalent to knowing `OD_API_TOKEN`

**Remediation:**
```yaml
- OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET=${OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET:-1}
```
This preserves the Docker-required default of `1` but lets users override it in `.env` if they change the port binding.

---

### H3. No Rate Limiting on Any Endpoint — Bootstrap Endpoints Allow Nonce Exhaustion and Brute Force

**Severity:** HIGH
**Category:** Insufficient Rate Limiting
**Location:** `apps/daemon/src/server.ts` lines 5082–5128 (bootstrap routes), entire daemon

**Issue:**
The daemon has no rate-limiting middleware. Specifically:

- `GET /api/auth/bootstrap-token` — accepts unlimited requests. Each request allocates a nonce entry in the in-memory `bootstrapNonces` Map (size grows with every request; cleaned every 30s).
- `POST /api/auth/bootstrap` — accepts unlimited POSTs with guessed nonces. Timing-safe comparison prevents brute-force of the token itself, but the nonce check is a simple `Map.has()`.
- All other `/api/*` endpoints are unrate-limited.

The `bootstrapNonces` cleanup interval runs every 30 seconds and removes entries older than 60 seconds (line 5064–5069). Between cleanups, an attacker on loopback or the private subnet can inflate the Map with millions of entries, potentially exhausting memory. Each entry stores a nonce string (UUID ~36 chars) plus `{ createdAt, clientTag }`.

**Exploitability:**
- An attacker on localhost (e.g., another process on the same machine) or on the LAN (if `OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET=1` and port is exposed) can make requests.
- Sending 500k requests in 30 seconds would create ~500k nonce entries. At ~100 bytes per entry, that's ~50 MB — not immediately fatal but wasteful.
- More practically: the attacker can rapidly consume nonces, forcing the server to do Map insertions and GC work, degrading performance for legitimate users.

**Remediation:**
Add rate-limiting middleware (e.g., `express-rate-limit`) to the daemon:
```typescript
import rateLimit from 'express-rate-limit';
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many auth requests' } },
});
app.use('/api/auth', authLimiter);
```
At minimum, rate-limit the bootstrap endpoints to 10–20 requests per minute per IP.

---

## Medium Issues

### M1. Cookie Secure Flag Depends on `req.secure` — May Be Incorrect Behind Reverse Proxies

**Severity:** MEDIUM
**Category:** Sensitive Data Exposure
**Location:** `apps/daemon/src/server.ts` line 5125

**Issue:**
The bootstrap cookie is set with `secure: req.secure`:

```javascript
res.cookie('od-api-token', apiToken, {
  httpOnly: true,
  sameSite: 'strict',
  path: '/',
  secure: req.secure,
});
```

When deployed behind a reverse proxy (Nginx, Caddy, Traefik) that handles TLS termination:
- `req.secure` is `false` unless the proxy forwards the `X-Forwarded-Proto: https` header AND Express is configured with `app.set('trust proxy', true)`.
- If the `trust proxy` setting is absent or misconfigured, the cookie's `Secure` flag is `false`, and the browser sends the API token cookie over plain HTTP connections.
- `req.secure` is also checked in the session cookie path. No explicit `trust proxy` configuration was observed in the daemon.

**Exploitability:**
An attacker on the same network as the reverse proxy (or with access to the internal Docker network) could intercept the cookie over HTTP. This is low-risk when the daemon is bound to `127.0.0.1` (Docker default) but becomes exploitable in LAN-exposed or public deployments.

**Remediation:**
```javascript
res.cookie('od-api-token', apiToken, {
  httpOnly: true,
  sameSite: 'strict',
  path: '/',
  secure: process.env.NODE_ENV === 'production' || req.secure,
});
```
And ensure `app.set('trust proxy', 1)` is set when the daemon runs behind a reverse proxy.

---

### M2. Bootstrap Cookie Has No `maxAge`/`expires` — Session Cookie Lasts Until Browser Close

**Severity:** MEDIUM
**Category:** Session Management
**Location:** `apps/daemon/src/server.ts` lines 5121–5126

**Issue:**
The bootstrap cookie is set without `maxAge` or `expires`, making it a session cookie that lasts until the browser tab/window closes. There is no server-side session invalidation mechanism. Once minted, the cookie:
- Is valid until browser close (potentially hours or days)
- Cannot be revoked server-side (no token blacklist)
- Is shared across all tabs in the same browser session

**Exploitability:**
If a user's machine is compromised or a session cookie is stolen via XSS (even with `httpOnly`, other cookies or side channels could expose it), the attacker can use the cookie until the browser restarts. There is no way to invalidate all sessions without restarting the daemon (which changes the in-memory `apiToken`).

**Remediation:**
Add a reasonable `maxAge` (e.g., 24 hours) and consider adding a server-side session revocation mechanism (e.g., a nonce-based session store with TTL):

```javascript
res.cookie('od-api-token', apiToken, {
  httpOnly: true,
  sameSite: 'strict',
  path: '/',
  secure: req.secure,
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
});
```

---

### M3. No Audit Logging of Auth Failures

**Severity:** MEDIUM
**Category:** Insufficient Logging & Monitoring
**Location:** `apps/daemon/src/server.ts` lines 5082–5128, 3213–3232, 4537–4560

**Issue:**
When authentication or bootstrap fails (401, 403), the daemon returns an error response but does **not** log the failure. Specifically:
- `verifyBearerOrCookieToken` returns `false` silently (line 3228)
- API token middleware returns 401 without logging (line 4555)
- Bootstrap token endpoint returns 403 without logging (line 5084)
- Bootstrap POST returns 401 without logging (lines 5103, 5110, 5116)

An attacker attempting to brute-force the API token or probe for vulnerabilities will leave no trace in the daemon logs.

**Exploitability:**
This is a detection gap. Brute-force attempts against the API token (via constant-time comparison at line 3231) would be rate-limited by TCP connection handling, but still should be logged for incident response. Any unauthorized access attempts cannot be detected post-hoc.

**Remediation:**
Add structured logging for authentication events:
```javascript
// On failure:
console.warn('[auth] bootstrap token request denied:', {
  ip: req.socket?.remoteAddress,
  path: req.path,
  reason: 'not on loopback or private subnet',
});

// On API token failure:
console.warn('[auth] API token rejected:', {
  ip: req.socket?.remoteAddress,
  path: req.path,
  method: req.method,
});
```

---

### M4. `isPrivateSubnetAddress` Does Not Include Link-Local (169.254.x.x) — Inconsistent with `origin-validation.ts`

**Severity:** MEDIUM
**Category:** Inconsistent Security Boundaries
**Location:**
- `apps/daemon/src/server.ts` lines 3196–3207 (`isPrivateSubnetAddress`)
- `apps/daemon/src/origin-validation.ts` lines 58–71 (`isPrivateIpv4`)

**Issue:**
Two different private-subnet detection implementations exist with different address coverage:

| Address Range | `server.ts` `isPrivateSubnetAddress` | `origin-validation.ts` `isPrivateIpv4` |
|---|---|---|
| `10.x.x.x` | ✅ | ✅ |
| `172.16–31.x.x` | ✅ | ✅ |
| `192.168.x.x` | ✅ | ✅ |
| `169.254.x.x` (link-local) | ❌ | ✅ |

- `origin-validation.ts`'s `isPrivateIpv4` includes `169.254.x.x` (link-local)
- `server.ts`'s `isPrivateSubnetAddress` does not

This means:
1. If a client connects from a link-local address, origin validation considers it private/LAN (allowing cross-origin requests), but bootstrap auth blocks it (no loopback, no private subnet).
2. A client on a 169.254.x.x network could potentially bypass origin-validation CORS checks but still be blocked by bootstrap auth.

**Exploitability:**
Low — 169.254.x.x is link-local (non-routable, single link only) and is rarely used for daemon access. The inconsistency could cause confusing behavior in IPv6 transition scenarios or Zeroconf networking setups.

**Remediation:**
Harmonize the two implementations. Either:
- Both include `169.254.x.x`, or
- Both exclude it, with a comment explaining why.

Prefer exclusion, since 169.254.x.x is link-local, not private/LAN, and should not confer trust.

---

## Low Issues

### L1. `Math.random()` Fallback for clientTag — Not Cryptographically Secure

**Severity:** LOW
**Category:** Weak Cryptography
**Location:** `apps/web/src/App.tsx` lines 789–791

**Issue:**
The `clientTag` uses `crypto.randomUUID()` when available (every modern browser) but falls back to `Math.random().toString(36).slice(2, 10)`:

```typescript
const clientTag = crypto.randomUUID
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2, 10);
```

`Math.random()` is not cryptographically secure — its output can be predicted given enough samples (Xorshift128+ seeding in V8). The fallback produces only ~41 bits of entropy (8 chars of base-36) vs 122 bits from UUIDv4.

**Exploitability:**
Extremely low. The `clientTag` is only used as a secondary binding to the nonce (server compares it if stored). The attacker would need to:
1. Know the nonce (a proper UUID — 122 bits, unguessable)
2. Predict the clientTag (only useful if they also know the nonce)

Without the nonce, the clientTag is worthless. And `crypto.randomUUID()` is available in all modern browsers (Chrome 61+, Firefox 72+, Safari 15+, Edge 79+). The fallback only triggers in ancient/niche environments.

**Remediation:**
Replace the fallback with a CSPRNG-based approach:
```typescript
const clientTag = crypto.randomUUID?.() ?? crypto.getRandomValues(new Uint32Array(4)).join('-');
```
Or simply require `crypto.randomUUID()` and let very old browsers use an empty clientTag (the server already handles `clientTag=''` gracefully).

---

### L2. `origin-validation.ts` Treats `0.0.0.0` and `::` as Loopback/Private LAN Hostnames

**Severity:** LOW
**Category:** Security Misconfiguration
**Location:** `apps/daemon/src/origin-validation.ts` lines 83–93

**Issue:**
`isLoopbackOrPrivateLanHost` includes `'0.0.0.0'` and `'::'` in its trusted hostnames:

```typescript
return (
  host === 'localhost' ||
  host === '127.0.0.1' ||
  host === '::1' ||
  host === '[::1]' ||
  host === '0.0.0.0' ||
  host === '::' ||
  isPrivateIpv4(host)
);
```

`0.0.0.0` is a bind address ("all interfaces"), not a valid source IP. `::` is the IPv6 unspecified address. Neither should appear in real HTTP `Host` or `Origin` headers from a browser. However, if a malicious client crafts a `Host: 0.0.0.0:7456` header, it would pass the origin check.

**Exploitability:**
Low. A browser will never set `Host: 0.0.0.0`. An attacker crafting raw HTTP requests would still need a valid API token or bootstrap cookie. This could only matter in specific HTTP request smuggling or reverse-proxy misrouting scenarios.

**Remediation:**
Remove `0.0.0.0` and `::` from the trusted hostnames since they are never legitimate client addresses.

---

### L3. `OD_ADDITIONAL_ALLOWED_DIRS` Passed to Container Without Validation

**Severity:** LOW
**Category:** Security Misconfiguration
**Location:** `deploy/docker-compose.yml` line 34

**Issue:**
`OD_ADDITIONAL_ALLOWED_DIRS` accepts a comma-separated list of directories the agent can access. It is passed through from the environment unchanged:

```yaml
- OD_ADDITIONAL_ALLOWED_DIRS=${OD_ADDITIONAL_ALLOWED_DIRS:-}
```

If a user accidentally sets this to `/etc`, `/proc`, or other sensitive system paths, the agent's spawned CLI could read or write those files inside the container.

**Exploitability:**
Low — user must explicitly set this, and most users won't. The `no-new-privileges:true` security opt (line 43) provides a partial safeguard.

**Remediation:**
Add a comment in `.env.example` explicitly warning about the security implications. Validate the paths server-side against deny-listed system directories (`/etc`, `/proc`, `/sys`, `/dev`, `/root`, etc.).

---

## Non-Issues (Flagged but Determined Safe)

### N1. Bootstrap Nonce Uses In-Memory Map Without Persistence

**Category:** Session Management
**Location:** `apps/daemon/src/server.ts` lines 5061–5062, 5090

**Assessment:** The `bootstrapNonces` Map is in-memory only, which means nonces are lost on daemon restart. This is **intentional** — nonces are single-use, short-lived (60s TTL), and bound to the requesting IP. Persistence would add no security benefit and would create a window for replay attacks after process restart. **Design is correct.**

### N2. Docker Port Binding Is `127.0.0.1:7456:7456` (Host-Local)

**Category:** Network Exposure
**Location:** `deploy/docker-compose.yml` line 38

**Assessment:** Port mapping explicitly binds to `127.0.0.1` on the Docker host, meaning the daemon is only reachable from the same machine. This prevents external network attacks and is the correct default. Users who need remote access must actively change this, and the `.env.example` warns them.

### N3. `OD_DISABLE_API_AUTH` Admits Broad Bypass

**Category:** Authentication
**Location:** `apps/daemon/src/api-token-auth.ts` lines 6–8, `deploy/docker-compose.yml` line 26

**Assessment:** `OD_DISABLE_API_AUTH` is an intentional escape hatch for CI/testing. The docker-compose passes it through from the environment, defaulting to unset. The `.env.example` correctly documents this. The key `isApiTokenMiddlewareEnabled` logic (`apiTokenFromEnv(env).length > 0 && !isApiAuthDisabled(env)`) correctly requires both a token and no explicit disable. This is sound.

---

## Overall Risk: MEDIUM

### Risk Rationale

The system implements a **defense-in-depth** auth model with several well-considered design choices:

1. **Network-layer trust** — Bootstrap is only available on loopback/private-subnet
2. **Proxied request detection** — Reverse proxies disable bootstrap (prevents SSRF)
3. **Single-use nonces** — 60-second TTL, bound to clientTag, deleted after use
4. **Constant-time token comparison** — Prevents timing attacks on `verifyBearerOrCookieToken`
5. **Host-local Docker binding** — Default deployment is not reachable from the LAN

The **three High issues** are not individually critical because the Docker defaults provide compensating controls (host-only port binding, which limits bootstrap vulnerability to localhost). However, they represent significant latent risk:

| Issue | Active Now | Becomes Critical When |
|---|---|---|
| H1 — Silent bootstrap failures | Users get a broken app | Any non-localhost deployment |
| H2 — Hardcoded subnet allowance | Mitigated by 127.0.0.1 binding | Port binding is changed |
| H3 — No rate limiting | Low impact (localhost only) | Port is exposed to LAN/Internet |

### Recommended Actions (Priority Order)

1. **Fix H2** immediately — change `OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET=1` to `${OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET:-1}` in `deploy/docker-compose.yml`
2. **Fix H1** — Add user-visible error feedback when bootstrap fails in `apps/web/src/App.tsx`
3. **Fix H3** — Add `express-rate-limit` middleware to `/api/auth/*` endpoints
4. **Fix M1/M2** — Add `trust proxy` setting, `maxAge`, and production-aware `secure` flag
5. **Fix M3** — Add structured logging for all auth failures
6. **Fix L2** — Remove `0.0.0.0` and `::` from trusted hostnames
7. **Fix L1** — Improve `Math.random()` fallback entropy
8. **Fix M4** — Harmonize `isPrivateSubnetAddress` with `isPrivateIpv4`
