# shells/electron

Follow the root `AGENTS.md` and `shells/AGENTS.md` first. This package is the
Electron Shell. It is a peer of `apps/standalone`, never part of the Standalone
product body.

## Owns

- Electron process, windows, menus, protocol registration, preload and native
  host capabilities.
- Mechanical execution of the Shell-carried Standalone bootstrap resource
  using the Shell-carried official Node, followed by consumption of the one
  validated active-generation resolution it returns.
- Projection of Electron identity and capabilities into the Standalone handoff
  and generic sidecar control plane.
- Launcher argv, payload target selection, fallback execution and updater
  lifecycle around the shared `@open-design/shell/update` persistence contract.
- macOS and Windows Shell entrypoints consumed by `tools-pack`.

## Does not own

- Web or daemon product behavior.
- Standalone body lifecycle internals or sidecar transport details.
- Release publication, artifact construction or signing policy.
- A second version truth derived from Electron bundle metadata.

## Rules

- Consume `@open-design/standalone/protocol`; never invent a second Shell-to-
  Standalone handoff shape.
- The Shell never discovers, selects, downloads, materializes, commits, retries,
  or rolls back Closure generations. It supplies identity, roots, discovery
  capability, and repository-config location to the Standalone bootstrap, then
  consumes only its validated result.
- The root `bootloader.mjs` entry is best-effort handoff-once. Once an inner
  bootloader is selected, success or failure is terminal and no fallback body
  may start.
- Keep native feature migrations mechanical. Behavior changes to windows,
  export, IPC, diagnostics or updater UX require their existing tests to move
  with the implementation.
- A `minShellVersion` failure produces `installer-required`; it must never
  silently launch an incompatible Standalone generation.
- Metadata with a Closure graph is modern: transport it to Standalone and never
  consume legacy installation-floor fields. Metadata without Closure alone may
  use the `legacyXxx` adapter path.
