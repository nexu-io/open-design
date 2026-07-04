# project

The daemon's project-content subsystem: the on-disk file registry for every
Open Design project, plus its storage locations, live file watchers, and
per-file version history. External runtime code imports **only** the root
barrel (`apps/daemon/src/project/index.js`); the internal layout below is free
to change without touching callers.

## What changed (refactor history)

1. Six flat modules under `apps/daemon/src/` were moved into one
   capability-barrel domain (import-path rewrites only; function bodies
   unchanged):
   - `projects.ts` → `project/core/projects.ts`
   - `project-ignored-dirs.ts` → `project/core/ignored-dirs.ts`
   - `project-root.ts` → `project/core/root.ts`
   - `project-locations.ts` → `project/locations/locations.ts`
   - `project-watchers.ts` → `project/watchers/watchers.ts`
   - `project-file-versions.ts` → `project/versions/file-versions.ts`
2. Each subdirectory gained a barrel `index.ts`; the domain root barrel
   `project/index.ts` re-exports the exact pre-refactor public surface with
   explicit named re-exports.
3. Every external importer (daemon `src/` and `tests/`) was rewritten from the
   old flat paths to the root barrel.
4. The domain was registered in `scripts/check-barrel-imports.ts`
   (`CAPABILITY_BARREL_DOMAINS`), so the boundaries are enforced by
   `pnpm guard`.

## Why this shape (architecture reasoning)

The flat files had no enforced boundaries: `project-file-versions.ts`,
`project-locations.ts`, and `project-watchers.ts` all reached directly into
`projects.ts`, and any new file could deepen that web silently.

- **`core/` is the foundation kernel.** `projects.ts` (the files registry and
  its path-safety primitives — `isSafeId`, `validateProjectPath`,
  `resolveProjectDir`, MIME/kind classification), the ignored-directory policy
  (`ignored-dirs.ts`), and daemon package-root resolution (`root.ts`). Every
  other subdirectory may import `core/` directly; `core/` never imports a
  sibling subdirectory.
- **`locations/`, `watchers/`, and `versions/` are leaf concerns.** Each
  depends only on `core/` primitives, so the domain is a pure star:
  `allowedEdges` is **empty**. There were no cycles to break — the flat
  imports already pointed one way, at `projects.ts`; the refactor makes that
  topology explicit and machine-enforced.
- Concern names describe what the code does (storage locations, file
  watching, version history), not language kinds — there is no `utils/` or
  `types/` bucket.

## Import conventions

Enforced by `scripts/check-barrel-imports.ts` (domain `project`) via
`pnpm guard`:

- External **runtime** code under `apps/daemon/src` imports only the root
  barrel `project/index.js` — never a subdirectory or private file.
- Subdirectories may import `core/` directly, by any path.
- Cross-subdirectory imports between `locations/`, `watchers/`, and
  `versions/` are forbidden (`allowedEdges: []`). If two of them ever need to
  share something, the shared piece moves down into `core/`.
- No subdirectory may import the domain root barrel (`../index.js`).
- The root barrel uses explicit named re-exports only — no `export *` — so the
  public surface stays enumerable and reviewable.
- Tests are exempt from the scan by design (they may white-box internals), but
  tests covering public-surface symbols still import them via the root barrel,
  exercising the API the way real consumers do.

## Known limitations & staged migration

- `core/projects.ts` keeps its historical `// @ts-nocheck` header — it
  predates the refactor and removing it is a type-hardening change that must
  not ride along with a structural move. Follow-up candidate.
- `core/projects.ts` is itself large (~1.7k lines spanning listing, archives,
  rename machinery, and search). Splitting it into focused core files is a
  possible follow-up; this refactor deliberately did not decompose it.
- `core/` depends on daemon modules outside the domain (`artifacts/*`,
  `sandbox-mode.js`, `workspace-contract.js`, `app-config.js` via
  `locations/`). The kernel rule is structural (no *sibling* imports), not a
  claim of zero external dependencies.

## Directory structure

```
project/
  index.ts        Root barrel — the public API; explicit named re-exports only.
  core/           Foundation kernel: files registry + path safety, ignored-dir policy, package-root resolution.
    projects.ts
    ignored-dirs.ts
    root.ts
    index.ts
  locations/      Built-in + user-configured project storage locations and the project manifest.
    locations.ts
    index.ts
  watchers/       Refcounted per-project chokidar watcher registry feeding live-reload SSE.
    watchers.ts
    index.ts
  versions/       Per-file version history store under `<project>/.file-versions/`.
    file-versions.ts
    index.ts
```

## Types

- `locations/`: `ProjectLocation` (a storage location; extends the persisted
  `ProjectLocationPrefs` from `app-config.js`) and `ProjectManifest` (the
  `.open-design/project.json` document).
- `watchers/`: `ProjectWatchKind` / `ProjectWatchEvent` /
  `ProjectWatchCallback` / `ProjectWatcherOptions` — the subscription event
  contract.
- `versions/`: `ProjectFileVersionLockContext` — the primitives available
  inside `withProjectFileVersionLock`. The wire DTO (`ProjectFileVersion`)
  lives in `@open-design/contracts`, not here.
- `core/projects.ts` is untyped (`@ts-nocheck`) and exports no named types;
  its shapes surface through the contracts package at the route layer.
