# Electron Kit guide

Follow the root and `packages/AGENTS.md` guidance first.

- Own reusable Electron process, cold-start, window, fixture lifecycle, updater-provider, scene, and distribution mechanics.
- Own only lifecycle, orchestration, and public atomic mechanics. Concrete warmup graphs, product Sidecar messages, Web preload/readiness, routes, DOM knowledge, handlers, labels, and resource identities belong to `shells/electron` declarations and adapters.
- Treat Shell JSON as the authority for concrete topology and policy values, including warmup nodes and preflight host exemptions. Validate and execute finite atoms without turning JSON into an executable language or teaching electron-kit what a declared product value means.
- A desktop handler exists only inside an open Sidecar control session. electron-kit may own generic transport, finite declaration checks, timeout/abort and lease teardown, but Shell owns the message normalizer, concrete handler ids/bindings, and any Web/renderer dependencies. Never import `sidecar-proto` product messages here.
- Keep every Closure-facing connection in `ELECTRON_CLOSURE_ENDPOINTS`; reject unregistered messages instead of adding a generic invoke bridge.
- Import only public `@open-design/standalone` contracts. Never import `apps/closure`, another Shell, or product Web/daemon implementation.
- Keep the phase-one fixture replaceable through the same lifecycle and updater ports used by a real adapter.
- Keep source responsibilities layered under `boundary/`, `lifecycle/`, `runtime/`, `updater/`, `build/`, and `commands/`; mirror semantic test ownership below `tests/`.
- Package tests use the `@/*` alias for `src/*` imports.
