# Production Patches — E2E Coverage

This module documents the four production-only patches added in the
`rest-api-build-2214` fork and the E2E specs that verify each one.
These specs are the green-light gate before rebasing the fork onto
upstream `open-design-v0.5.0`.

---

## Overview

| Patch | Source file | Spec file | Strategy |
|-------|-------------|-----------|----------|
| Bug 9 — expired handshake JWT → 302 re-mint | `apps/daemon/src/tenants/resolver.ts` L196–299 | `specs/handshake.spec.ts` | Real Clerk + Caddy + daemon flow |
| Bug 10 — empty `__session` shadow skip | `apps/daemon/src/tenants/resolver.ts` L546–578 | `specs/cookie-shadow.spec.ts` | Request-level crafted Cookie header |
| Lumina-managed direct-Anthropic swap | `apps/daemon/src/server.ts` L2313–2349 | `specs/lumina-swap.spec.ts` | localStorage sentinel + SSE + Deploy button |
| Vercel env-var fallback deploy | `apps/daemon/src/deploy.ts` L60–96 | `specs/vercel-deploy.spec.ts` | Fixture HTML upload + Deploy button + URL probe |

Companion spec:

| Spec | Purpose |
|------|---------|
| `specs/jwt-expiry-survival.spec.ts` | Idle-session expiry: verifies the expired-cookie re-handshake path end-to-end |

---

## Patch 1 — Bug 9: Expired handshake JWT → 302 re-handshake (not 401)

### Background

The cross-subdomain handshake flow mints a short-lived JWT at
`app.holalumina.com/api/od-handshake`. If network delay or user idle caused
the JWT to expire before the tenant subdomain consumed it, the pre-fix
resolver returned 401. This completed a Bugs 6/7/8 cascade into an
infinite loop:

```
stale __session → redirect to handshake → expired JWT → 401 → reload →
stale __session → ...
```

### Fix

In `resolver.ts` (handshake-URL branch, lines 196–234): when
`verifyClerkSession()` throws `ClerkVerificationError(kind='expired')` for
the `__od_handshake` query-param JWT, the resolver redirects to the handshake
endpoint (re-mint) instead of returning 401. Only `expired` triggers 302;
`invalid_signature` and `malformed` remain 401 (indicate tampering, not
clock skew).

### What the spec verifies (`specs/handshake.spec.ts`)

- Core steps:
  1. Visit tenant subdomain with no cookies → browser passes through
     `app.holalumina.com/api/od-handshake`.
  2. Real email+password sign-in (not storage-state bypass) → tenant SPA loads.
  3. `__session` cookie is scoped to the tenant subdomain, not the apex.
  4. Subsequent navigation reuses the cookie without re-triggering handshake.
  5. GET to tenant with expired `__od_handshake` → HTTP 302 to handshake
     endpoint (not 401). This is the Bug 9 assertion.

- Saves storageState for downstream specs.

---

## Patch 2 — Bug 10: Empty `__session` shadow skip

### Background

Chrome sends multiple `__session=` attributes in a single `Cookie` header when
both a host-only cookie (Clerk satellite SDK leftover on `.holalumina.com`)
and a domain-scoped cookie (daemon-set on `tenant.opendesign.holalumina.com`)
exist in the same browser profile. The host-only one arrives first and is
empty. The pre-fix `readSessionCookie` returned `null` on the first empty
value, treating every authenticated request as anonymous → infinite redirect
loop.

### Fix

`readSessionCookie` (lines 562–578) now iterates all `; `-separated cookie
attributes, skips any `__session=` entry where the value is empty, and
returns the first non-empty value. Returns `null` only when no non-empty
`__session` is found.

### What the spec verifies (`specs/cookie-shadow.spec.ts`)

- Core steps:
  1. `Cookie: __session=` (empty only) → 302 to handshake (anonymous: correct).
  2. `Cookie: __session=; __session=<valid JWT>` → daemon resolves auth (Bug 10
     regression check: must not redirect to handshake).
  3. `Cookie: __session=<valid JWT>; __session=` → daemon resolves auth
     (reverse order also handled).
  4. Browser-level dual-cookie trigger: **test.skip** (see below).
  5. Smoke: load authenticated SPA via storageState → no cross-tenant strings.

### Limitation

The browser-level trigger (Chrome's host-only vs domain-scoped ordering in a
single Playwright session) cannot be reliably automated via the public
Playwright API — it requires CDP `Network.setCookie` with `hostOnly: true`,
which is out of scope. The request-level probe in tests 2–3 is byte-identical
to what Chrome sends and exercises the exact parser code path.

---

## Patch 3 — Lumina-managed direct-Anthropic swap (BYOK sentinel)

### Background

`/api/proxy/stream` normally routes all AI calls through the openclaw gateway
plugin pipeline when `LUMINA_GATEWAY_URL` + `LUMINA_GATEWAY_TOKEN` are set.
The gateway pipeline overwrites `messages[0]` (system prompt) with plugin-
specific instructions, breaking the `<artifact>` emission contract that
open-design's FileViewer depends on.

Operators who want direct Anthropic access (for design-canvas quality) set
sentinel values:

```json
{ "apiKey": "lumina-managed", "baseUrl": "https://lumina-gateway-managed" }
```

### Fix

`server.ts` (lines 2313–2349) checks for the sentinel pair before the gateway
override block. On match: swaps `baseUrl → https://api.anthropic.com` and
`apiKey → process.env.ANTHROPIC_API_KEY`. If `ANTHROPIC_API_KEY` is absent,
returns 502 `CONFIG_ERROR`. This MUST run first, before the
`LUMINA_GATEWAY_URL` override, because the gateway path is for plugin-routed
traffic while the direct-Anthropic path is for the open-design canvas LLM
contract.

### Known issue: BYOK system-prompt pollution

When the system prompt mentions code-agent tool names (`TodoWrite`, `Bash`,
etc.), `claude-sonnet-4-5` in direct-Anthropic mode emits `<write_file>` /
`<todo_write>` pseudo-XML instead of `<artifact>`. See
`feedback_byok_system_prompt_tool_pollution.md`.

The spec retries once with an explicit no-tools prefix. The permanent daemon-
side fix is to strip tool references from `composeSystemPrompt` when
`apiKey='lumina-managed'`.

### What the spec verifies (`specs/lumina-swap.spec.ts`)

- Core steps:
  1. Set `localStorage['open-design:config']` sentinel values.
  2. Send a test prompt via the chat composer.
  3. `/api/proxy/stream` must return HTTP 200.
  4. At least one SSE event must arrive.
  5. A `<artifact>` is emitted → FileViewer Deploy button appears.
  6. If `<write_file>` pollution is detected → retry once with no-tools prefix.

---

## Patch 4 — Vercel env-var fallback deploy

### Background

`readVercelConfig` previously read only `~/.open-design/vercel.json`. The
Hetzner daemon container has no persistent home-dir volume, so the file was
absent after every restart → all Vercel deploys failed with "token not
configured".

### Fix

`deploy.ts` (lines 60–96): `readVercelConfig` now falls back to environment
variables when the JSON file is absent or a field is empty:

```
VERCEL_API_TOKEN || VERCEL_TOKEN  →  token
VERCEL_TEAM_ID                    →  teamId
VERCEL_TEAM_SLUG                  →  teamSlug
```

Operators set these in the container env via docker-compose `env_file` or
Doppler. No persistent volume required.

### What the spec verifies (`specs/vercel-deploy.spec.ts`)

- Core steps:
  1. `GET /api/deploy/config` → `token` field is non-empty (env-var fallback).
  2. `POST /api/projects` → create test project, get `{ id }`.
  3. `POST /api/projects/:id/upload` (multipart) → upload pre-baked HTML fixture.
  4. Browser: navigate to file route, click Deploy button.
  5. Deploy API response → extract URL.
  6. Probe URL → HTTP 200.
  7. Deployed HTML contains fixture marker + no cross-tenant strings.

---

## Companion spec: JWT expiry survival

**File:** `specs/jwt-expiry-survival.spec.ts`

Verifies the steady-state expired-cookie re-handshake path (resolver.ts
lines 343–391) that protects users who stay on the design canvas for >5 min.

### Strategies

| `OD_E2E_JWT_STRATEGY` | Mechanism | Duration |
|------------------------|-----------|----------|
| `wait` (default) | `page.waitForTimeout(360_000)` | ~6 min |
| `backdate` | Replace cookie with synthetically expired JWT (exp=1) | <1 s |

`backdate` is recommended for CI. `wait` is recommended for nightly prod smoke
runs where prod-accuracy matters.

### What the spec verifies

1. After idle / cookie backdate, the next page navigation fires ≥1 handshake
   request and ultimately lands on the tenant SPA (no error screen).
2. No `401`/`Unauthorized` text in the DOM after re-handshake.
3. Page-level navigation with expired JWT → HTTP 302 to handshake (not 401).
4. `/api/*` request with expired JWT → HTTP 401 (browser-fetch cross-origin
   guard: the JS layer must surface a refresh prompt rather than silently
   failing with "Failed to fetch").

---

## Running the suite

### Enumerate specs

```bash
OD_E2E_TENANT=ceremonia \
pnpm --filter @open-design/e2e exec playwright test \
  --list --config=playwright.prod.config.ts
```

### Run against ceremonia

```bash
OD_E2E_TENANT=ceremonia \
OD_E2E_PROD_EMAIL=<email> \
OD_E2E_PROD_PASSWORD=<password> \
OD_E2E_JWT_STRATEGY=backdate \
pnpm --filter @open-design/e2e exec playwright test \
  --config=playwright.prod.config.ts
```

### Run against lumina

```bash
OD_E2E_TENANT=lumina \
OD_E2E_PROD_EMAIL=<email> \
OD_E2E_PROD_PASSWORD=<password> \
OD_E2E_JWT_STRATEGY=backdate \
pnpm --filter @open-design/e2e exec playwright test \
  --config=playwright.prod.config.ts
```

### Run against ericedmeades

```bash
OD_E2E_TENANT=ericedmeades \
OD_E2E_PROD_EMAIL=<email> \
OD_E2E_PROD_PASSWORD=<password> \
OD_E2E_JWT_STRATEGY=backdate \
pnpm --filter @open-design/e2e exec playwright test \
  --config=playwright.prod.config.ts
```

### Run a single spec

```bash
OD_E2E_TENANT=ceremonia \
OD_E2E_PROD_EMAIL=<email> \
OD_E2E_PROD_PASSWORD=<password> \
pnpm --filter @open-design/e2e exec playwright test \
  specs/handshake.spec.ts --config=playwright.prod.config.ts
```

---

## Tenant isolation rule

Every spec that loads tenant content asserts that none of the cross-tenant
strings (`lumina`, `ericedmeades`, `edmeades`, `ceremonia` — excluding the
active tenant) appears in the rendered DOM. A cross-tenant string in the DOM
is treated as an immediate test failure regardless of HTTP status code.
