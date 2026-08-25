# Electron Kit guide

Follow the root and `packages/AGENTS.md` guidance first.

- Own reusable Electron process, cold-start, window, fixture lifecycle, updater-provider, scene, and distribution mechanics.
- Keep every Closure-facing connection in `ELECTRON_CLOSURE_ENDPOINTS`; reject unregistered messages instead of adding a generic invoke bridge.
- Import only public `@open-design/standalone` contracts. Never import `apps/closure`, another Shell, or product Web/daemon implementation.
- Keep the phase-one fixture replaceable through the same lifecycle and updater ports used by a real adapter.
- Keep source responsibilities layered under `boundary/`, `lifecycle/`, `runtime/`, `updater/`, `build/`, and `commands/`; mirror semantic test ownership below `tests/`.
- Package tests use the `@/*` alias for `src/*` imports.
