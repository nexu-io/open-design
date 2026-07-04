# codex

The daemon's Codex-integration domain, organized as a machine-enforced
capability barrel (see `apps/daemon/src/design-systems/README.md` for the
reference implementation and `scripts/check-barrel-imports.ts` for the guard).

External daemon code imports Codex functionality **only** through the root
barrel `./codex/index.js` — never a subdir or a private file.

## What changed (refactor history)

Previously four flat sibling modules under `apps/daemon/src/`:

- `codex-cli.ts` → `mcp/codex-cli.ts`
- `codex-config-normalize.ts` → `config/codex-config-normalize.ts`
- `codex-pets.ts` → `pets/codex-pets.ts`
- `codex-rollout-usage.ts` → `rollout/codex-rollout-usage.ts`

Each moved verbatim (function bodies byte-identical; only import paths changed)
into a concern subdirectory with its own barrel, plus a new `core/` foundation.
The public surface is unchanged: the root barrel re-exports the exact same names
the four flat modules exported, so every external importer was repointed to the
barrel with no behavior change.

## Why this shape (architecture reasoning)

The four concerns are **mutually independent** — a pure star. `mcp` (installing
the OD MCP server into the Codex CLI), `config` (normalizing `config.toml`
before launch), `pets` (the hatch-pet registry), and `rollout` (first-call
usage extraction) share no logic with each other. The only thing shared is how
to resolve the Codex home directory, which `pets` and `rollout` do identically
(`$CODEX_HOME` → `~/.codex`); that lives in `core/` as the foundation kernel.

`config` intentionally does **not** use the `core` resolver: it must expand a
leading `~` via `runtimes/paths` (`expandHomePath`) so the normalizer patches
the same fully-expanded path the spawned Codex child process reads. Unifying the
two would be a behavior change and is deliberately avoided.

Because nothing depends on a non-foundation sibling, `allowedEdges` is empty.

## Import conventions

- External code: `import { … } from './codex/index.js';` (the root barrel).
- A subdir may import the foundation directly: `import { defaultCodexHome } from '../core/index.js';`
- No cross-sibling imports exist (and none are permitted — `allowedEdges: []`).
- The root barrel uses explicit named re-exports (guard rule 7); `defaultCodexHome`
  is an internal foundation primitive and is deliberately **not** on the root barrel.

## Directory structure

### `core/`
Foundation kernel. `codex-home.ts` — `defaultCodexHome(raw)`, the shared
`$CODEX_HOME`/`~/.codex` resolver used by `pets` and `rollout`.

### `mcp/`
`codex-cli.ts` — one-click install/uninstall of the OD MCP server via
`codex mcp add|remove|get`, with an injectable runner for tests.

### `config/`
`codex-config-normalize.ts` — idempotent, atomic normalization of
`config.toml` (stale `service_tier`, nested `[features.*]` tables).

### `pets/`
`codex-pets.ts` — lists user + bundled hatch-pets and resolves a single pet's
spritesheet for the `/api/codex-pets/:id/spritesheet` route.

### `rollout/`
`codex-rollout-usage.ts` — recovers a run's session id and extracts the opening
model call's cache-hit usage from the run's rollout JSONL.

## Types

Public types are re-exported through the barrel alongside their functions:
`CodexRunner`, `CodexRunnerResult`, `CodexInstallStatus`, `CodexInstallSpec`
(mcp); `CodexConfigIO` (config); `CodexPetSummaryRecord`, `CodexPetListResult`
(pets).
