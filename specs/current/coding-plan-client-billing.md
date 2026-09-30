# Coding Plan client billing

The Vela Coding Plan rollout replaces the wallet-only zero-balance admission
rule in T55/T66. Zero wallet balance is not proof that an AMR run cannot start.
The existing removal of positive low-balance warnings remains in force.

## Authority and compatibility

- Link owns per-request model access, Coding Plan admission, wallet fallback,
  free-model handling and automatic recharge. Preflight does not reserve quota
  or guarantee that a whole agent run can complete.
- The daemon reads `vela billing preflight --workspace-id <id> --model <model>
  --format json` through the existing session/environment-aware CLI adapter.
- `/api/workspace/billing?scope=workspace&workspaceId=<id>&includePreflight=1`
  includes an optional `preflight`; optional `modelId` selects model coverage.
  Both wallet and preview must match the directory-verified member identity.
- `funding` is `coding_plan`, `wallet`, or `gateway`. The latter means the
  gateway must decide, not that the client should block. Coverage is advisory
  and does not replace membership/model-access checks.
- Old CLIs, missing capability, and unavailable usage do not synthesize zero
  quota. Existing exact workspace/member authorization still fails closed.
- `od workspace billing --workspace-type personal|team --workspace <id>
  [--model <id>] [--json]` exposes the same daemon response.

## User behavior

- Home and project sends do not block or show a balance card merely because
  the wallet is zero. Confirmed sign-out and invalid workspace authority retain
  their existing handling. Actual gateway insufficient-balance failures retain
  the existing error/recharge experience.
- The personal plan card shows remaining Coding Plan quota separately from
  wallet money: Go shows 5-hour and 7-day rows; Plus, Pro and Max show only
  the 7-day row; Free shows no quota row. Team workspaces retain their existing
  card. These are selected display periods, not every backend limit: windows
  are simultaneous limits, not additive balances, and none are labelled
  unlimited. Link still owns final admission across all applicable limits.
- The shared workspace/member billing cache refreshes on scoped Coding Plan
  usage events when upstream quota realtime and the renderer SSE are healthy,
  even while the card is closed. Older or unhealthy connections use 30-second
  visible-page polling as a fallback; reset-time and focus/reconnect
  revalidation remain available. A transient failed read retains usable
  last-good data; absent or unavailable preflight does not synthesize zero
  quota, and confirmed authorization revocation clears scoped cached data.
- Recovery polling is bound to the original workspace/member and selected
  model and requires positive funding evidence before resuming.

## Rollout and verification

Deploy the Vela API and distribute the new CLI to enable usage display. The
Open Design send fix remains compatible with older CLI/server combinations.
Unit/route/component tests cover dual-window exhaustion, member mismatch,
model propagation, old CLI behavior, zero-wallet sends, sign-out, and refresh
after quota reset. Final admission under concurrent usage remains Link-owned.
