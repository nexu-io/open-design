# apps/standalone

Follow the root `AGENTS.md` and `apps/AGENTS.md` first. This app owns the deployable shell-neutral Open Design product composition.

## Owns

- The public Standalone application boundary and future executable entry.
- The protocol-fixed `bootloader.mjs` handoff-once entry over `@open-design/standalone-proto`.
- Composition of Web and daemon adapters into one product closure.
- Product lifecycle composition over semantic `@open-design/sidecar` launch/connect/stop operations.
- Product-facing exposure of common readiness, health, diagnostics, and shutdown.
- Composition of validated Standalone-owned and attachment-local Shell updater provider ports into one opaque projection; it must not interpret provider action ids.
- Serialization adapters that project attachment-local Shell capabilities and generation-shared Standalone body handles through the generic Sidecar control plane; transport-private service names stay out of standalone-proto.

## Does not own

- Electron, Desktop IPC, windows, protocols, menus, or update UI.
- Release artifact discovery, download, activation, rollback, or shell launch policy.
- Raw stamps, IPC paths, transport selection, process matching, or packaged filesystem inference.
- Codex Plugin installation or another shell's private state.

## Rules

- Consume body runtime behavior through launch specifications and semantic sidecar methods; do not import another app's private source tree.
- Reuse `@open-design/standalone-runtime`; do not duplicate its lifecycle state machine.
- Keep `bootloader.mjs` handoff-only: no candidate selection, download, Store/history, rollback, or body layout discovery.
- Never infer or normalize product paths. The launcher adapter supplies already-resolved roots.
- Always attempt shutdown in reverse startup order, even when one runtime fails to close.
- Keep live handoff validation in `@open-design/standalone-proto` and release candidate/integrity parsing in `@open-design/closure-proto`.
