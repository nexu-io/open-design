# packages/closure-shim

Follow the root `AGENTS.md` and `packages/AGENTS.md` first.

This package is an exploratory compatibility substrate retained while the
target `apps/standalone` + `standalone-proto` seam is proven. New product entry
behavior belongs in that target seam, not here.

## Owns

- Validation of one shell request against channel, namespace, platform, and
  minimum shell version.
- Reading and immutable verification of exactly one already-committed Store
  binding.
- One body handoff and generation-bound status/capability validation.

## Does not own

- Candidate discovery, signature policy, download, materialization, commit,
  history, rollback, retry, or update selection.
- Shell update UX, installer launch, permissions, windows, or menus.
- Web/daemon internals, body layout discovery, sidecar transport, or a general
  message bus.

## Rules

- Absence or invalidity of the committed binding is a visible terminal error.
- Enter at most one body and never fall back to another generation.
- The shell may supply resolved roots and timing, but must not receive body
  layout or mutate Closure Store truth.
- Bind every readiness result and Shell capability exchange to the exact
  namespace and generation.
- Tests belong in `tests/`; keep generated demo bodies in temporary test roots.
