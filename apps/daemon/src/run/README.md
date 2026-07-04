# `run/` — agent run execution domain

Capability-barrel module for cross-cutting concerns of agent run execution: result tracking, analytics, diagnostics, artifact management, and tool configuration. Previously a flat set of `run-*.ts` files; now split into enforced concern subdirectories.

## Why this shape

The flat `run-*.ts` files had no enforced boundaries — any file could import any other. The capability-barrel pattern makes those boundaries explicit and machine-enforced via `scripts/check-barrel-imports.ts`, so they cannot silently decay.

Design decisions follow the pattern established in `design-systems/` (see its README for the authoritative explanation). The `run/` domain has a pure-star topology (`allowedEdges: []`): every concern depends only on `core/`, and no sibling depends on another sibling.

## Import conventions

**External callers** (outside `apps/daemon/src/run/`) must import from the root barrel only:

```ts
import { classifyRunFailure, RunResult } from './run/index.js';       // from same dir
import { classifyRunFailure, RunResult } from '../run/index.js';      // from one level up
```

Never import a private subdir file directly:

```ts
// WRONG — the guard will flag this
import { classifyRunFailure } from './run/diagnostics/failure.js';
```

**Within `run/`**, concern subdirs import `core/` by any path and may import sibling barrels only along declared `allowedEdges` (currently none — this domain has no cross-sibling edges).

## Directory structure

```
run/
  core/          Foundation kernel — result types, error codes, retry policy.
  analytics/     Timing, usage, and runtime-type observability.
  diagnostics/   Failure classification and stderr/stdout tail collection.
  artifacts/     Filesystem snapshot and diff for tracking artifact changes.
  tools/         MCP tool bundle parsing, validation, and resolution.
  index.ts       Root barrel — explicit named re-exports only, no `export *`.
```

## Known limitations & staged migration

- The `run/` barrel covers only the 7 `run-*.ts` files present on `main` at refactor time. Two additional files (`run-lifecycle-tracer.ts` from PR #4431 and `run-html-version-snapshots.ts` from PR #4872) are in open branches; when those PRs land they should be re-homed into `analytics/` and `artifacts/` respectively, with their imports updated to use `../core/index.js`.
- `runtimes/runs.ts` carries a `@ts-nocheck` directive; it imports from the barrel but its own types are not fully annotated. That is pre-existing debt, not introduced by this refactor.
