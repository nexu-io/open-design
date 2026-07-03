# design-systems

Daemon module for Open Design's design system registry, import pipeline, token extraction, and generation job store.

It is also the **reference implementation of the "capability barrel" pattern** — a machine-enforced module layout intended as the template for refactoring other large daemon modules. If you are here to evaluate that pattern, read "What changed", "Why this shape", and "Import conventions" below; the per-directory reference tables are at the end.

---

## What changed (refactor history)

The module was originally a flat directory of 13 source files alongside `index.ts`. As the surface grew the flat layout made it hard to understand which files belonged to which concern, and import paths gave no signal about dependency direction — any file could import any other, so nothing stopped cross-cutting coupling from accreting.

The refactor used a strangler-fig pattern — **no logic changes, only structural moves** — followed by machine enforcement:

1. Created `core/`, `catalog/`, `user/`, `import/`, `tokens/`, `jobs/` subdirectories.
2. Moved each flat source file to the subdirectory matching its concern.
3. Fixed relative import paths broken by the move.
4. Added `@module` docblocks to each file for LLM/reader context.
5. Added per-subdirectory barrel `index.ts` files with summary docblocks, and made the root `index.ts` re-export only from those subdir barrels.
6. Relocated `readUserMetadata` (a read primitive that lived in the write layer) into `core/metadata.ts` to break a `catalog ↔ user` dependency cycle.
7. Updated the external files that imported directly from the flat namespace (`routes/design-systems.ts`, `routes/static-resource.ts`, `skills.ts`, `cli.ts`, `server.ts`, `plugins/atoms/design-extract.ts`, `memory.ts`) to import from the barrel.
8. Deleted the original flat source files.
9. Added `scripts/check-barrel-imports.ts` (run by `pnpm guard`) to enforce the import rules below, plus `scripts/check-barrel-imports.test.ts` covering each rule.

The public API surface (`index.ts` exports) is unchanged — external consumers see no difference.

---

## Why this shape (architecture reasoning)

The layout was chosen through a recorded three-model debate (Claude Sonnet 4.6, Codex `gpt-5.5`, Gemini 3.1 Pro), scoring seven candidate structures. The two that won were adopted **together**:

| Option | What it was | Joint score |
|---|---|---|
| A. Status quo (flat) | leave the 13 files as-is | 5.7 |
| B. `features/` | group by product feature | 2.7 |
| C. `domains/` | group by domain, no enforcement | 5.3 |
| D. `domain/` + `infra/` | full DDD/hexagonal split | 5.0 |
| E. Route-centric | vertical slices per route | 7.3 |
| **F. Flat + tooling** | keep structure honest with a guard | **8.3** |
| **G. Capability barrels** | subdirs with barrels + one-way deps | **8.3** |

**Adopted: F + G (unanimous).** The decisive argument was that *structure without enforcement is cosmetic* — B and C rename folders but nothing stops the next PR from reintroducing the coupling the rename was meant to cure. D (full hexagonal) is architecturally clean but only realistic as a multi-month migration, not a strangler-fig pass. E (strict vertical slices) creates friction for genuinely cross-domain routes. So the module is organized into capability barrels (G) **and** the barrel rules are machine-checked (F) so they cannot silently rot.

The specific refactor initially scored **7/10**; the debate said the gap to 10 was: machine-enforced barrel rule, CI integration, and the pattern documented as precedent. All three are now done (the guard, its wiring into `pnpm guard`, and `apps/daemon/AGENTS.md` → "Capability Barrel Pattern").

The debate artifacts live under `ADS-project-knowledge/.local-artifacts/swarm-consensus/runs/2026-07-02-design-systems-debate/`.

---

## Import conventions

These conventions are **machine-enforced** by `scripts/check-barrel-imports.ts` (part of `pnpm guard`); the domain's `foundation` and `allowedEdges` are declared in that file's `CAPABILITY_BARREL_DOMAINS` registry, and the config itself is validated as acyclic before any file is scanned.

- All relative imports use `.js` extensions (Node ESM).
- **`core/` is the foundation kernel.** Any subdirectory may import it directly (`'../core/index.js'` or a `'../core/<file>.js'` path); `core/` itself imports no sibling.
- **A subdirectory may depend on a non-foundation sibling only along a declared, acyclic edge**, and only through that sibling's barrel (`'../<sibling>/index.js'`), never a private file. Current edges: `user → catalog`, `import → tokens`, `jobs → user`, `jobs → catalog`. A would-be two-way edge is a smell — relocate the shared piece to `core/` instead (as `readUserMetadata` was, to break a `catalog ↔ user` cycle).
- **A subdirectory must not import the domain root barrel** (`'../index.js'`); it re-exports every subdir and invites a circular dependency. Reach `core/` or an allowed sibling barrel directly.
- **A file directly under the domain root** (the root `index.ts`, or a straggler like `server-services.ts`) may reach a subdir **only through that subdir's barrel**, never a private file. Domain-root files carry no declared edges of their own.
- **The domain root barrel uses explicit named re-exports**, never `export *` — the public surface must be enumerable and free of silent name collisions.
- **External daemon code imports from `'./design-systems/index.js'`** (or the subpath equivalent) — never from a subdirectory path directly.
- **Tests are exempt, by design.** The guard scans only `src/` (runtime code); files under `apps/daemon/tests/` may white-box import subdir internals — most of those internals (e.g. `core/swift-colors`, `user/migration`, `tokens/token-contract`) are deliberately *not* on the public barrel, so unit-testing them requires reaching in. **Convention, not enforced:** a test covering a symbol the root barrel *does* export (a public-surface function like `renderDesignSystemPreview` or `parseFrontmatter`) should still import it from `'../src/design-systems/index.js'`, so the public API is exercised the way real consumers use it and future internal reshuffles stay free.

The guard scans static imports, re-exports (`export * from`, `export { } from`), `import type`, dynamic `import()`, and `import x = require()`. Its `check-barrel-imports.test.ts` suite exercises each rule plus the config-cycle validator.

---

## Known limitations & staged migration

This module is deliberately shipped as a *template*, so its rough edges are documented rather than hidden. When applying the pattern to larger modules (`server.ts`, `media/`), watch for these:

- **`core/` membership is currently "imports nothing", not "a shared concern".** That let two generic utilities land in the kernel: `frontmatter.ts` (a YAML parser also used by `skills.ts` and `memory.ts`) and `rename-args.ts` (a CLI argument parser). The side effect is that `skills`/`memory` now depend on the design-systems barrel for a string utility. **Follow-up (separate PR):** move genuinely generic utilities to a daemon-level shared location and drop the "surfaced for direct daemon use" re-exports from the root barrel.
- **`catalog/` groups three concerns under "read-only":** local-fs registry reads, HTML rendering (`showcase.ts`/`preview.ts`), and remote GitHub fetches (`source-context.ts`). "Non-mutating" is a weak layer boundary. For bigger modules, name layers by *concern*, not by mutability, or "read-only" becomes a junk drawer.
- **`body.ts` (~1,200 lines) was left intact** by the structural pass. It mixes DESIGN.md parsing, type guards, and generic escaping helpers, and is a candidate for a later split.
- **`allowedEdges` is an explicit acyclic partial order.** At ~6 subdirs this is the right primitive — every new edge is a reviewable one-line diff. Past ~8 subdirs the pairs list gets dense; if a future domain needs it, add an optional `layers: string[][]` config that expands to edges using the same enforcement engine.
- The guard's accepted-risk residue (bare `require()`, non-`.ts/.js` extensions, tsconfig path aliases — none present today) is documented in the script header.

**Staged migration guidance.** The template is meant to be applied to one module at a time, each as its own reviewable PR — not a single all-or-nothing rewrite. Per module: (1) carve concern-based subdirs, (2) add barrels + `@module` docblocks, (3) register the domain in `CAPABILITY_BARREL_DOMAINS` with its `foundation` and `allowedEdges`, (4) fix the violations the guard surfaces, (5) land with `pnpm guard` green. `media/` currently has only `@module` docblocks and is the next candidate.

---

## Directory structure

```
design-systems/
├── index.ts              Main public barrel — named re-exports from all subdirectories
├── server-services.ts    Service factory wired into server.ts at startup
├── core/                 Foundational parsers, utilities, shared types, metadata primitives
├── catalog/              Read-only catalog: listing, reading, asset resolution, previews
├── user/                 User-owned design system CRUD, revisions, and file management
├── import/               Import pipeline: local project scan, GitHub clone, shadcn registry
├── tokens/               Design token extraction, contract building, and rebuild assessment
└── jobs/                 In-memory job store for generation and revision workflows
```

### `core/`

Foundational building blocks with no dependencies on other subdirectories.

| File | What it does |
|---|---|
| `types.ts` | All shared TypeScript types and interfaces for the module (see "Types" below) |
| `body.ts` | DESIGN.md body parsing: markdown sections, swatch extraction, palette picking |
| `frontmatter.ts` | Minimal YAML front-matter parser for SKILL.md and DESIGN.md |
| `swift-colors.ts` | Parses SwiftUI `Color(...)` declarations into named hex swatches |
| `file-utils.ts` | Atomic file write helpers with snapshot/rollback support |
| `metadata.ts` | Read + validation primitives for a user design system's `metadata.json` (shared by catalog and user) |
| `rename-args.ts` | Argument parser for `od design-systems rename` — unit-testable in isolation |

### `catalog/`

Read-only operations over the design system registry (built-in + installed + user).

| File | What it does |
|---|---|
| `reader.ts` | `listDesignSystems`, `readDesignSystem`, `readDesignSystemPackageInfo`, `readDesignSystemPullFile` |
| `assets.ts` | Resolves runtime assets (tokens.css, components.html, manifest) from a package directory |
| `source-context.ts` | Fetches GitHub repository metadata to enrich generation prompts with upstream context |
| `showcase.ts` | Renders a full marketing page from a design system's DESIGN.md tokens |
| `preview.ts` | Renders the "before generate" design system viewer page |

### `user/`

CRUD layer for user-owned design systems stored under the daemon data root.

| File | What it does |
|---|---|
| `registry.ts` | Create, read, update, delete user design systems; link to projects |
| `revisions.ts` | Proposed DESIGN.md revisions with accept/reject workflow |
| `migration.ts` | One-time legacy artifact path migration run at startup |
| `ui-kit.ts` | Writes generated UI kit HTML from accepted revisions |

### `import/`

Import pipeline that materializes an external source into a user design system.

| File | What it does |
|---|---|
| `import.ts` | Scans a local project directory: CSS variables, components, assets, fonts → DESIGN.md + artifacts |
| `github-import.ts` | Shallow-clones a GitHub repo then delegates to the local importer |
| `shadcn-import.ts` | Fetches a shadcn registry item by URL or shorthand then delegates to the local importer |

### `tokens/`

Design token pipeline: evidence extraction → contract building → quality assessment.

| File | What it does |
|---|---|
| `token-evidence.ts` | Extracts CSS custom properties, colors, fonts, spacing, radius, and shadows from source files |
| `token-contract.ts` | Maps extracted evidence to an OD TOKEN_SCHEMA-aligned design token contract |
| `token-contract-rebuild.ts` | Scores the token contract, identifies weak A1 evidence, prepares a rebuild-request artifact |

### `jobs/`

| File | What it does |
|---|---|
| `generation-jobs.ts` | In-memory job store for generation, revision, and token-contract-rebuild workflows |

**Why a one-file subdirectory?** A subdir is justified by its edges, not its file count. `jobs/` is the domain's top orchestration layer and the only member with two declared dependency edges (`jobs → user`, `jobs → catalog`); collapsing it into the domain root would move it into the guarded straggler zone (domain-root files may only import subdir barrels, and carry no declared edges of their own). It is also a ~500-line store likely to grow as generation workflows expand.

---

## Types

All shared TypeScript types and interfaces live in `core/types.ts` and are re-exported through `core/index.ts` → `index.ts`.

**Why not a `types/` folder?** A dedicated `types/` directory is a common pattern but creates a circular-import risk here: implementation files (e.g. `source-context.ts`) import types, and if those types files needed to import from implementation modules for co-referencing, a cycle forms that TypeScript resolves non-deterministically. Co-locating shared types in `core/types.ts` keeps the dependency direction one-way: everything imports from `core/`, nothing in `core/` imports from the domain subdirectories.

Types that are purely local to one file (internal helpers, private state shapes) stay in that file and are not exported from the barrel.
