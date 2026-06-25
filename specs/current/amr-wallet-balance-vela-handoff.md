# AMR Wallet Balance Vela Handoff

## Context

Open Design needs to show the signed-in AMR wallet balance in the local client.
The accepted product decision is:

- Open Design displays the Vela API wallet ledger balance.
- Link remains the source of truth for runtime admission through
  `CreditGuard.Check()`.
- A short inconsistency window is acceptable while Link has in-flight pending
  usage in Redis.
- Open Design must not read Link Redis directly.
- Vela API should not add Redis for this display-only feature.

This handoff is only for the Vela-side dependency needed by Open Design.

## Vela-Side Goal

Allow Open Design daemon to call the existing wallet balance endpoint with the
AMR device-login control key:

```http
GET /api/v1/wallet/balance
Authorization: Bearer <controlKey>
```

The response can stay as it is today:

```ts
{
  balanceUsd: string;
  updatedAt: string | null;
}
```

Open Design does not need subscription/package details for v1.

## Current Evidence

Verified against `/Users/alche/Documents/vela` on 2026-06-23:

- `services/api/src/billing/http/routes.ts`
  - `GET /api/v1/wallet/balance` currently uses a local
    `authenticatedProfile()` helper.
  - That helper only reads the browser session through `auth.api.getSession`.
- `services/api/src/app.ts`
  - `getApiProfile(headers)` already accepts `Bearer <controlKey>`.
  - It authenticates through `repositories.controlKeys.authenticateControlKey`.
  - It returns `findProfileById(controlKey.userId)`.
  - It falls back to browser session auth when there is no bearer key.
- `services/api/src/billing/core.ts`
  - `WalletService.getBalance(appUserId)` calls billing storage and formats the
    public wallet balance response.
- `services/api/src/billing/infra/postgres.ts`
  - `getBalance()` reads `credit_balances`.
- `services/link/internal/usage/credit.go`
  - Link owns the Redis projection used for runtime balance checks.

## Required Change

Refactor the billing wallet route authentication so `GET
/api/v1/wallet/balance` accepts the same control-key auth path already used by
control-plane API routes.

Rules:

1. Keep browser session auth working exactly as today.
2. Accept control-key bearer auth for `GET /api/v1/wallet/balance`.
3. Keep runtime-key bearer auth rejected for wallet reads.
4. Do not add Redis to `services/api`.
5. Do not call Link from this route.
6. Do not change the wallet balance response to include pending usage.
7. Do not return `0.00` for auth or upstream errors.

The smallest likely shape is to reuse or inject the app-level `getApiProfile`
auth helper into billing route registration, instead of duplicating key auth in
`services/api/src/billing/http/routes.ts`.

## Non-Goals

- No package/subscription display for Open Design v1.
- No recharge history, usage history, or checkout changes.
- No API-to-Link Redis projection read.
- No API Redis cache.
- No runtime-key access to wallet balance.
- No Link admission behavior changes.
- No database schema change expected.

## Suggested Implementation Notes

Prefer one shared auth seam over a new billing-specific bearer parser:

- Keep route behavior obvious: wallet balance is a user-owned read endpoint.
- Avoid accidentally accepting runtime keys because runtime keys are meant for
  model execution, not account billing visibility.
- Avoid adding a second profile lookup path with slightly different email
  verification or user creation semantics.

If extracting the helper is awkward, a narrow route option is acceptable:

```ts
type GetApiProfile = (headers: Headers) => Promise<AppUserProfile | null>;
```

Then register billing routes with that function and use it only for endpoints
that should support control-key auth. For v1, the only required endpoint is
`GET /api/v1/wallet/balance`.

Be careful before applying control-key auth to billing mutation endpoints such
as checkout creation. Open Design only needs the read-only balance route.

## Redis and Concurrency Decision

Do not read Link Redis for this feature.

Reasoning:

- Link Redis includes pending usage and is optimized for runtime admission.
- The Open Design UI only needs account visibility.
- Reading Link Redis from Vela API would introduce another cross-service data
  path and new failure modes.
- User accepted the temporary difference between displayed ledger balance and
  Link's runtime projection during active tasks.

Do not add Redis to Vela API for this feature.

Reasoning:

- Open Design daemon will apply a 5-10 second in-memory TTL and singleflight to
  reduce API/DB fanout.
- The Vela route remains a simple ledger read.
- API DB load risk is bounded by daemon-side coalescing and short cache TTL.

## Failure Semantics Expected by Open Design

Open Design will interpret Vela responses as follows:

- `200`: show wallet balance.
- `401` or `403`: show re-auth / unavailable state, not zero balance.
- `5xx` or network failure: show "balance temporarily unavailable".

Vela does not need to create a special Open Design error shape. Keeping the
existing error style is acceptable, but tests should make the status code
contract explicit.

## Tests to Add in Vela

Add focused API tests around `GET /api/v1/wallet/balance`.

Required cases:

1. Browser session auth still returns wallet balance.
2. Valid control key returns the same wallet balance shape.
3. Valid runtime key is rejected with `401` or `403`.
4. Missing bearer/session is rejected.
5. Control key for one user cannot read another user's balance.

Good existing starting points:

- `services/api/test/api-routes.test.ts`
- `services/api/test/me.test.ts`
- `services/api/test/billing.test.ts`
- `services/api/test/e2e/device-login.test.ts`
- `services/api/test/e2e/runtime-keys.test.ts`

If the repo already has control-key helpers in `/me` tests, reuse those instead
of hand-creating key rows.

## Open Design Compatibility Contract

After the Vela change lands, Open Design daemon will call:

```http
GET {VELA_API_URL}/api/v1/wallet/balance
Authorization: Bearer <controlKey>
```

Open Design expects:

```ts
{
  balanceUsd: string;
  updatedAt: string | null;
}
```

No Open Design behavior should depend on Link Redis, pending usage keys, or a
new Vela API cache.

## Suggested Validation

Minimum Vela-side validation:

```bash
pnpm --filter @vela/api test -- wallet
pnpm --filter @vela/api test -- api-routes
pnpm typecheck
```

If the Vela repo's current package scripts differ, use the closest
package-scoped API test commands. For billing/wallet correctness work, prefer
one concrete local API or smoke proof in addition to unit tests.

## Acceptance Checklist

- `GET /api/v1/wallet/balance` accepts browser sessions.
- `GET /api/v1/wallet/balance` accepts control keys.
- Runtime keys remain rejected.
- Response shape remains compatible with Open Design v1.
- No Redis dependency added to `services/api`.
- No Link read path added.
- Tests cover control-key success and runtime-key rejection.
