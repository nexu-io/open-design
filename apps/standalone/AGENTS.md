# apps/standalone

Follow the root `AGENTS.md` and `apps/AGENTS.md` first. This app owns the deployable shell-neutral Open Design product composition.

## Owns

- The public Standalone application boundary and future executable entry.
- The protocol-fixed `bootloader.mjs` handoff-once entry over `@open-design/standalone-proto`.
- Composition of Web and daemon adapters into one product closure.
- Product lifecycle composition over semantic `@open-design/sidecar` launch/connect/stop operations.
- Initial Closure discovery, layered local/remote resource resolution,
  immutable Store verification, and exactly one committed-generation
  resolution before the live handoff is exposed to a Shell.
- Product-facing exposure of common readiness, health, diagnostics, and shutdown.
- Composition of validated Standalone-owned and attachment-local Shell updater provider ports into one opaque projection; it must not interpret provider action ids.
- Serialization adapters that project attachment-local Shell capabilities and generation-shared Standalone body handles through the generic Sidecar control plane; transport-private service names stay out of standalone-proto.
- The bundled `launcher.mjs` official-Node entry: decode one caller-fenced bootstrap, import one absolute body `bootloader.mjs`, attach the generation body service, and exit after the final attachment or stop request.
- The bundled generation `bootloader.mjs`: run under the Shell-owned official Node, derive native and launcher paths from the three-component installation root, then enter the process bridge once. Keep these layout details inside this fossil wrapper rather than expanding the shared handoff protocol.

## Does not own

- Electron, Desktop IPC, windows, protocols, menus, or update UI.
- Shell release discovery, Shell update UI, or Shell launch policy.
- Raw stamps, IPC paths, transport selection, process matching, or packaged filesystem inference.
- Codex Plugin installation or another shell's private state.

## Rules

- Consume body runtime behavior through launch specifications and semantic sidecar methods; do not import another app's private source tree.
- Reuse `@open-design/standalone-runtime`; do not duplicate its lifecycle state machine.
- Keep the root `bootloader.mjs` fossil handoff-only: it may enter the adjacent
  Standalone-owned baseline launcher once, but must not select a version,
  interpret a component graph, or fall back to a second target. The baseline
  launcher owns initial candidate resolution and Store commit.
- Never infer or normalize product paths. The launcher adapter supplies already-resolved roots.
- Always attempt shutdown in reverse startup order, even when one runtime fails to close.
- Keep live handoff validation in `@open-design/standalone-proto` and release candidate/integrity parsing in `@open-design/closure-proto`.
