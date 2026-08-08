# shells/electron

Follow the root `AGENTS.md` and `shells/AGENTS.md` first. This package is the
Electron Shell. It is a peer of `apps/standalone`, never part of the Standalone
product body.

## Owns

- Electron process, windows, menus, protocol registration, preload and native
  host capabilities.
- Launcher/Store policy, Standalone lazy loading, committed binding and Shell
  self-update or installer-required decisions.
- Projection of the launcher-owned release descriptor into the Standalone
  handoff and sidecar control plane.
- macOS and Windows Shell entrypoints consumed by `tools-pack`.

## Does not own

- Web or daemon product behavior.
- Standalone body lifecycle internals or sidecar transport details.
- Release publication, artifact construction or signing policy.
- A second version truth derived from Electron bundle metadata.

## Rules

- Consume `@open-design/standalone-proto`; never invent a second Shell-to-
  Standalone handoff shape.
- The launcher selects and persists the committed descriptor. Sidecar only
  projects that descriptor and must not select or update it.
- The root `bootloader.mjs` entry is best-effort handoff-once. Once an inner
  bootloader is selected, success or failure is terminal and no fallback body
  may start.
- Keep native feature migrations mechanical. Behavior changes to windows,
  export, IPC, diagnostics or updater UX require their existing tests to move
  with the implementation.
- A `minShellVersion` failure produces `installer-required`; it must never
  silently launch an incompatible Standalone generation.
