# apps/headless

Follow the root `AGENTS.md` and `apps/AGENTS.md` first. This app owns the shell-neutral Open Design product lifecycle.

## Owns

- Ordered startup and readiness of the daemon and Web runtimes.
- Product-level health and lifecycle diagnostics.
- Reverse-order, idempotent runtime shutdown.
- Explicit propagation of namespace-scoped data, resource, runtime, log, cache, and installation roots.

## Does not own

- Electron, Desktop IPC, windows, protocols, menus, or update UI.
- Release artifact discovery, download, activation, rollback, or shell launch policy.
- OS-specific process spawning, stamps, ports, or packaged filesystem inference.
- Codex Plugin installation or another shell's private state.

## Rules

- Consume runtime behavior through injected public adapters; do not import another app's private `src` tree.
- Never infer or normalize product paths. The launcher adapter supplies already-resolved roots.
- Always attempt shutdown in reverse startup order, even when one runtime fails to close.
- Keep candidate identity and compatibility parsing in `@open-design/closure-proto`.
