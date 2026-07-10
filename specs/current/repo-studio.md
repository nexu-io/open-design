# Repo Studio

Status: experimental vertical slice

## Goal

Edit an existing React application from Open Design while keeping the target
repository's source code, component library, data architecture, and verification
commands canonical.

## Architecture

```txt
target Vite app
  -> loopback manifest + selection bridge
  -> Open Design Repo Studio canvas
  -> local-only daemon API
  -> constrained source edit
  -> target HMR + allowlisted verification
```

Open Design owns the studio shell, local daemon, preview frame, agent access,
diff/review UX, and verification display. The target app owns its components,
fixtures, data adapters, source markers, and verification declarations.

## Safety invariants

- The manifest URL must be loopback-local.
- The project root must be an absolute readable/writable directory.
- The browser never submits arbitrary files, tokens, or commands.
- A control selects only from source tokens declared by the target manifest.
- An edit is scoped to one unique marker and one unique token in a bounded window.
- Verification uses `spawn(..., { shell: false })` and only commands declared by
  the target manifest.
- Target application code remains the source of truth; Repo Studio stores no
  parallel canvas document.

## Initial Rune slice

- Rune exposes `/__rune_studio/manifest` from its Vite development server.
- Rune injects an `od-edit-*` compatible selection bridge in development.
- Home exposes a Library-backed task grid with fixture and live data modes.
- The first control changes the task grid between one, two, or three columns.
- Open Design exposes the feature at `/studio` and through `od studio`.

## Next slices

1. Source-aware text and design-token controls for registered React components.
2. Undo/redo transactions and Git diff rendering in the Studio UI.
3. Registered component insertion and MVVM View/ViewModel/fixture generation.
4. Agent-assisted structural edits behind explicit diff acceptance.
5. Screenshot and accessibility verification across phone/tablet/desktop.
