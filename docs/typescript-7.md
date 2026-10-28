# TypeScript 7 toolchain and migration evaluation

The workspace uses TypeScript **7.0.2** for `tsc` commands, including type checks,
JavaScript emission, declaration emission, and the web build's final type gate.

## Dependency layout

Every workspace declares `@typescript/native: npm:typescript@7.0.2`, which
supplies `tsc` and the pinned native APIs.

Only `apps/web` retains `typescript: npm:@typescript/typescript6@6.0.2` for
Next 16.2.6 configuration/type generation. It supplies the legacy JavaScript
compiler API and `tsc6`, without competing for `tsc`. Next still imports the old
API; removing this last alias requires a separate framework compatibility change.
This follows Microsoft's [side-by-side installation guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

Repository-owned guards and tests no longer import `typescript`:

- Guards and AST-based tests use `@typescript/native/unstable/ast` and
  `@typescript/native/unstable/sync`.
- Semantic regression tests request diagnostics from the native compiler,
  preserving their error-code and source-position assertions.
- Desktop snippets use Node 24's type stripping. Daemon/packaged test harnesses
  use esbuild for ESM/CommonJS emission, without pretending this is type checking.
- Guard parsing uses an explicitly scoped native process, no libraries or import
  resolution, and immutable in-memory projects. Regression tests ensure changed
  contents and TS/TSX syntax cannot reuse stale ASTs. Native processes and
  snapshots are released on success and failure. No virtual fixture is written
  to disk.

The `unstable/*` API is deliberately pinned to 7.0.2. Compiler upgrades must run
the focused guard and semantic-diagnostic tests, not just `tsc --noEmit`.
`pnpm exec tsc --version` reports `7.0.2`. The remaining compatibility dependency
is isolated to Next; it is not used for repository type checks or JS emission.

## Web build gate

Run `pnpm --filter @open-design/web build`, which executes:

```sh
next build && tsc -b --noEmit
```

Next generates route types and application assets. Its old in-process type check
is disabled in `next.config.ts`; native `tsc` checks the project, including the
generated types, before the package build can succeed. A type error therefore
still fails the build. Calling `next build` directly bypasses this final gate;
use the package build entry point, including for packaging and CI.

The standalone `typecheck` script remains `tsc -b --noEmit`. The project-level
compiler options explicitly list ambient types that older compilers loaded
implicitly. The e2e alias uses a relative `paths` target instead of the removed
`baseUrl` option. No strictness checks were disabled for this migration.

## Evaluation scope

Baseline: commit `287009d37f`, with the original mix of TypeScript 5.9.3 and
6.0.3. Measurements ran sequentially in the same worktree on an Apple M5 Pro
(15 logical CPUs, 48 GiB RAM), macOS arm64, Node 24.13.0, pnpm 10.33.2.
Dependencies and workspace build prerequisites were installed before measuring.

The timings below were captured at the initial compiler migration, before the
follow-up guard/test API migration. They are single-run wall-clock observations, including
pnpm orchestration. Web builds use the default static-export mode and start
without `.next` caches; the native run also discards the separate web
`tsconfig.tsbuildinfo` before the build. Full type checking starts without that
incremental cache. These are not fresh OS filesystem-cache measurements or CI
runner predictions. Existing generated package outputs are present on both sides.

| Command | Original | TS 7.0.2 | Speedup | Time saved |
| --- | ---: | ---: | ---: | ---: |
| `pnpm typecheck` | 46.87 s | 10.90 s | 4.30x | 76.8% |
| `pnpm --filter @open-design/daemon build` | 6.11 s | 1.50 s | 4.08x | 75.5% |
| `pnpm --filter @open-design/desktop build` | 0.93 s | 0.28 s | 3.36x | 70.3% |
| `pnpm --filter @open-design/web build` | 36.65 s | 16.79 s | 2.18x | 54.2% |

The baseline Next build reported 20.8 s in its TypeScript stage. The remaining
bundling and prerendering work explains why the full web build improves less
than type checking alone. Workspace orchestration and esbuild work similarly
limit the full-repository speedup.

## Repeated compiler-only comparison

To separate compiler performance from pnpm orchestration, each compiler ran
three times in alternating order on the same migrated sources and installed
workspace outputs. Both checks passed in every round. Web incremental caching
was disabled; daemon does not enable it. The comparison uses the original
5.9.3 compiler for both apps versus native 7.0.2, with each compiler's bundled
standard library and default worker settings.

| Project | TS 5.9.3 median | TS 7.0.2 median | Speedup |
| --- | ---: | ---: | ---: |
| `apps/web` | 22.31 s | 2.51 s | 8.90x |
| `apps/daemon` | 4.56 s | 1.52 s | 3.00x |

Commands from each app directory:

```sh
# Run with the baseline 5.9.3 compiler, then the native 7.0.2 compiler.
# Web:
tsc -p tsconfig.json --noEmit --incremental false
# Daemon:
tsc -p tsconfig.json --noEmit
```

The web measurements ranged from 21.42–25.24 s (5.9.3) and 2.32–2.92 s (7.0.2).
The daemon measurements ranged from 4.55–4.66 s and 1.51–1.55 s respectively.
This supports a substantial improvement on this machine without implying the
same multiplier for every package or CI runner.

## Validation

- Frozen-lockfile installation and postinstall builds passed. All 27 child
  workspaces plus the root resolve `tsc --version` to 7.0.2.
- Full workspace `pnpm typecheck` and repository `pnpm guard` passed.
- Focused existing tests cover deliverable selection and consumers of the legacy
  compiler API: 8 files, 150 tests passed across daemon, web, desktop, packaged,
  and e2e packages.
- Default static-export and standalone web builds, web sidecar, daemon, desktop,
  packaged, and Closure builds passed.
- A temporary TS2322 error was injected into a web source file: the complete
  package build exited nonzero at the native compiler gate. The probe was removed
  and the subsequent standalone build passed.
- Daemon and desktop emitted-file sets are unchanged (2,301 and 105 files).
  Desktop JavaScript output is byte-identical. Daemon JavaScript differs only
  in the migrated deliverable-selection expression; other changes are confined
  to declarations and source maps.

This evaluation does not measure application runtime speed, editor latency,
peak memory, Windows/Linux execution, or signed installer production. Full daemon
and web test suites were not run; focused tests follow repository guidance.

## Follow-up: remove repository-owned legacy API usage

The follow-up migration keeps the compatibility alias only in `apps/web` for
Next. Full type checking, web build, and all guards passed after removal from the
other 27 manifests. Focused follow-up validation passed 149 tests across 11
files: 42 e2e guard/scope tests, 72 web tests, 10 desktop tests, 12 packaged tests,
and 13 daemon tests. Seven new guard tests cover import-edge preservation,
source changes, TS/TSX parsing, old-tree stability, and failure cleanup.

The final native-API guard run took 20.54 s on the same machine. This is not a
claim of improvement over the old JS parser: native AST extraction involves
process/protocol overhead, unlike the compiler-only benchmarks above. One
native process per full guard run and a one-entry AST cache avoid repeatedly
starting the compiler or parsing identical consecutive inputs. Native snapshots
are immutable; tests caught stale results when virtual paths were reused, so
each distinct parse now opens a fresh virtual project and closes its predecessor.


## Guard performance follow-up

CI exposed a regression in the first API migration: the layout-policy step took
131 s in run `39649012290` (52 s in run `39651364456`), versus 18 s in the nearby
legacy run `39648868125`. Per-file immutable project creation is unsuitable for
repository scans even though it protects correctness.

Cross-app and web import isolation now collect the same inputs and parse them
in batches of at most 256 files. Each batch owns one immutable parse-only project
and snapshot, with no library or dependency resolution. Native ASTs are fetched
lazily; the client cache retains only the immediately preceding tree so adjacent
consumers do not transfer it twice. Each batch closes its native process and
snapshot, including on failure. Changed or unlisted source contents still use
isolated immutable projects. The checking rules and traversal are unchanged.

Three alternating complete `pnpm guard` runs on the same macOS machine compared
legacy commit `8d820a6989` with this optimization:

| Variant | Round 1 | Round 2 | Round 3 | Median |
| --- | ---: | ---: | ---: | ---: |
| Legacy JS API | 8.37 s | 8.38 s | 8.42 s | 8.38 s |
| Bounded native batches | 7.43 s | 7.18 s | 6.75 s | 7.18 s |

All runs passed. The median wall time improved by 14.3% over the legacy guard.
These are warm local observations, not an all-platform performance guarantee.
`/usr/bin/time -l` reported maximum resident sizes of 642–648 MB for legacy and
670–716 MB for the final native implementation (decimal units). This is a modest
memory increase, not a memory saving. An unbounded batch prototype reached
2.36 GB and was rejected. No process-wide heap limit or forced GC was added.

Validation includes full guard/typecheck and 41 focused tests across five files,
including batch-boundary traversal, changed content, TS/TSX handling, nested
failure cleanup, and old-tree stability after releasing a batch. Linux CI timing
must be checked independently; local measurements alone do not close the CI
performance regression.
