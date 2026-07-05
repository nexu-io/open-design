# memory/ — capability-barrel module

The memory domain: the filesystem-backed markdown fact store, its in-process change
bus, extraction-attempt and self-verify telemetry buffers, the small-model LLM
extractor, rule-proposal distillation, and connector-sourced memory. It follows the
machine-enforced capability-barrel architecture; the canonical reference is
`apps/daemon/src/design-systems/`.

---

## What changed (refactor history)

Previously one large flat file (`memory.ts`) and five sibling flat files at the
`apps/daemon/src/` top level:

| Before (flat) | After |
| --- | --- |
| `memory.ts` (store, heuristics, config, index, tree, compose) | `store/store.ts` |
| `memory.ts` (change bus + change-event types) | `core/events.ts` ← **cycle-breaking lift** |
| `memory-extractions.ts` | `extractions/extractions.ts` |
| `memory-verify.ts` | `verify/verify.ts` |
| `memory-llm.ts` | `llm/llm.ts` |
| `memory-rules.ts` | `rules/rules.ts` |
| `memory-connectors.ts` | `connectors/connectors.ts` |

The moves were purely structural — no logic changes. Specific steps:

1. Created `core/`, `store/`, `extractions/`, `verify/`, `llm/`, `rules/`, `connectors/`
   subdirectories.
2. Moved each flat file to the subdirectory matching its concern.
3. Lifted the `memoryEvents` EventEmitter and its change-event types (`MemoryChangeKind`,
   `MemoryChangeEvent`) out of `memory.ts` into `core/events.ts` — this broke the former
   `store ↔ extractions` import cycle (both needed the emitter but previously `store`
   imported it from `extractions` and vice-versa).
4. Fixed relative import paths broken by the moves.
5. Added `@module` docblocks to each file for LLM/reader context.
6. Added per-subdirectory barrel `index.ts` files with summary docblocks, and made the
   root `index.ts` re-export only from those subdir barrels using explicit named
   re-exports.
7. Updated the external daemon files that imported from the flat namespace
   (`routes/memory.ts`, `server.ts` — static and the background dynamic `import()`,
   `brands/memory.ts`, `automation/proposals/proposals.ts`) to import from the barrel.
   `brands/index.ts` and `cli/memory/index.ts` were left untouched: their `./memory.js`
   resolves to their own local sibling file, not this domain.
8. Deleted the original flat source files.
9. Registered the `memory` domain in `scripts/check-barrel-imports.ts`
   (`CAPABILITY_BARREL_DOMAINS`) with its `foundation` and `allowedEdges` so
   `pnpm guard` enforces the dependency rules going forward.

The public API surface (the 50 named exports on `index.ts`) is unchanged — external
consumers see no difference.

---

## Why this shape (architecture reasoning)

The domain has two loosely-coupled halves: the **fact store** (`store/`) and the
**extraction + intelligence pipeline** (`extractions/`, `llm/`, `rules/`, `connectors/`).
They share only the change bus and its event types, so those live in `core/` as the
foundation kernel.

| Subdirectory | Role | Imports from |
| --- | --- | --- |
| `core/` | Foundation: change bus + event vocabulary | Nothing in the domain |
| `store/` | Filesystem store: config, index, CRUD, tree, prompt composition, heuristics | `core/`, `extractions/` |
| `extractions/` | In-memory ring buffer: extraction-attempt telemetry | `core/` |
| `verify/` | POST self-verify enforcement: scorecard parsing, verdict ring buffer | `core/` |
| `llm/` | Small-model LLM extractor: provider selection, model calls, write/suggest | `core/`, `store/`, `extractions/` |
| `rules/` | Annotation → rule-proposal distillation (heuristic + LLM) | `llm/` |
| `connectors/` | Connector-sourced memory: read connected apps, extract/suggest | `llm/` |

**Why the former `store ↔ extractions` cycle was broken:** `store/store.ts` needed
`recordHeuristic`/`recordSkip` from what was `memory-extractions.ts`, and
`memory-extractions.ts` needed the `memoryEvents` emitter from `memory.ts`. Moving the
emitter into `core/events.ts` made both `store/` and `extractions/` depend on `core/`
independently, eliminating the cycle.

**Why `verify/` is an independent leaf:** The self-verify enforcement is a pure function
over the assistant's turn text and the active rule entries. It never needs to write memory
or call the LLM — only `core/` (for the change bus) is required.

**Why `rules/` depends on `llm/` rather than `store/`:** The rule distiller calls
`suggestWithLLM` as a best-effort pass over annotations. It does not write memory itself
and does not need the store for anything else, so the edge goes through `llm/` only.

**Why `connectors/` depends on `llm/` rather than `store/`:** Same reasoning — both
`extractWithLLM` and `suggestWithLLM` are the only entry points needed; the connector
module does not touch the store directly.

The dependency graph is a DAG with no cycles. The `allowedEdges` list in the guard config
encodes exactly the edges in the table above.

---

## Import conventions

These conventions are **machine-enforced** by `scripts/check-barrel-imports.ts` (part
of `pnpm guard`); the domain's `foundation` and `allowedEdges` are declared in that
file's `CAPABILITY_BARREL_DOMAINS` registry, and the config itself is validated as
acyclic before any file is scanned.

- All relative imports use `.js` extensions (Node ESM).
- **`core/` is the foundation kernel.** Any subdirectory may import it directly
  (`'../core/index.js'` or a `'../core/<file>.js'` path); `core/` itself imports no
  sibling.
- **A subdirectory may depend on a non-foundation sibling only along a declared, acyclic
  edge**, and only through that sibling's barrel (`'../<sibling>/index.js'`), never a
  private file. Declared edges: `store → extractions`, `llm → store`, `llm → extractions`,
  `rules → llm`, `connectors → llm`. A would-be two-way edge is a design smell — relocate
  the shared piece to `core/` instead.
- **A subdirectory must not import the domain root barrel** (`'../index.js'`); it
  re-exports every subdir and invites a circular dependency. Reach `core/` or an allowed
  sibling barrel directly.
- **A file directly under the domain root** (the root `index.ts`) may reach a subdir
  only through that subdir's barrel, never a private file.
- **The domain root barrel uses explicit named re-exports**, never `export *` — the
  public surface must be enumerable and free of silent name collisions.
- **External daemon code imports from `'./memory/index.js'`** — never from a
  subdirectory path directly.
- **Tests are exempt, by design.** The guard scans only `src/` (runtime code); files
  under `apps/daemon/tests/` may white-box import subdir internals. Convention, not
  enforced: a test covering a symbol the root barrel exports should still import it via
  `'../src/memory/index.js'` so the public API is exercised the way real consumers use it.

---

## Known limitations & staged migration

- **`store/store.ts` is large (~1,100 lines including docs).** It mixes config
  management, entry CRUD, tree projection, prompt composition, and heuristic extraction.
  A follow-up could split it further (e.g. `store/config.ts`, `store/crud.ts`,
  `store/compose.ts`) but the current split already solves the cycle and the most acute
  coupling issues.
- **`llm/llm.ts` contains all provider call logic inline.** A future pass could extract
  each `callAnthropic` / `callOpenAI` / `callAzure` / `callGoogle` / `callLocalCli`
  into a `providers/` sub-layer inside `llm/`, but the single-file shape is adequate
  while the provider count is small.
- **`core/` membership is "imports nothing", not "a shared concern".** The emitter and
  event types are the only things that belong in `core/` for the memory domain. Unlike
  `design-systems/core/`, there are no generic utilities accidentally swept in.
- **The `verify/` module is currently not on any declared edge.** It is imported only by
  external daemon code (the routes and server). If a future subdirectory needs verify
  results, add a declared edge rather than importing from `verify/` directly.

---

## Directory structure

```
memory/
├── index.ts              Root barrel — 50 named re-exports from all subdirectories
├── core/                 Foundation: in-process change bus + change-event vocabulary
│   ├── index.ts
│   └── events.ts         memoryEvents emitter + MemoryChangeKind / MemoryChangeEvent
├── store/                Filesystem-backed markdown store: config, index, CRUD, tree,
│   ├── index.ts          prompt composition, active-rule listing, heuristic extractor
│   └── store.ts
├── extractions/          In-memory ring buffer of extraction-attempt telemetry
│   ├── index.ts
│   └── extractions.ts
├── verify/               POST self-verify enforcement: scorecard parsing, verdict buffer
│   ├── index.ts
│   └── verify.ts
├── llm/                  Small-model LLM extractor: provider selection, model calls,
│   ├── index.ts          annotation distillation, suggest/extract entry points
│   └── llm.ts
├── rules/                Annotation → rule-proposal distillation (heuristic + LLM)
│   ├── index.ts
│   └── rules.ts
└── connectors/           Connector-sourced memory: read connected apps, extract/suggest
    ├── index.ts
    └── connectors.ts
```

---

## Types

Shared types that cross subdir boundaries live in `@open-design/contracts` and are
imported directly where needed. Domain-local types:

- **`core/events.ts`** — `MemoryChangeKind` (union of change categories: `'upsert'`,
  `'delete'`, `'index'`, `'config'`, `'extract'`) and `MemoryChangeEvent` (the payload
  emitted on the `'change'` event of `memoryEvents`).
- **`verify/verify.ts`** — `ActiveRuleForVerify` (slim rule view: name + check line) and
  `EnforceVerifyInput` (all inputs to the pure `enforceVerify` function). The full
  `MemoryVerifyResult` and `MemoryVerifyRecord` shapes live in `@open-design/contracts`.
- **`rules/rules.ts`** — `DistillResult` (the merged proposal list, LLM-attempted flag,
  and source tag returned by `distillRulesFromAnnotations`).
- **`connectors/connectors.ts`** — `ExtractMemoryFromConnectorsOptions`,
  `ExtractMemoryFromConnectorsResult`, and `SuggestMemoryFromConnectorsResult`.

Types that are purely local to one file (ring-buffer record shapes, internal state
objects, private helper types) stay in that file and are not exported from the barrel.
