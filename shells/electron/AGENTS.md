# shells/electron

Follow the root `AGENTS.md` first. This directory owns the OpenDesign Electron
Shell and the typed adapter boundary consumed by repository tools.

## Ownership

- `config/` declares product identity, Shell compatibility, runtime policy,
  platform policy, and distribution policy.
- `src/` composes product handlers and adapters over `electron-kit`.
- `scripts/` owns thin, typed request/receipt entrypoints for development,
  packaging, runtime lifecycle, exact scene construction, and exact
  distribution.
- `tests/` validates Shell policy and both Shell/Closure updater handler lines.

`electron-kit` owns reusable Electron mechanics. `electron-contract` is the
browser-safe declaration leaf in that build closure. App producers and web
consumers declare capabilities without knowing the private symbol-backed
context bridge; do not expose `window.__od__` or another public physical
locator.

Tools must not import `electron-kit` directly. Keep tools-facing adapters
strict, file-backed, and explicit about absolute paths, channel, namespace,
release version, and operation schema.

Native CDP is enabled only through Electron launch arguments. `tools-dev`
enables it by default; any distributed Shell may enable it through explicit
argument injection. Inspect combines Shell lifecycle/status/log observations
with native CDP discovery rather than defining a separate debug protocol.

macOS Dock presentation controls only the current process. User “Keep in Dock”
state belongs to macOS and resolves through stable bundle identity. Linux has
only its symmetric declaration in this PR and no distribution delivery.
