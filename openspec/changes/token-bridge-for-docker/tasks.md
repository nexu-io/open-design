# Tasks: Token Bridge — Cookie-Based Access Token

**Status:** complete
**Parent:** design.md

## Implementation Tasks

- [x] **T1: Add `parseCookies` helper to `server.ts`**
  - File: `apps/daemon/src/server.ts`
  - Add a pure ~10-line function `parseCookies(cookieHeader: string): Record<string, string>` before the `startServer` function or near other utility functions
  - Handles: empty string, single cookie, multiple cookies, URL-encoded values, values containing `=`
  - No dependencies, no I/O
  - Acceptance: unit test passes with various cookie header inputs

- [x] **T2: Inject cookie on static HTML responses**
  - File: `apps/daemon/src/server.ts`
  - Modify `express.static(STATIC_DIR)` call (~line 5223) to include a `setHeaders` callback:
    - When `accessToken` is truthy and `filePath` ends with `'index.html'`, set `Set-Cookie: od_access_token=${encodeURIComponent(accessToken)}; Path=/; SameSite=Lax`
  - Compute the cookie header value once at startup as `const cookieHeaderValue = accessToken ? ... : null`
  - Acceptance: AC-1 (Cookie set on HTML response)

- [x] **T3: Inject cookie on SPA fallback responses**
  - File: `apps/daemon/src/server.ts`
  - Modify `registerStaticSpaFallback` function (~line 1468):
    - Add optional third parameter `accessToken?: string`
    - Before `res.sendFile(indexPath)`, check if `accessToken` is truthy → set the same `Set-Cookie` header
  - Update the call site (~line 15425): pass `accessToken` when available, `undefined` otherwise
  - The function signature change is backward-compatible (new parameter is optional)
  - Acceptance: AC-1 (Cookie set on SPA-routed HTML response)

- [x] **T4: Add cookie check to access-token middleware**
  - File: `apps/daemon/src/server.ts`
  - In the access-token middleware (~line 4724-4728), insert cookie check AFTER the loopback bypass and BEFORE the Bearer header check:
    ```typescript
    // Cookie-based token (browser auto-sends for same-origin requests)
    const cookies = parseCookies(req.get('cookie') ?? '');
    const cookieToken = cookies['od_access_token'];
    if (cookieToken && cookieToken === accessToken) return next();
    ```
  - The cookie check uses the same `accessToken` variable already in scope
  - Acceptance: AC-2 (Cookie accepted), AC-3 (Invalid cookie rejected)

- [x] **T5: Write tests for cookie auth flow**
  - File: `apps/daemon/tests/api-token-guard.test.ts`
  - Add new `describe('cookie-based access token')` block with test cases:
    - **T5a**: Cookie with valid token returns 200 from non-loopback address (bind to `0.0.0.0`, connect via machine's external IP with cookie header)
    - **T5b**: Cookie with invalid token returns 401 from non-loopback
    - **T5c**: Cookie with wrong value returns 401 from non-loopback
    - **T5d**: No cookie, no Bearer, non-loopback → 401 (regression guard)
    - **T5e**: Bearer header still works without cookie (backward compat)
    - **T5f**: Loopback bypass still works without cookie (local dev unaffected)
    - **T5g**: Probe paths still open without cookie (health/agents unaffected)
    - **T5h**: Cookie ignored when `OD_ACCESS_TOKEN` unset (no crash)
  - Test setup: use `startServer` with `port: 0, host: '0.0.0.0'` + `OD_ACCESS_TOKEN` to create a non-loopback binding, then fetch with `Cookie` header
  - Acceptance: AC-2 through AC-8

- [x] **T6: Run existing test suites — no regressions**
  - `pnpm --filter @open-design/daemon test` — daemon unit tests (including the 6 existing api-token-guard tests)
  - `pnpm typecheck` — full repo type checking
  - `pnpm guard` — repo boundary checks
  - Acceptance: AC-8 (Existing tests pass)

## Task Dependency Graph

```
T1 (parseCookies helper)
 ├─ T2 (cookie injection - static) ─┐
 ├─ T3 (cookie injection - SPA)   ─┤
 └─ T4 (cookie check middleware)   ─┤
                                    ├─ T5 (tests)
                                    └─ T6 (regression suite)
```

T1 is the foundation. T2, T3, T4 can be done in any order but all three need T1. T5 depends on T2+T3+T4 being implemented. T6 is the final gate.

## Estimated Diff

| File | Change | Lines |
|---|---|---|
| `apps/daemon/src/server.ts` | `parseCookies` helper, `setHeaders` callback, SPA fallback cookie, middleware cookie check | ~+35, ~−3 |
| `apps/daemon/tests/api-token-guard.test.ts` | 8 new test cases in new `describe` block | ~+100 |
| **Total** | | **~135 lines** |

Well under the 400-line review budget.
