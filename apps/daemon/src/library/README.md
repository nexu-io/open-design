# library/ — capability-barrel module

The OD Library domain: a global, content-addressed asset registry plus the
layers that fill it. Users clip images/HTML from the browser extension, upload
files, and produce deliverables through agent runs; the Library is the single
place all of it is indexed, deduped, browsed, and re-consumed. This module owns
the SQLite persistence, the idempotent registration/enrichment hook, the
reconcile sync that mirrors design systems and project deliverables, the
browser-extension pairing tokens, and skill/design-system install.

This directory follows the machine-enforced **capability-barrel** architecture.
The reference implementation and the full rationale live in
`apps/daemon/src/design-systems/` and its `README.md`; the enforcement lives in
`scripts/check-barrel-imports.ts` (`pnpm guard`).

## What changed (refactor history)

Previously five flat files under `apps/daemon/src/`:

| Old file | Lines | New home |
| --- | --- | --- |
| `library-store.ts` | 660 | `store/store.ts` (record types → `core/types.ts`) |
| `library.ts` | 419 | `assets/register.ts` (pure media/path helpers → `core/`) |
| `library-sync.ts` | 348 | `sync/sync.ts` |
| `library-install.ts` | 183 | `install/install.ts` |
| `library-tokens.ts` | 135 | `tokens/tokens.ts` |

Split into a `core/` foundation kernel plus five concern subdirectories, each
with a barrel. The public export surface is **identical** to before — every
name the old flat files exported is re-exported from `library/index.js`.
External importers (`server.ts`, `db.ts`, `routes/library.ts`,
`routes/static-resource.ts`) and the public-surface tests now import from the
root barrel. No behavior changed; this is a pure strangler-fig move.

## Why this shape (architecture reasoning)

The domain has a clean, shallow dependency DAG, so the clustering is by
*concern*, not by language kind:

- **Persistence is the base.** `store/` is pure SQLite — no filesystem, no
  hashing, no HTTP. Everything that mutates the Library goes through it.
- **`core/` breaks the type/helper coupling.** The shared record projections
  (`LibraryAssetRecord`, `LibraryTokenRow`) and the pure media/path primitives
  (mime sniffing, dimension sniffing, content-addressed path building, archive
  bucketing) were lifted into `core/` so `store/` imports no sibling and the
  asset/sync/tokens layers all share one source of truth.
- **Orchestration sits above persistence.** `assets/` owns the single idempotent
  `registerLibraryAsset` ingest hook, owned-object storage, sidecar writing, and
  bytes-path resolution (`assets → store`).
- **Sync sits above orchestration.** `sync/` reconciles design systems and
  project deliverables into referenced assets by calling the register hook and
  the store's cheap origin short-circuits (`sync → assets`, `sync → store`).
- **Tokens ride the store.** Extension pairing persists/reads token rows
  (`tokens → store`).
- **Install is an independent leaf.** `install/` installs skills and design
  systems from a GitHub URL or local path; it is grouped here by history and has
  no internal edges to the rest of the domain.

No cycles: `store/` depends only on `core/`, and nothing depends back on `sync/`
or `tokens/`.

## Import conventions

- **External code imports only `library/index.js`** (the root barrel), never a
  subdir or private file. Guard Rule 1.
- **Cross-subdir imports** go only along a declared `allowedEdges` edge and only
  through the sibling's barrel (`../store/index.js`, `../assets/index.js`).
- **`core/` is importable from anywhere** in the domain and imports no sibling.
- **The root barrel uses explicit named re-exports** (no `export *`); subdir
  barrels may `export *` from their own private files.

`allowedEdges`: `assets → store`, `sync → store`, `sync → assets`,
`tokens → store`.

## Known limitations & staged migration

- `install/install.ts` is still `// @ts-nocheck` (migrated verbatim from
  `library-install.ts`). Typing it is a follow-up; it is intentionally not part
  of this structural move.
- AI enrichment (caption / OCR / embedding) remains out of scope — the recorded
  enrichment task marks those stages `skipped` until a model is configured, as
  before. The `library_embeddings` table and `caption`/`ocr_text`/`palette`
  columns exist for that future slice.
- `install/` arguably belongs to a skill/design-system install domain rather
  than the Library; it is kept here to preserve the `library-` filename grouping
  and avoid scope creep in this PR.

## Directory structure

```
library/
  index.ts          root barrel — explicit named re-exports (public surface)
  core/             foundation: shared types + pure media/path primitives
  store/            SQLite persistence: schema + asset/source/task/token CRUD
  assets/           registration, owned storage, sidecars, bytes resolution
  sync/             reconcile design systems + project deliverables
  tokens/           browser-extension pairing + bearer tokens
  install/          install/uninstall user skills + design systems (@ts-nocheck)
```

### `core/`

`types.ts` — `LibraryAssetRecord`, `LibraryTokenRow`. `mime.ts` — `detectMime`,
`extForMime`, `kindForMime`, `sniffImageDimensions`. `paths.ts` —
`libraryObjectsDir`, `libraryObjectPath`, `archivedDateFor`. Imports no sibling.

### `store/`

`store.ts` — `migrateLibrary` plus asset, source, enrichment-task, and token
CRUD. Depends only on `core/`.

### `assets/`

`register.ts` — `registerLibraryAsset` (idempotent by content hash), Figma /
element sidecar helpers, and `resolveAssetBytesPath`. Depends on `core/` and
`store/`.

### `sync/`

`sync.ts` — `reconcileLibrary`: idempotent, best-effort mirroring of design
systems and agent-produced project deliverables as referenced assets. Depends on
`assets/` and `store/` (and, outside the domain, `db`, `projects`,
`design-systems`).

### `tokens/`

`tokens.ts` — pairing handshake, token minting/validation, and the in-memory
extension-origin allowlist seeded from SQLite. Depends on `core/` and `store/`.

### `install/`

`install.ts` — `installFromTarget` / `uninstallById` for user skills and design
systems, plus `sanitizeRepoName` and URL/name validators. Independent leaf.

## Types

Shared record projections live in `core/types.ts`
(`LibraryAssetRecord`, `LibraryTokenRow`). Store-input types
(`InsertLibraryAssetInput`, `LibraryAssetPatch`, `AddLibrarySourceInput`),
asset-register types (`RegisterLibrarySource`, `RegisterLibraryAssetInput`,
`RegisterLibraryAssetResult`), sync types (`ReconcileLibraryPaths`,
`ReconcileLibraryResult`), and the tokens `ConfirmPairingResult` stay with their
owning subdir and are re-exported from the root barrel. The public asset/task/
source contracts (`LibraryAsset`, `LibraryTask`, …) remain in
`@open-design/contracts`.
