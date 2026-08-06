# packages/closure-shim

Follow the root `AGENTS.md` and `packages/AGENTS.md` first.

This package is the Closure-owned, shell-carried `ensure + handoff` entry. It
coordinates existing Closure protocol, Store, update, and body-entry
primitives without becoming another product identity or state machine.

## Owns

- Validation of one shell request against channel, namespace, platform, and
  minimum shell version.
- Verification of the minimal pinned-key candidate signature.
- Selection, attempt arming, body handoff, health confirmation, and rollback
  through the existing Closure Store.
- The opaque dynamic body-entry contract and stable handoff result.

## Does not own

- Shell update UX, installer launch, permissions, windows, menus, or retries.
- Release publication, key rotation, body component selection, or live swap.
- Store layout, candidate download mechanics, Web/daemon internals, sidecar
  transport, or a general multi-shell lease.

## Rules

- The shell may supply resolved roots and timing, but must not receive body
  layout or mutate Closure Store truth.
- Bind every readiness result to the exact namespace and generation before
  confirming it.
- At most one unhealthy active candidate may be rolled back and retried with
  `lastSuccessful`; do not add an unbounded recovery ladder.
- Tests belong in `tests/`; keep generated demo bodies in temporary test roots,
  not as checked-in JavaScript artifacts.
