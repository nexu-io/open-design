# packages/shell

Follow the root `AGENTS.md` and `packages/AGENTS.md` first.

This package owns Shell persistence contracts shared across artifact tooling
and Shell runtime consumption.

## Owns

- The `./update` subpath: launcher payload pointers and
  `runtime/attempt/handoff/cleanup` descriptor schemas.
- The `./launch-context` subpath: transactional, leased local debug routing
  shared by tools-pack and Shell startup.
- Validation of those persisted descriptors.
- Deterministic channel/namespace/version layout below an explicit root.

## Does not own

- Electron processes, argv protocols, target selection, fallback execution,
  updater lifecycle, IPC, menus, or UI projection.
- Artifact construction, release publication, installer behavior, or signing.
- Standalone Closure selection, storage, or update policy.
- Renderer-facing host capabilities.

Keep serialized schema versions, filenames, and layout stable unless an
explicit migration is designed and accepted across every producer and
consumer.
