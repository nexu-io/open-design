# Spec: Token Bridge — Cookie-Based Access Token

**Status:** draft
**Parent:** proposal.md
**Created:** 2026-06-11

## Overview

The daemon must deliver the `OD_ACCESS_TOKEN` to the web UI via a cookie so the browser automatically includes it in `/api/*` requests, solving the 401 cascade in Docker and reverse-proxy deployments.

## Requirements

### R1: Cookie injection on HTML responses

The daemon SHALL set a `Set-Cookie: od_access_token=<token>; Path=/; SameSite=Lax` header when serving `index.html` responses, IF and ONLY IF `OD_ACCESS_TOKEN` is configured and non-empty.

**Implementation points:**
1. `express.static` middleware `setHeaders` callback for the static `out/` directory
2. `registerStaticSpaFallback` response for SPA-routed paths that resolve to `index.html`

**Rationale:** Both `express.static` (serves `/` → `index.html`) and the SPA fallback (serves `/some-route` → `index.html`) must set the cookie so the browser gets it on first load regardless of the entry URL.

### R2: Cookie validation in access-token middleware

The access-token middleware SHALL accept a valid `od_access_token` cookie as an alternative to the `Authorization: Bearer <token>` header.

**Priority order (first match wins):**
1. Open probe path (`/api/health`, `/api/ready`, `/api/version`, `/api/agents`) → skip auth
2. Project preview asset GET with valid scope → skip auth
3. Loopback remote address → skip auth
4. **NEW: Valid `od_access_token` cookie** → skip auth
5. Valid `Authorization: Bearer <token>` header → skip auth
6. None of the above → 401

### R3: Cookie parsing without external dependency

The daemon SHALL parse cookies using a lightweight inline helper (no `cookie-parser` npm dependency) to avoid adding a new dependency for a single-use case.

**Implementation:** A ~10-line `parseCookies(cookieHeader: string): Record<string, string>` function that splits on `;` and `=` and URL-decodes values.

### R4: No crash when OD_ACCESS_TOKEN is unset

When `OD_ACCESS_TOKEN` is not configured (auth mode is `none`):
- No cookie SHALL be set on HTML responses
- The access-token middleware SHALL NOT be registered
- Loopback-only behavior SHALL remain unchanged

### R5: Backward compatibility

The `Authorization: Bearer` header check SHALL continue to work exactly as before. Existing CLI tools, scripts, and external integrations that send the Bearer header must not break.

### R6: SameSite=Lax, Path=/, session cookie

The cookie attributes SHALL be:
- `Path=/` — sent with all requests on the origin
- `SameSite=Lax` — prevents cross-site request forgery
- No `HttpOnly` — allows future client-side JS access
- No `Secure` — works on plain HTTP (Docker localhost)
- No `Expires`/`Max-Age` — session cookie, cleared on browser close

## Acceptance Criteria

### AC-1: Cookie set on HTML response
**Given** daemon is running with `OD_ACCESS_TOKEN=test-token-123`
**When** browser requests `GET /` (or any SPA-routed path that resolves to index.html)
**Then** response includes `Set-Cookie: od_access_token=test-token-123; Path=/; SameSite=Lax`

### AC-2: Cookie accepted by middleware
**Given** daemon is running with `OD_ACCESS_TOKEN=test-token-123`
**When** browser requests `GET /api/projects` with `Cookie: od_access_token=test-token-123`
**And** remote address is NOT loopback (e.g., `172.17.0.1`)
**Then** response is 200 (not 401)

### AC-3: Invalid cookie rejected
**Given** daemon is running with `OD_ACCESS_TOKEN=test-token-123`
**When** browser requests `GET /api/projects` with `Cookie: od_access_token=wrong-token`
**Then** response is 401 with `ACCESS_TOKEN_REQUIRED` error

### AC-4: No cookie when token unset
**Given** daemon is running with NO `OD_ACCESS_TOKEN`
**When** browser requests `GET /`
**Then** response does NOT include `Set-Cookie: od_access_token` header

### AC-5: Bearer header still works
**Given** daemon is running with `OD_ACCESS_TOKEN=test-token-123`
**When** client requests `GET /api/projects` with `Authorization: Bearer test-token-123`
**And** NO `od_access_token` cookie
**Then** response is 200

### AC-6: Loopback bypass still works
**Given** daemon is running with `OD_ACCESS_TOKEN=test-token-123`
**When** client requests `GET /api/projects` from loopback address
**And** NO cookie and NO Bearer header
**Then** response is 200 (loopback short-circuit before cookie check)

### AC-7: Probe paths still open
**Given** daemon is running with `OD_ACCESS_TOKEN=test-token-123`
**When** client requests `GET /api/agents`, `GET /api/health`, etc.
**And** NO cookie and NO Bearer header
**And** remote address is NOT loopback
**Then** response is 200

### AC-8: Existing tests pass
**Given** the token bridge changes are applied
**When** running `pnpm --filter @open-design/daemon test`
**Then** all existing tests pass (no regressions)

## Test Plan

### Unit tests (`apps/daemon/tests/api-token-guard.test.ts`)

| # | Test | AC |
|---|---|---|
| T1 | Cookie with valid token bypasses auth on non-loopback | AC-2 |
| T2 | Cookie with invalid token returns 401 | AC-3 |
| T3 | Cookie with wrong token value returns 401 | AC-3 |
| T4 | No cookie, no Bearer, non-loopback → 401 | Regression |
| T5 | Bearer header still works without cookie | AC-5 |
| T6 | Loopback bypass still works (no cookie needed) | AC-6 |
| T7 | Cookie set on HTML response | AC-1 |
| T8 | No cookie when OD_ACCESS_TOKEN unset | AC-4 |

### Type checking
- `pnpm typecheck` on changed packages (daemon)

### Guard
- `pnpm guard` — 40/40 expected

## Files Affected

| File | Change |
|---|---|
| `apps/daemon/src/server.ts` | Add `parseCookies` helper, cookie injection on `express.static` and SPA fallback, cookie check in access-token middleware |
| `apps/daemon/tests/api-token-guard.test.ts` | Add 4 new test cases (T1-T4, plus T7-T8 may be separate or combined) |
