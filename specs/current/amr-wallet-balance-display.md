# AMR Wallet Balance Display

## Purpose

Open Design should show the signed-in AMR wallet balance inside the local
client so users can understand why AMR runs are available, low on balance, or
blocked by AMR billing.

This spec defines the first vertical slice. It intentionally keeps wallet
truth in Vela/AMR and does not add a new Open Design billing model.

## Problem Statement

The Open Design client can show that the user is signed in to AMR, but it does
not show the AMR wallet balance. Users discover balance issues only after a
run fails or enters AMR Cloud Recovery.

The obvious implementation choices have different consistency and dependency
costs:

- Vela API exposes the wallet ledger balance from `credit_balances`.
- Link owns the Redis projection used for model-call preflight and pending
  usage.
- Open Design daemon owns AMR local auth, CLI config, run preflight, and the
  web/CLI surfaces.

The accepted v1 tradeoff is to show the Vela API ledger balance and accept a
short inconsistency window while Link has pending usage in Redis.

## Goals

- Show AMR wallet balance in Open Design after the user signs in to AMR.
- Keep Open Design balance display sourced from Vela API, not from Link Redis.
- Avoid adding an API-to-Link read path for wallet display.
- Avoid adding Redis to the Vela API service for this feature.
- Avoid excess DB reads from the Open Design client by adding daemon-side short
  TTL caching and request coalescing.
- Keep run authorization owned by Link `CreditGuard.Check()`.
- Make UI copy clear that the displayed value is wallet balance, not a
  real-time available-balance guarantee.
- Expose the same account snapshot to web and `od` CLI surfaces.

## Non-Goals

- Do not show full subscription/package management in v1.
- Do not show usage history, recharge history, billing summary, or checkout
  controls inside Open Design.
- Do not read Link Redis from Vela API or Open Design.
- Do not make UI balance a run admission decision.
- Do not promise that the displayed balance already subtracts in-flight pending
  usage.
- Do not add a new Open Design billing database, wallet store, or persisted
  balance cache.
- Do not allow runtime keys to read wallet balance unless Vela API explicitly
  chooses that as a separate security decision.

## Accepted Product Semantics

Open Design displays the AMR ledger wallet balance returned by Vela API.

This balance may briefly differ from Link's runtime projection while one or
more model requests are in flight. That inconsistency is acceptable for v1.

Run start and model calls still rely on Link's runtime balance projection. If
the displayed wallet balance appears positive but Link rejects a run for
insufficient balance, Open Design should show the existing insufficient-balance
or AMR Cloud Recovery surface.

## Existing Context

### Open Design

Open Design currently exposes AMR login status through:

```http
GET /api/integrations/vela/status
```

That daemon route reads the local AMR profile/config and returns sign-in state,
user identity, profile, and config path. It does not read wallet balance.

The web client calls this status endpoint from multiple surfaces, including
Settings, Chat, EntryShell, and InlineModelSwitcher. Those surfaces must not
each create independent wallet polling loops.

Open Design's AMR config shape already recognizes profile fields including
`controlKey` and `runtimeKey`. Current AMR Cloud Recovery uses `runtimeKey`
for recovery endpoints. Wallet balance display should use the least-privileged
key accepted by Vela API.

### Vela API

Vela API currently exposes:

```http
GET /api/v1/wallet/balance
```

The current public response is:

```ts
{
  balanceUsd: string;
  updatedAt: string | null;
}
```

The route currently authenticates browser sessions. Other control-plane routes
such as `/api/v1/me` accept control keys and reject runtime keys. Wallet
balance display from Open Design daemon requires the wallet balance route to
accept a control key or a narrow equivalent read-only credential path.

Vela API currently has no Redis dependency, Redis client, or `REDIS_*` config.

### Link

Link owns Redis-backed runtime projection through `CreditGuard`:

- `credit_balance:{userId}` stores projected balance.
- `credit_usage_pending:{userId}` tracks in-flight pending usage.
- `Check()` gates model requests.
- `ApplyUsage()` deducts projected balance after successful usage recording.
- `/internal/credits/projection` lets API correct or invalidate Link's
  projection after settlement or recharge.

Open Design balance display must not read those Redis keys.

## Required Contract Changes

### Open Design Contracts

Add a shared account snapshot DTO in `packages/contracts`, for example:

```ts
export interface AmrWalletSnapshot {
  status: 'signed_out' | 'available' | 'unavailable';
  profile: string;
  user: {
    id?: string;
    email?: string;
    name?: string;
    plan?: string;
  } | null;
  balanceUsd: string | null;
  updatedAt: string | null;
  fetchedAt: string;
  stale: boolean;
  source: 'vela_api' | 'daemon_cache' | 'unavailable';
  error?: {
    code: 'signed_out' | 'missing_control_key' | 'unauthorized' | 'network' | 'upstream';
    message: string;
  };
}
```

The exact names can change during implementation, but the public contract must
make unavailable and stale states explicit. Do not represent unknown balance as
`0.00`.

### Vela API External Dependency

Extend `GET /api/v1/wallet/balance` so Open Design daemon can call it with the
AMR control key from the CLI device-login profile.

Rules:

- Accept browser session auth as today.
- Accept control-key bearer auth for this read-only route.
- Keep runtime-key bearer auth rejected for wallet reads unless separately
  approved.
- Return the existing response shape unless Vela wants to add optional
  metadata. Open Design v1 can work with `balanceUsd` and `updatedAt`.

This is an external dependency for the Open Design workstream, not part of the
Open Design implementation slice. Open Design must still handle the current
state where this endpoint returns unauthorized for daemon-held credentials.

## Open Design Daemon API

Add a daemon route:

```http
GET /api/integrations/vela/wallet
```

Behavior:

- Read the configured AMR profile using the existing Vela config/profile
  helpers.
- If the user is signed out, return `status: signed_out`.
- If the AMR profile has no control key, return `status: unavailable` with
  `missing_control_key`.
- Fetch Vela API `/api/v1/wallet/balance` with `Authorization: Bearer
  <controlKey>`.
- Reuse the existing AMR API URL/profile resolution rules. Do not introduce a
  second AMR API configuration path.
- Return a snapshot that includes login identity from local AMR status and
  balance from Vela API.

### Caching

The daemon should cache wallet snapshots by AMR profile and authenticated user
identity.

Default behavior:

- TTL: 5-10 seconds.
- Singleflight: concurrent reads for the same cache key share one upstream
  request.
- Manual refresh or sign-in/sign-out may bypass or invalidate the cache.
- The cache is in memory only and is not persisted.
- Cached values are for display only and must not be used for run admission.

Recommended cache key inputs:

- AMR profile;
- user id or email from local AMR profile;
- control key revision or config file mtime;
- Vela API URL.

## Web Surface

### Primary Placement

Settings -> Execution mode -> AMR card is the primary v1 surface.

When signed in, show:

- account email;
- wallet balance;
- `updatedAt` or `fetchedAt`;
- refresh state;
- existing AMR Console and Sign out actions.

Copy should say "Wallet balance" or "AMR wallet balance", not "real-time
available balance".

### Secondary Placement

Chat and run/recovery surfaces may reuse the same snapshot when it helps the
user understand insufficient-balance recovery. They should not start separate
polling loops.

Inline model switching may show a compact low-balance/unavailable hint, but it
should read from the shared snapshot state.

### Error States

UI states:

- signed out: show existing authorize action.
- loading: reserve layout space to avoid card shift.
- unavailable/network/upstream: show "Balance temporarily unavailable" and keep
  AMR Console available.
- unauthorized/missing control key: ask the user to sign in again.
- stale cache: show the last fetched value with a subtle stale indicator.

## CLI Surface

Add or extend an `od` command that exposes the same daemon snapshot, for
example:

```sh
od amr status --json
```

or extend an existing AMR/status command if one already exists during
implementation.

Requirements:

- Machine-readable JSON includes the same snapshot DTO.
- Human output prints account, wallet balance, freshness, and unavailable
  reason.
- CLI must call the daemon endpoint rather than reading AMR files directly.

## Refresh Policy

Refresh triggers:

- Settings AMR section opens.
- AMR login completes.
- AMR logout completes.
- App regains focus or visibility after a short quiet period.
- User clicks refresh/rescan.
- A run receives an insufficient-balance or AMR recovery event.
- A recovery resume/cancel/terminal action completes.

Do not poll indefinitely in the background. During an active run, refresh only
on bounded triggers; task admission remains Link-owned.

## Consistency Model

There are two balance concepts:

- Wallet ledger balance: Vela API DB value from `credit_balances`.
- Runtime projected balance: Link Redis value adjusted for in-flight pending
  usage.

v1 displays wallet ledger balance. It accepts that Link may reject a request
based on runtime projection after the UI showed a positive wallet balance.

This must be treated as a normal consistency window, not as a bug. The
insufficient-balance and recovery UI handles the user-facing consequence.

## DB Load Strategy

The main DB-load mitigation lives in Open Design daemon:

- one balance endpoint for all web surfaces;
- short TTL cache;
- singleflight request coalescing;
- no eager requests when AMR is unavailable or signed out;
- no bundled fetches of billing summary, usage history, or recharge history.

Vela API may later add a per-user in-process short cache around
`WalletService.getBalance()` if production metrics show DB pressure. That is a
follow-up optimization, not v1 scope.

## Redis Failure Behavior

Because v1 display does not read Link Redis:

- Redis outages do not directly affect Open Design wallet display.
- Redis outages may still affect Link run admission or model calls.
- Open Design should keep showing the wallet ledger balance if Vela API is
  available, but should not infer that a run can start.

If Link rejects a run because projection is unavailable, Open Design should use
normal run failure/recovery handling and avoid converting the wallet display
into a misleading success signal.

## Security

- Do not expose control keys or runtime keys in web DTOs, logs, persisted
  messages, analytics, or CLI output.
- Daemon wallet fetch must stay server-side.
- Browser code calls only the local daemon endpoint.
- Vela API should keep runtime keys rejected for wallet balance reads unless a
  separate security review approves runtime-key wallet scope.
- Missing or invalid control key should produce a re-auth/sign-in-again state.

## Implementation Plan

### Slice 1: Open Design Contracts and Daemon Client

- Add `AmrWalletSnapshot` contract type.
- Extend Vela config helpers to expose a control-key API context without
  leaking the key to public responses.
- Add a daemon wallet client that calls Vela API `/api/v1/wallet/balance`.
- Add daemon short TTL + singleflight cache.
- Add `GET /api/integrations/vela/wallet`.
- Add daemon tests for signed-out, missing control key, cache hit, singleflight,
  upstream error, and cache invalidation after logout.

### Slice 2: Web UI

- Add a shared AMR wallet snapshot provider/hook.
- Render wallet balance in the Settings AMR card.
- Reuse the shared snapshot in insufficient-balance/recovery surfaces where
  useful.
- Avoid independent wallet polling in each component.
- Add web tests for signed-in balance, loading, unavailable, stale, sign-out,
  and manual refresh behavior.

### Slice 3: CLI

- Add or extend `od` AMR/status command to call the daemon wallet endpoint.
- Support `--json`.
- Add CLI tests for available, signed-out, and unavailable states.

## Test Plan

External Vela API dependency:

- `GET /api/v1/wallet/balance` works with browser session auth.
- `GET /api/v1/wallet/balance` works with control-key bearer auth.
- `GET /api/v1/wallet/balance` rejects runtime-key bearer auth.
- OpenAPI and shared schema remain compatible.

Open Design daemon:

- wallet endpoint returns signed-out without upstream call.
- missing control key returns unavailable, not zero balance.
- upstream 401 maps to re-auth state.
- network/upstream errors map to unavailable.
- concurrent calls coalesce into one upstream request.
- cache TTL is honored and can be bypassed by refresh.
- logout invalidates cached wallet snapshot.

Open Design web:

- Settings AMR card shows balance for signed-in account.
- Balance unavailable state does not hide AMR Console.
- Manual refresh calls daemon endpoint once.
- Components share one snapshot and do not start duplicate polling loops.
- Existing AMR sign-in and model-list behavior remains intact.

Open Design CLI:

- human status prints account and wallet balance.
- `--json` prints the snapshot contract.
- signed-out and unavailable states are structured.

## Validation

Minimum local validation after implementation:

```sh
# Open Design
pnpm --filter @open-design/contracts typecheck
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/web test
pnpm guard
pnpm typecheck
```

Do not require Vela repository validation for the Open Design-only workstream.
If the external Vela dependency is not deployed yet, Open Design validation
should use mocked upstream responses and verify the unauthorized/unavailable
states.

## Open Decisions

No blocking decisions remain for v1.

Accepted decisions:

- display ledger wallet balance, not Link projected balance;
- accept short pending-usage inconsistency;
- no API-to-Link read path;
- no API Redis dependency;
- no full package/subscription display in v1;
- use control-key auth for daemon wallet reads if Vela API accepts it;
- keep runtime keys rejected for wallet reads.
