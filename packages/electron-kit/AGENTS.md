# Electron Kit guide

Follow the root and `packages/AGENTS.md` guidance first.

- Own reusable Electron process, cold-start, window, fixture lifecycle, updater-provider, scene, and distribution mechanics.
- Own only lifecycle, orchestration, and public atomic mechanics. Concrete warmup graphs, product Sidecar messages, Web preload/readiness, routes, DOM knowledge, handlers, labels, and resource identities belong to `shells/electron` declarations and adapters.
- Treat Shell JSON as the authority for concrete topology and policy values, including warmup nodes and preflight host exemptions. Validate and execute finite atoms without turning JSON into an executable language or teaching electron-kit what a declared product value means.
- Keep concrete macOS/Windows distribution and installer policy in Shell JSON. electron-kit may validate a finite supported matrix and translate it to builder configuration; distribution policy must not leak into the release-neutral scene.
- Keep persistent cache roots, cache files, convergence graphs, hit/miss policy, retention, and immutable artifact registration outside electron-kit. `tools-pack` owns build-work reuse, `tools-release` owns verified final-artifact reuse, and convergence may cache only opaque scene products.
- A verified signed artifact is byte-immutable. `distribution/projection/` may model copy/wrap/sidecar metadata after reuse, but build information that must enter signed bytes is a pre-sign identity input and requires a rebuild.
- A desktop handler exists only inside an open Sidecar control session. electron-kit may own generic transport, finite declaration checks, timeout/abort and lease teardown, but Shell owns the message normalizer, concrete handler ids/bindings, and any Web/renderer dependencies. Never import `sidecar-proto` product messages here.
- Global shortcuts use the same finite ownership rule: electron-kit owns registration, rollback, observation and teardown; Shell owns every accelerator declaration and action binding. Do not add inert placeholder shortcuts or product menu actions here.
- Keep every Closure-facing connection in `ELECTRON_CLOSURE_ENDPOINTS`; reject unregistered messages instead of adding a generic invoke bridge.
- Import only public `@open-design/standalone` contracts. Never import `apps/closure`, another Shell, or product Web/daemon implementation.
- Keep the phase-one fixture replaceable through the same lifecycle and updater ports used by a real adapter.
- Keep source responsibilities layered under `contracts/`, `runtime/`, `integrations/`, `platform/`, `update/`, `distribution/`, `fixtures/`, and `commands/`; mirror semantic test ownership below `tests/`. Platform trees own reusable OS atoms and must not absorb installer workflow or product identity values.
- Derive Windows uninstall, App Paths, protocol, shortcut, and executable endpoints from one validated Shell manifest plus the finite Shell lifecycle policy. Treat registry entries as a projection after install-tree commit: runtime reconciliation may update an existing deterministic owner key, but must never create a missing uninstall identity. Cleanup must compare normalized owned paths and commands before deleting shared registry locations.
- Package tests use the `@/*` alias for `src/*` imports.
