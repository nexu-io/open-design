# packages/standalone-runtime

Follow the root `AGENTS.md` and `packages/AGENTS.md` first. This package owns reusable, shell-neutral Standalone lifecycle primitives.

## Owns

- Ordered startup and readiness of daemon and Web runtime adapters.
- Product-level health and lifecycle diagnostics.
- Reverse-order, idempotent runtime shutdown.
- Verbatim propagation of launcher-resolved product paths.

## Does not own

- The deployable `apps/standalone` product composition.
- OS process spawning, sidecar stamps, ports, filesystem path inference, or shell IPC.
- Release artifact discovery, activation, rollback, or update UI.

## Rules

- Depend only on injected adapters and plain lifecycle types.
- Never import from `apps/` or infer shell-specific behavior.
- Always attempt every required shutdown step, even after an earlier close failure.
