# automation/ — capability-barrel module

The automation domain: scheduled **routines**, automation **templates**, evolution
**proposals**, and the source / routine-run **ingestion** pipeline. It follows the
machine-enforced capability-barrel architecture; the canonical reference is
`apps/daemon/src/design-systems/`.

## What changed (refactor history)

Previously five flat files under `apps/daemon/src/`:

- `routines.ts` (routine types + schedule math + `RoutineService`)
- `automation-templates.ts`, `automation-proposals.ts`, `automation-ingestions.ts`,
  `automation-routine-evolution.ts`

They imported each other directly with no enforced boundary. This refactor moved them
into `automation/` split by concern, extracted the shared routine type vocabulary into a
`core/` kernel, split `routines.ts` into pure schedule math vs. the stateful service, and
registered the domain in the barrel guard. Public export surface is unchanged — external
importers (`server.ts`, `routes/routine.ts`, `routes/automation.ts`) now import the root
barrel `./automation/index.js`.

| Before (flat) | After |
| --- | --- |
| `routines.ts` (types) | `core/types.ts` |
| `routines.ts` (schedule math + validation) | `routines/schedule.ts` |
| `routines.ts` (`RoutineService`) | `routines/service.ts` |
| `automation-templates.ts` | `templates/catalog.ts` |
| `automation-proposals.ts` | `proposals/proposals.ts` |
| `automation-ingestions.ts` | `ingestion/sources.ts` |
| `automation-routine-evolution.ts` | `ingestion/routine-evolution.ts` |

## Why this shape (architecture reasoning)

Two loosely-coupled halves live here: the **routine scheduler** and the **automation
intelligence pipeline** (templates → proposals → ingestion). They share only the routine
*type* vocabulary, so that vocabulary is the foundation kernel.

- **`core/`** — the shared routine types (a local mirror of `@open-design/contracts`
  routine types). Depends on nothing; every sibling may import it directly.
- **`routines/`** — the scheduler. `schedule.ts` is pure timezone/next-fire math and
  validation; `service.ts` is the stateful `RoutineService`. An independent leaf: it
  imports only `core/`.
- **`templates/`** — the automation template catalog (built-in + user templates).
- **`proposals/`** — the evolution-proposal lifecycle; applying a proposal can write a
  memory node (top-level `memory` module), a design-system/skill file, or an automation
  template (edge → `templates/`).
- **`ingestion/`** — turns sources and successful routine runs into content packets and
  proposals (edges → `proposals/`, `templates/`).

The intelligence pipeline flows `templates ← proposals ← ingestion`; the scheduler never
depends on it. The dependency graph is a DAG (no cycles), which is why the edge list is
short.

## Import conventions

- **External runtime code imports only the root barrel** `automation/index.ts` — never a
  subdir or private file. Enforced by `scripts/check-barrel-imports.ts`.
- A subdir may import `core/` directly.
- Cross-subdir imports are allowed **only** along a declared edge, **through the sibling
  barrel** (`../<sibling>/index.js`): `proposals → templates`, `ingestion → proposals`,
  `ingestion → templates`.
- The root barrel uses **explicit named re-exports** (no `export *`); subdir barrels may
  use either.
- Tests are exempt from the scan by design; but tests covering a public symbol still
  import it via the root barrel (`../src/automation/index.js`). Genuinely internal helpers
  may be white-boxed through deep paths.

## Known limitations & staged migration

- `core/types.ts` is a hand-maintained mirror of `packages/contracts/src/api/routines.ts`
  (kept local so the daemon typechecks under NodeNext). The shapes must stay aligned; a
  future follow-up could derive them from contracts directly.
- `proposals/` reaches the top-level `memory` module and writes `design-systems/` /
  `skills/` files under the data dir. Those cross-domain writes are outside this barrel's
  boundary and were intentionally left as-is (behavior-preserving move).

## Directory structure

```
automation/
  index.ts               root barrel — the domain's public API
  core/                  foundation: shared routine type vocabulary
    index.ts
    types.ts
  routines/              the routine scheduler (imports only core/)
    index.ts
    schedule.ts          pure next-fire math + schedule/target validation
    service.ts           stateful RoutineService (timers + run lifecycle)
  templates/             automation template catalog (built-in + user)
    index.ts
    catalog.ts
  proposals/             evolution-proposal lifecycle (edge → templates)
    index.ts
    proposals.ts
  ingestion/             source + routine-run ingestion (edges → proposals, templates)
    index.ts
    sources.ts
    routine-evolution.ts
```

## Types

The shared type vocabulary lives in `core/types.ts`: routine scheduling shapes
(`RoutineSchedule`, `RoutineProjectTarget`, `Weekday`, `RoutineContextSelection`), the
`Routine` / `RoutineRun` records, the run lifecycle enums (`RoutineRunStatus`,
`RoutineRunTrigger`), and the `RoutinePersistence` / `RoutineRunHandler` /
`RoutineRunHandlerStart` / `RoutineRunCompletion` contracts. Template, proposal, and
source-packet DTOs come from `@open-design/contracts` and are used directly where needed.
