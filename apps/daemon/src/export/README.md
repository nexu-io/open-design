# export

Daemon module for Open Design's import/export surface: the project **import**, project **export**, and **finalize** HTTP routes, the **diagnostics bundle** download handler, the artifact **renderers** (deck → PPTX/PDF, desktop PDF/artifact render inputs, conversation → JSONL transcript), and the pure `od export` CLI request helpers.

It is a capability-barrel module built to the same machine-enforced pattern as the reference `design-systems/` module (#5088). If you are evaluating that pattern, read `design-systems/README.md` first; this file documents only what is specific to `export/`.

---

## What changed (refactor history)

The module was originally seven flat files sitting directly under `apps/daemon/src/`:
`deck-export.ts`, `pdf-export.ts`, `transcript-export.ts`, `diagnostics-export.ts`,
`export-cli-request.ts`, `export-cli-routing.ts`, and the 1,544-line `import-export-routes.ts`.
Nothing signalled which files belonged together or which depended on which — the HTTP route
layer, the renderers it drives, and the CLI helpers all shared one flat namespace.

The refactor was a strangler-fig pass — **no logic changes, only structural moves** — followed by machine enforcement:

1. Created `core/`, `cli/`, `renderers/`, `routes/` subdirectories under `export/`.
2. Moved each flat file to the subdirectory matching its concern (renaming to concise, context-carrying names):
   `export-cli-routing.ts → core/route-paths.ts`, `export-cli-request.ts → cli/request.ts`,
   `deck-export.ts → renderers/deck.ts`, `pdf-export.ts → renderers/pdf.ts`,
   `transcript-export.ts → renderers/transcript.ts`, `import-export-routes.ts → routes/import-export.ts`,
   `diagnostics-export.ts → routes/diagnostics.ts`.
3. Fixed relative import paths broken by the two-level-deeper move (`./x.js → ../../x.js`), and
   routed the one intra-domain edge (`routes/import-export.ts` → deck renderer) through the
   `renderers/` barrel instead of a private file.
4. Added `@module` docblocks to every file and JSDoc to every exported symbol.
5. Added per-subdirectory barrel `index.ts` files, and an `export/index.ts` root barrel that
   re-exports only from those subdir barrels with explicit named exports.
6. Updated the external importers (`server.ts`, `cli.ts`, `route-context-contract.ts`,
   `finalize-design.ts`, `handoff-design.ts`) and the test files to import from the root barrel.
7. Registered the `export` domain in `CAPABILITY_BARREL_DOMAINS` (`scripts/check-barrel-imports.ts`, run by `pnpm guard`).

The public API surface (the union of names the seven flat files exported) is unchanged — external consumers see no difference. See "Public-surface diff" in the PR.

**No cycle to break.** Unlike design-systems' `catalog ↔ user`, this domain had exactly one
intra-domain edge (`routes → renderers`) and no back-edge, so the split was already acyclic.
The one edge that looks like a cross-domain dependency — `routes/diagnostics.ts` importing
`spawnEnvForAgent` from the daemon's `agents.ts` — points **out** of `export/` to another
domain and is unaffected by the barrel guard (which only governs imports that land inside the domain).

---

## Why this shape (architecture reasoning)

Concerns, not file kinds:

- **`core/`** — the foundation kernel. Holds the pure, dependency-free `exportRoutePath` primitive
  (the export-format → daemon-route-path mapping). It imports nothing, so it sits at the bottom of
  the graph and is importable by any sibling directly.
- **`cli/`** — the `od export` request layer: pure helpers that shape the CLI's HTTP request body,
  its result envelope, and deck-vs-page resolution. Kept side-effect-free so `cli.ts` can unit-test
  it without triggering argv dispatch on import.
- **`renderers/`** — the artifact producers: `deck.ts` (deck slides → PPTX/PDF), `pdf.ts` (desktop
  PDF/artifact render inputs), `transcript.ts` (conversation history → JSONL). Each turns stored
  project content into an export artifact.
- **`routes/`** — the HTTP surface: `import-export.ts` (project import + export + finalize Express
  routes) and `diagnostics.ts` (the diagnostics-bundle download handler).

The dependency graph is intentionally minimal: **`routes → renderers`** is the only declared edge
(the export routes call the deck renderer). Everything else is either a `core/` import or an
outbound import to a different daemon module. A short `allowedEdges` list is the signal that the
concern split is right.

---

## Import conventions

These conventions are **machine-enforced** by `scripts/check-barrel-imports.ts` (part of `pnpm guard`); this domain's `foundation` and `allowedEdges` are declared in that file's `CAPABILITY_BARREL_DOMAINS` registry.

- All relative imports use `.js` extensions (Node ESM).
- **`core/` is the foundation kernel.** Any subdirectory may import it directly; `core/` imports no sibling.
- **A subdirectory may depend on a non-foundation sibling only along a declared, acyclic edge**, and only through that sibling's barrel (`'../<sibling>/index.js'`), never a private file. Current edge: `routes → renderers`.
- **A subdirectory must not import the domain root barrel** (`'../index.js'`).
- **A file directly under the domain root** (only `index.ts` here) may reach a subdir **only through that subdir's barrel**.
- **The domain root barrel uses explicit named re-exports**, never `export *` — the public surface must be enumerable.
- **External daemon code imports from `'./export/index.js'`** — never from a subdirectory path directly.
- **Tests are exempt, by design.** The guard scans only `src/` (runtime code). All export tests today cover public-surface symbols, and (per the convention, not machine-enforced) import them through `'../src/export/index.js'` so the public API is exercised the way real consumers use it.

---

## Known limitations & staged migration

- **`core/` is thin and imported by no sibling today.** It holds a single primitive, `exportRoutePath`.
  It is genuinely foundational (pure, dependency-free, and it encodes the format→route mapping that
  the export routes register as string literals), but the routes layer does not yet consume it — the
  route paths (`export/pptx`, `export/image`, `export/pdf-image`) are still duplicated between
  `core/route-paths.ts` and the literals in `routes/import-export.ts`. **Follow-up (separate PR):**
  have `routes/` derive its registered paths from `exportRoutePath` (a `routes → core` import is
  already allowed) so the CLI and the routes can never drift.
- **`renderers/` groups three loosely-related producers.** `deck.ts` and `pdf.ts` both build desktop
  render inputs from a project's HTML and share a `<base href>` derivation (a near-duplicate
  `rawBaseHref`/`displayTitle` pair worth hoisting to `core/` later); `transcript.ts` is a different
  concern (SQLite → JSONL) that shares only the "produce an export artifact" theme. Kept together to
  keep `allowedEdges` minimal; revisit if the renderers grow their own cross-dependencies.
- **`routes/import-export.ts` (~1,540 lines) was left intact** by the structural pass — it mixes the
  import, export, and finalize route registrations. A later behavior-preserving split of that file is
  a candidate, but out of scope for this move-only refactor.

---

## Directory structure

```
export/
├── index.ts              Main public barrel — explicit named re-exports from all subdirectories
├── core/                 Foundation kernel: the pure export route-path primitive
├── cli/                  Pure `od export` request/result/deck-mode helpers
├── renderers/            Artifact producers: deck (PPTX/PDF), desktop pdf/artifact inputs, transcript
└── routes/               HTTP surface: import/export/finalize routes + diagnostics bundle handler
```

### `core/`

| File | What it does |
|---|---|
| `route-paths.ts` | `exportRoutePath` — maps an export format to its daemon route path (pure, no imports) |

### `cli/`

| File | What it does |
|---|---|
| `request.ts` | `resolveExportCliDeckMode`, `buildExportCliRequestBody`, `buildExportCliResultEnvelope` for the `od export` CLI |

### `renderers/`

| File | What it does |
|---|---|
| `deck.ts` | Reads a deck file, builds the desktop slide-render input, assembles slides into a screenshot PPTX/PDF |
| `pdf.ts` | Builds the desktop PDF / generic artifact render inputs from a project HTML artifact |
| `transcript.ts` | One-shot dump of a project's conversation history to a `.transcript.jsonl` file, under a per-project lock |

### `routes/`

| File | What it does |
|---|---|
| `import-export.ts` | Registers the project import, project export, and finalize Express routes (delegates deck rendering to `renderers/`) |
| `diagnostics.ts` | Builds the diagnostics-bundle download handler (app version, config, logs, browser-use facts → ZIP) |

---

## Types

There are no domain-wide shared types: each file owns the option/result interfaces for its own
concern (e.g. `renderers/deck.ts` owns `BuildDeckRenderInputOptions`/`SlideImage`,
`routes/import-export.ts` owns the `Register*RoutesDeps` route-context types). They are re-exported
through their subdir barrel and the root barrel so external code (and `route-context-contract.ts`)
imports them from `'./export/index.js'`. Types purely local to one file stay unexported.
