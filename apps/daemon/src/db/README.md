# db — SQLite persistence module

All daemon SQLite access lives here. The module exposes a single public barrel
(`db/index.ts`) and is internally structured as a `core/` foundation kernel
plus one concern subdirectory per table or logical domain.

## What changed (refactor history)

`apps/daemon/src/db.ts` was a ~2,268-line god-file exporting 58 functions and
imported by roughly 18 daemon files. It provided every SQLite operation in one
flat file: connection management, schema migrations, and per-table CRUD for all
daemon tables.

The file was split into the `db/` capability-barrel layout. Function bodies
were moved byte-identically (machine-verified); no logic was altered during the
split. The public export surface — all 58 named exports — is unchanged. Every
external importer was mechanically repointed from `./db.js` to `./db/index.js`.

## Why this shape (architecture reasoning)

The layout follows the capability-barrel pattern used by `design-systems/` and
other daemon modules:

- **Foundation kernel (`core/`)** holds shared type aliases (`SqliteDb`,
  `DbRow`, `JsonObject`, `ChatSessionMode`), the JSON-parse primitive
  (`parseJsonOrUndef`), and the row-shaping helpers (`row`, `rows`). Every
  subdirectory may import `core/`; `core/` imports no sibling.

- **Concern subdirectories** are named by what they own: `connection/`,
  `schema/`, and one directory per table/domain (`deployments/`, `projects/`,
  `templates/`, `conversations/`, `agent-sessions/`, `messages/`,
  `preview-comments/`, `routines/`, `tabs/`). Each contains a single
  implementation file and an `index.ts` barrel.

- **Dependency graph is a DAG.** There is exactly one cross-concern edge:
  `connection/` imports `schema/` to run `migrate` immediately after
  `openDatabase`. Every other concern depends only on `core/`. The single short
  edge is the signal that concern boundaries are correctly drawn.

- **No pre-existing cycle had to be broken.** The previously file-private shared
  helpers (`parseJsonOrUndef`, `row`, `rows`) were relocated into `core/` so no
  two concerns share logic directly.

- **The root barrel is explicit.** `db/index.ts` uses named re-exports (`export
  { … } from '…'`) rather than `export *`, so the public surface is always
  visible at a glance and accidental re-exports are prevented.

## Import conventions

- **External daemon runtime code imports only `db/index.js`** — the root barrel.
  Never import a concern subdir or `core/` directly from outside `db/`.

- **Cross-subdir imports follow only the declared edge.** `connection/` may
  import `schema/` through `../schema/index.js`. No other cross-concern import
  is permitted.

- **A subdir never imports the root barrel.** Circular imports through
  `db/index.js` are a guard violation.

- **Subdir barrels may use `export *`.** Only the root barrel is required to use
  explicit named re-exports.

- **Tests are exempt from the import guard by design.** Test files may import
  internal helpers when needed for setup or assertion. Public-surface tests
  should still import via the root barrel to match production call sites.

## Known limitations & staged migration

- **Guard not yet registered.** The machine guard (`scripts/check-barrel-imports.ts`
  and `CAPABILITY_BARREL_DOMAINS`) does not exist on the current target branch
  (`main`). Registration is deferred to a follow-up once the guard
  infrastructure lands; the module already conforms to the required shape, so
  registration will be a one-line addition to the registry.

- **`JsonObject` is unused within the module.** The type alias existed in the
  original `db.ts` (never exported) and is retained in `core/types.ts` to keep
  the split a pure move with no incidental surface change. It is internal only —
  the root barrel does not re-export it — and is a candidate for removal in a
  focused follow-up.

- **`row`/`rows` have a single current consumer (`conversations/`).** They live
  in `core/` as generic, dependency-free row-shaping primitives rather than
  being owned by one concern, so they remain available without creating a
  cross-concern dependency.

- **`openDatabase` fallback path.** The function accepts a `projectRoot`
  fallback that resolves to `<projectRoot>/.od/app.sqlite` when no `dataDir` is
  supplied. This legacy escape candidate must not be extended; callers should
  pass the resolved `RUNTIME_DATA_DIR` explicitly per the daemon data directory
  contract.

## Directory structure

```
db/
├── index.ts              — public barrel; explicit named re-exports only
├── README.md             — this file
├── core/
│   ├── index.ts          — foundation barrel (export *)
│   ├── types.ts          — shared type aliases: SqliteDb, DbRow, JsonObject, ChatSessionMode
│   ├── json.ts           — parseJsonOrUndef: safe JSON.parse returning undefined on failure
│   └── rows.ts           — row / rows: typed row-shaping helpers for better-sqlite3 results
├── connection/
│   ├── index.ts          — barrel
│   └── connection.ts     — openDatabase / closeDatabase; the only caller of schema/migrate
├── schema/
│   ├── index.ts          — barrel
│   └── migrate.ts        — DDL + incremental migration runner
├── deployments/
│   ├── index.ts
│   └── deployments.ts    — CRUD for the deployments table
├── projects/
│   ├── index.ts
│   └── projects.ts       — CRUD + status queries for the projects table
├── templates/
│   ├── index.ts
│   └── templates.ts      — CRUD for the templates table
├── conversations/
│   ├── index.ts
│   └── conversations.ts  — CRUD for the conversations table; session-mode normalizer
├── agent-sessions/
│   ├── index.ts
│   └── agent-sessions.ts — get / upsert / clear for the agent_sessions table
├── messages/
│   ├── index.ts
│   └── messages.ts       — list / upsert / append-event / delete for the messages table
├── preview-comments/
│   ├── index.ts
│   └── preview-comments.ts — CRUD for the preview_comments table
├── routines/
│   ├── index.ts
│   └── routines.ts       — CRUD for routines and routine_runs tables
└── tabs/
    ├── index.ts
    └── tabs.ts           — listTabs / setTabs for the tabs table
```

## Types

Shared types live in `core/types.ts`. Each models a different layer of the
persistence boundary:

| Type | Models |
|---|---|
| `SqliteDb` | Alias for a `better-sqlite3` `Database` handle; passed rather than the class directly so callers stay decoupled from the driver. |
| `DbRow` | Loosely-typed row shape returned by `.get()` / `.all()`; narrow at the call site. |
| `JsonObject` | Plain JSON object with unknown value types. Currently unused within the module and not on the public barrel; retained from the original file for a pure move. |
| `ChatSessionMode` | Discriminated union `'design' \| 'chat' \| 'plan'` — the three first-class conversation modes stored in the `conversations.session_mode` column. |
