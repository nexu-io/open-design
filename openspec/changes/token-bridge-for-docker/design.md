# Design: Token Bridge — Cookie-Based Access Token

**Status:** draft
**Parent:** spec.md

## Architecture Overview

Three small changes in one file, plus tests:

```
┌─────────────────────────────────────────────────────────┐
│  server.ts                                              │
│                                                         │
│  ┌───────────────────────────────────────────────┐      │
│  │  1. parseCookies() helper (~10 lines)          │      │
│  │     Splits Cookie header → {name: value} map   │      │
│  └───────────────────────────────────────────────┘      │
│                                                         │
│  ┌───────────────────────────────────────────────┐      │
│  │  2. Cookie injection on HTML responses         │      │
│  │     a. express.static setHeaders callback      │      │
│  │     b. registerStaticSpaFallback Set-Cookie    │      │
│  └───────────────────────────────────────────────┘      │
│                                                         │
│  ┌───────────────────────────────────────────────┐      │
│  │  3. Cookie check in access-token middleware    │      │
│  │     After loopback, before Bearer header       │      │
│  └───────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

---

## Component 1: `parseCookies()` Helper

### Current State

No cookie parsing exists in the daemon. The `cookie-parser` npm package would add a dependency for a single use case.

### Proposed Implementation

A lightweight inline function (~10 lines, pure, no I/O):

```typescript
function parseCookies(cookieHeader: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}
```

### Tradeoffs

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **Inline helper** (chosen) | Zero dependencies. Auditable in 10 lines. Handles all Unicode/edge cases. | Not as battle-tested as `cookie-parser`. | ✅ |
| `cookie-parser` npm | Well-tested, handles edge cases. | Adds a dependency for ~10 lines of logic. Overkill for a single cookie. | ❌ |
| Manual regex | One-liner. | Fragile — semicolons in values, whitespace variance, URL encoding. | ❌ |
| `req.headers.cookie` direct match | Simplest possible. | Doesn't handle multiple cookies, whitespace, or URL encoding. Breaks when other cookies are added. | ❌ |

### Edge Cases Handled

| Input | Output |
|---|---|
| `""` (empty) | `{}` |
| `"od_access_token=abc"` | `{ od_access_token: "abc" }` |
| `"a=1; b=2; od_access_token=abc"` | `{ a: "1", b: "2", od_access_token: "abc" }` |
| `"od_access_token=hello%20world"` | `{ od_access_token: "hello world" }` |
| `"od_access_token=a=b=c"` | `{ od_access_token: "a=b=c" }` (only first `=` splits key/value) |

---

## Component 2: Cookie Injection on HTML Responses

### Current State

```typescript
// Line ~5223 — static serving, no setHeaders callback
if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
}

// Line ~1468 — SPA fallback, no cookie header
export function registerStaticSpaFallback(app, staticDir) {
  app.get('/*splat', (req, res, next) => {
    const indexPath = resolveStaticSpaFallbackPath(req, staticDir);
    if (indexPath == null) return next();
    res.sendFile(indexPath);
  });
}
```

### Proposed Change

**Static serving** — add `setHeaders` callback:

```typescript
if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR, {
    setHeaders: (res, filePath) => {
      if (accessToken && filePath.endsWith('index.html')) {
        res.setHeader('Set-Cookie', cookieHeaderValue);
      }
    },
  }));
}
```

**SPA fallback** — set header before `sendFile`:

```typescript
export function registerStaticSpaFallback(app, staticDir, accessToken) {
  app.get('/*splat', (req, res, next) => {
    const indexPath = resolveStaticSpaFallbackPath(req, staticDir);
    if (indexPath == null) return next();
    if (accessToken) {
      res.setHeader('Set-Cookie', cookieHeaderValue);
    }
    res.sendFile(indexPath);
  });
}
```

**Cookie value** (computed once at startup):

```typescript
const cookieHeaderValue = accessToken
  ? `od_access_token=${encodeURIComponent(accessToken)}; Path=/; SameSite=Lax`
  : null;
```

### Tradeoffs

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **setHeaders + SPA fallback** (chosen) | Covers both entry paths. Cookie arrives on first load regardless of URL. | Touches two code locations. | ✅ |
| **setHeaders only** | One location. | Misses SPA-routed entry URLs (e.g., `/projects/123` on refresh). | ❌ |
| **Middleware before static** | Single injection point for all HTML. | Express static middleware runs before custom middleware on the same route. Need to intercept `sendFile` — messy. | ❌ |
| **Inject `<script>` into HTML** | Token available to JS via `window`. | Must parse HTML, find injection point, handle encoding. Fragile. Cookie approach doesn't need this because browser sends cookies automatically. | ❌ |
| **Add `Set-Cookie` to ALL responses** | Simpler logic. | Sets cookie on API responses, static assets, etc. Wasteful and noisy in DevTools. | ❌ |

### Why Inject on `index.html` Only

The browser only needs the cookie once per session. Setting it on the initial HTML response (the page load) is sufficient — the browser stores it and sends it with all subsequent requests. Setting it on API responses or static assets is unnecessary overhead.

The `index.html` heuristic is reliable because:
- `express.static` serves `index.html` for directory requests (`/` → `out/index.html`)
- The SPA fallback serves `index.html` for client-side routes (`/projects/123` → `out/index.html`)
- All other files (`.js`, `.css`, `.png`) don't need the cookie

### function Signature Change

`registerStaticSpaFallback` currently takes `(app, staticDir)`. It must accept an optional `accessToken` parameter:

```typescript
export function registerStaticSpaFallback(
  app: Express,
  staticDir: string,
  accessToken?: string,
): void
```

This is a **backward-compatible** change — callers that don't pass the third argument get the existing behavior (no cookie set).

---

## Component 3: Cookie Check in Access-Token Middleware

### Current State

```typescript
// Line ~4724-4728
if (isLoopbackPeerAddress(req.socket?.remoteAddress)) return next();
const auth = req.get('authorization') ?? '';
const match = /^Bearer\s+(\S+)\s*$/i.exec(auth);
if (!match || match[1] !== accessToken) {
  return res.status(401).json({...});
}
```

### Proposed Change

Insert cookie check between loopback bypass and Bearer header check:

```typescript
// Loopback bypass (existing)
if (isLoopbackPeerAddress(req.socket?.remoteAddress)) return next();

// Cookie-based token (NEW)
const cookies = parseCookies(req.get('cookie') ?? '');
const cookieToken = cookies['od_access_token'];
if (cookieToken && cookieToken === accessToken) return next();

// Bearer header (existing)
const auth = req.get('authorization') ?? '';
const match = /^Bearer\s+(\S+)\s*$/i.exec(auth);
if (!match || match[1] !== accessToken) {
  return res.status(401).json({
    error: { code: 'ACCESS_TOKEN_REQUIRED', message: 'Authorization: Bearer <OD_ACCESS_TOKEN> required' },
  });
}
return next();
```

### Priority Order Rationale

```
1. Open probe path       ← monitoring/agents always open
2. Preview asset scope   ← sandboxed iframes for HTML previews
3. Loopback address      ← desktop UI / local dev
4. Cookie token  (NEW)   ← browser in Docker/proxy deployments
5. Bearer header         ← CLI tools / scripts / external integrations
6. 401                   ← unauthenticated
```

The cookie check goes AFTER loopback because in local dev, the loopback bypass avoids the need for a cookie altogether (no unnecessary cookie set). The Bearer header check goes LAST because it's the least automatic — it requires explicit configuration on the client side.

### Tradeoffs

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **Cookie check before Bearer** (chosen) | Clean priority chain. Cookie is automatic (browser), Bearer is explicit (CLI). | — | ✅ |
| Cookie check after Bearer | Bearer takes priority (explicit auth beats automatic). | If both are present and cookie is stale, Bearer would override — but this is an edge case that confuses debugging. The cookie is set by the same daemon, so they should always match. | ❌ |
| Only cookie (remove Bearer) | Simplifies middleware. | Breaks CLI tools and scripts that send Bearer header. Violates backward compat. | ❌ |
| Both cookie AND Bearer required | Defense in depth. | Breaks existing clients. Unnecessary for threat model. | ❌ |

### Security: Timing Attack Consideration

The cookie check uses `===` string comparison, which is NOT constant-time. An attacker could theoretically measure response times to brute-force the token byte-by-byte.

**Risk assessment:** Low. The token is a 64-character hex string (`openssl rand -hex 32`). Brute-forcing via timing would require millions of requests. Rate limiting at the network/proxy layer (Cloudflare, nginx) would prevent this. The existing Bearer header check has the same vulnerability.

If constant-time comparison is desired in the future, it can be added to both checks atomically:

```typescript
import { timingSafeEqual } from 'node:crypto';
// ...
const bufA = Buffer.from(cookieToken);
const bufB = Buffer.from(accessToken);
if (bufA.length === bufB.length && timingSafeEqual(bufA, bufB)) return next();
```

This is out of scope for the current fix.

---

## Full Middleware Flow Diagram

```
Browser loads localhost:7456
│
├─ GET / (index.html)
│  └─ express.static setHeaders
│     └─ Set-Cookie: od_access_token=<token>; Path=/; SameSite=Lax
│
├─ GET /api/app-config
│  └─ Cookie: od_access_token=<token>  ← browser sends automatically
│     └─ Middleware: cookieToken === accessToken → next() → 200
│
├─ GET /api/projects
│  └─ Cookie: od_access_token=<token>
│     └─ Middleware: cookieToken === accessToken → next() → 200
│
├─ GET /api/agents?stream=1
│  └─ openProbePaths.has('/api/agents') → next() → 200 (SSE stream)
│     (Cookie not needed — probe paths are always open)
│
├─ POST /api/runs (CLI tool via Bearer)
│  └─ Authorization: Bearer <token>
│     └─ Middleware: Bearer header matches → next() → 200
│
└─ Any /api/* without cookie or Bearer from non-loopback
   └─ 401 ACCESS_TOKEN_REQUIRED
```

---

## Files Changed

| File | Change | Lines |
|---|---|---|
| `apps/daemon/src/server.ts` | Add `parseCookies` helper, cookie injection on `express.static` + SPA fallback, cookie check in middleware | ~+35, ~−3 |
| `apps/daemon/tests/api-token-guard.test.ts` | Add 6-8 new test cases for cookie auth | ~+80 |
| **Total** | | **~115 lines** |

Well under the 400-line review budget.

---

## Test Strategy

### New Tests (`api-token-guard.test.ts`)

| # | Test | What it proves |
|---|---|---|
| T1 | Cookie with valid token → 200 | Core cookie auth works |
| T2 | Cookie with invalid token → 401 | Wrong tokens rejected |
| T3 | Cookie with wrong token value → 401 | Exact match required |
| T4 | No cookie, no Bearer, non-loopback → 401 | Regression: protected without auth |
| T5 | Bearer header works without cookie | Backward compat |
| T6 | Loopback bypass still works | Local dev unaffected |
| T7 | Probe paths still open without cookie | Health/agents unaffected |
| T8 | Cookie ignored when auth mode is "none" | No crash without token |

### Existing Tests (must pass)

- `apps/daemon/tests/api-token-guard.test.ts` — 6 existing tests
- `apps/daemon/tests/` — all other daemon tests
- `apps/web/tests/` — web UI tests

### Test Setup Pattern

```typescript
describe('Cookie-based access token', () => {
  const token = 'test-cookie-token-123';
  
  test('accepts valid cookie token from non-loopback', async () => {
    const app = createApp({ OD_ACCESS_TOKEN: token });
    const res = await request(app)
      .get('/api/projects')
      .set('Cookie', `od_access_token=${token}`)
      .set('X-Forwarded-For', '10.0.0.1'); // simulate non-loopback
    expect(res.status).toBe(200); // was 401 before
  });
  
  test('rejects wrong cookie token', async () => {
    const app = createApp({ OD_ACCESS_TOKEN: token });
    const res = await request(app)
      .get('/api/projects')
      .set('Cookie', 'od_access_token=wrong-token')
      .set('X-Forwarded-For', '10.0.0.1');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCESS_TOKEN_REQUIRED');
  });
});
```

**Note on test isolation:** The existing tests use `supertest` which makes requests in-process (no actual TCP socket). The `remoteAddress` will be undefined or loopback. To test non-loopback behavior, we can either:
1. Set a mock `req.socket.remoteAddress` via middleware override
2. Use `X-Forwarded-For` to simulate a proxied request (the loopback check deliberately ignores this header)

The existing test suite uses approach 2 — tests set `X-Forwarded-For` to a non-loopback IP to test the bearer token requirement. We'll follow the same pattern.

---

## Rollback Plan

All three changes are independently reversible:

1. **Cookie injection:** Remove the `setHeaders` callback and the `accessToken` parameter from `registerStaticSpaFallback`. HTML is served identically to before.
2. **Cookie check:** Remove the 3 lines of cookie parsing/checking. Middleware falls back to Bearer-only.
3. **Helper:** Remove `parseCookies`. No other code depends on it.

No database migrations. No API version bumps. No client-side cache invalidation needed.
