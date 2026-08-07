# apps/standalone

Follow the root `AGENTS.md` and `apps/AGENTS.md` first. This app owns the deployable shell-neutral Open Design product composition.

## Owns

- The public Standalone application boundary and future executable entry.
- Composition of Web and daemon adapters into one product closure.
- Product-facing exposure of common readiness, health, diagnostics, and shutdown.

## Does not own

- Electron, Desktop IPC, windows, protocols, menus, or update UI.
- Release artifact discovery, download, activation, rollback, or shell launch policy.
- OS-specific process spawning, stamps, ports, or packaged filesystem inference.
- Codex Plugin installation or another shell's private state.

## Rules

- Consume runtime behavior through injected public adapters; do not import another app's private `src` tree.
- Reuse `@open-design/standalone-runtime`; do not duplicate its lifecycle state machine.
- Never infer or normalize product paths. The launcher adapter supplies already-resolved roots.
- Always attempt shutdown in reverse startup order, even when one runtime fails to close.
- Keep candidate identity and compatibility parsing in `@open-design/closure-proto`.
