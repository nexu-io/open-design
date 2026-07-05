# cli

The `od` CLI's subcommand implementations, organized as a machine-enforced
capability-barrel module. The entry point `apps/daemon/src/cli.ts` is a thin
shim (argv intake, `SUBCOMMAND_MAP`, root help, legacy `tools *` delegations);
everything it dispatches to lives here, one concern subdirectory per
subcommand family, guarded by `scripts/check-barrel-imports.ts` (domain
`cli`). The reference implementation for this pattern is
`apps/daemon/src/design-systems/` — read its README alongside this one.

## What changed (refactor history)

1. The original `src/cli.ts` was a 9,885-line god-file: 204 top-level
   functions, every `od` subcommand inline, and ~40 flag-set consts hoisted to
   the top of the file with "TDZ" comments because the top-level
   `await SUBCOMMAND_MAP[first](rest)` dispatch ran during module evaluation.
2. Every subcommand family moved into its own subdirectory under `src/cli/`
   (mechanical, byte-identical moves — 252/253 declaration bodies verified
   identical; the exception is the shim's own argv wiring).
3. Cross-domain helpers were relocated **down into `core/`** instead of
   becoming sibling edges: `streamRunEvents` (project + plugin),
   `readMemoryBodyFromFlags` (memory + automation), `coerceCliValue`
   (system + plugin), `LIBRARY_STRING/BOOLEAN_FLAGS` (library + system),
   plus the universal primitives (`parseFlags`, `positionalArgs`,
   daemon-url resolvers, structured-error helpers, prompt/body intake).
4. `src/cli.ts` became a ~250-line composition shim importing only the root
   barrel. Its path is load-bearing: `bin/od.mjs` loads `dist/cli.js`, tests
   spawn `src/cli.ts` via tsx, and `od plugin validate` re-spawns
   `process.argv[1]` — none of those callers changed.
5. The domain was registered in `CAPABILITY_BARREL_DOMAINS`
   (`scripts/check-barrel-imports.ts`), enforced by `pnpm guard`.
6. The now-false TDZ-hoisting comments were removed; each domain owns its
   flag sets, so the hoisting constraint no longer exists — module splitting
   *was* the fix.

## Why this shape (architecture reasoning)

- **Concern subdirectories, not type buckets.** Each subdirectory is one
  `od <subcommand>` family — the unit users, tests, and the daemon's HTTP
  surface already think in. There is no `utils/` or `helpers/` dumping
  ground.
- **A foundation kernel instead of sibling sharing.** When two domains need
  the same helper, it moves to `core/`; the answer is never "let A import B".
  That is why `allowedEdges` is **empty**: the dependency graph is a pure
  star — every domain depends only on `core/`, and `core/` imports no
  sibling.
- **Barrels are the only doors.** External runtime code (the entry shim)
  imports only the root barrel `index.ts`, which re-exports exactly the
  subcommand entry handlers with explicit named re-exports. Internals can
  move freely without breaking any importer.
- **Machine-enforced, not documented-only.** The guard turns every rule here
  into a CI failure; without it the flat namespace grows back.

## Import conventions

- External runtime code imports **only** the root barrel
  (`apps/daemon/src/cli/index.js`). Never a subdirectory or private file.
- Every subdirectory may import `core/` directly, by any path.
- Imports within the same subdirectory are unrestricted.
- Cross-subdirectory imports are forbidden — `allowedEdges` is empty by
  design. If a new feature needs a sibling's helper, move the helper to
  `core/` instead of declaring an edge.
- No subdirectory may import the root barrel (`../index.js`).
- Tests are exempt from the scan by design; tests covering a symbol the root
  barrel exports should still import it via the barrel, while genuinely
  internal helpers may be white-boxed through deep paths.

## Known limitations & staged migration

- **`@ts-nocheck` everywhere.** The original god-file was typecheck-exempt
  via a single file-wide `// @ts-nocheck`; each moved file carries it
  forward so this refactor stays a pure structural move. Removing it
  file-by-file (starting with `core/`, which has the smallest surface) is
  the planned follow-up.
- **`libraryDaemonUrl` is a historical alias** of `cliDaemonUrl` used by the
  library, system, and plugin domains. It was moved byte-identical; inlining
  it into its callers is deferred to the typing follow-up.
- **`LIBRARY_STRING/BOOLEAN_FLAGS` live in `core/` under a domain-colored
  name** because both the library and system domains parse with them.
  Renaming to something neutral (e.g. `LIST_COMMAND_FLAGS`) is deferred —
  renames are behavior-visible in stack traces and grep, and this PR is a
  move.
- **The shim still owns `runArtifacts`** (a 5-line delegation to the
  pre-existing `artifacts-cli.ts`) because it is wiring, not domain logic.

## Directory structure

### `core/`
Foundation kernel. `flags.ts` (whitelist-driven `parseFlags`,
`positionalArgs`, `coerceCliValue`, shared list-command flag sets),
`daemon-url.ts` (daemon base-URL resolution), `errors.ts`
(`RECOVERABLE_EXIT_CODES`, structured error envelope, fetch/HTTP failure
normalizers), `io.ts` (`--prompt/--prompt-file`, `--body/--body-file`
intake with `-` = stdin), `run-events.ts` (SSE→NDJSON run-event bridge).
Imports no sibling subdirectory.

### `automation/` · `brand/` · `export/` · `figma/` · `library/` · `mcp/` · `media/` · `memory/` · `plugin/` · `project/` · `research/` · `share/` · `system/` · `templates/` · `ui/`
One `od <subcommand>` family each. Notable multi-file domains:

- `plugin/` — `manage.ts` (router, list/install/apply/trust),
  `marketplace.ts`, `publish.ts` (login/publish/GitHub PR workflows),
  `verify.ts` (verify/simulate/canon/diff/snapshots/replay), `dev.ts`
  (scaffold/validate/pack/export), `github.ts` (gh CLI helpers).
- `project/` — `project.ts` (router + import/create), `run.ts`, `files.ts`,
  `shell.ts` (PTY bridge), `chat.ts` (conversation/side-chat), `diff.ts`
  (unified diff rendering).
- `system/` — `daemon.ts` (lifecycle + db), `status.ts`
  (status/diagnostics/version/doctor), `config.ts`, `amr.ts`.

Each subdirectory's `index.ts` barrel re-exports its public surface; the
root `index.ts` re-exports only the subcommand entry handlers.

## Types

This module predates its own typing (see Known limitations): declarations
are untyped JavaScript-in-TypeScript under `@ts-nocheck`. Shared API shapes
it consumes (export formats, error envelopes, SSE event unions) come from
`@open-design/contracts`; sidecar IPC message shapes come from
`@open-design/sidecar-proto`. When the staged typing migration lands,
domain-local types belong in the domain, cross-domain types in `core/`.
