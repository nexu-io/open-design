# shells

Follow the root `AGENTS.md` first. Shells are independently built launchers
around the Standalone product closure.

- Shells own installer integration, native capabilities, committed artifact
  selection, lazy loading, Shell updates and user-facing version projection.
- Shells consume `@open-design/standalone-proto`; they do not import private
  implementation from `apps/standalone`, `apps/web` or `apps/daemon`.
- A Shell may carry a fossil `bootloader.mjs`, but Web + daemon remain the
  Standalone body and are versioned independently inside the release descriptor.
- Tests live under each Shell package's `tests/` directory.
