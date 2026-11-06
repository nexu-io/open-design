# Terminal Shell guide

Terminal is a native carrier distributed as POSIX `/bin/sh` and Windows
PowerShell 5.1. Its pnpm module registration exists for natural workspace
dependencies and Vitest/TypeScript tests; it is not the distributed runtime.

- Do not implement or distribute Terminal runtime behavior in TypeScript, and do
  not depend on a preinstalled Node runtime. TypeScript is allowed under tests.
- Pin official Node archives exactly. Verify archive bytes, the installed executable,
  and `node --version` before invoking the fossil adapter by absolute path.
- Keep the native layer mechanical: resolve fixed paths, install/probe the carrier,
  emit contract JSON, and execute `runtime/fossil.mjs`. It must not parse release
  metadata or mutate Standalone generation/reference state.
- `runtime/fossil.mjs` is a thin Shell-owned adapter. Store, update, activation,
  rollback, and lifecycle transactions remain in `@open-design/standalone`.
- Own target scene assembly and distribution. Consume Closure and Standalone only
  as explicit build artifacts supplied in a request; never import app sources.
- A distribution is complete and offline. Thin installers, when emitted, must pin
  one immutable archive URL and digest and may not resolve mutable latest metadata.
- Keep lifecycle execution behind the Standalone `LifecyclePort` seam and adapt
  that port only through the public `@open-design/sidecar` boundary. Terminal's fixture updater must exercise the
  complete Electron-facing provider contract, including progress, foreign-reference
  blocking, defer, and forced stop/install handoff; it is not a user-facing updater.
- Do not depend on `.github/scripts`, `tools/pack`, or `tools/release`.
