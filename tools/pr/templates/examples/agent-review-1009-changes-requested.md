<!--
Frozen-in-time snapshot — captured 2026-05-11 against PR #1009 at the
state it had on that day. Prior reviewer findings, file paths, line
numbers, and the CHANGES_REQUESTED state reflect that moment and will
not be updated when the PR or the underlying code evolves. Kept here as
a style-shape exemplar for the `agent-review.md` template
(CHANGES_REQUESTED with prior human review case).
-->

# Agent review · PR #1009

## Identification

- Title: `feat(daemon): load user design systems from ~/.open-design/design-systems`
- Author: mathd (external)
- Status: OPEN · **CHANGES_REQUESTED** · DIRTY (no push since reviews)
- Labels: `size/M`, `risk/medium`, `type/feature`
- Lane: `default` (no forbidden surfaces, no public seams touched)
- Diff: +213 / −12 across 5 files

## Prior reviewer findings (still applicable)

Two human MEMBER reviews on file, both still unaddressed in the current head:

- **@lefarcen** (`CHANGES_REQUESTED`): "one critical path traversal vulnerability plus several edge-case gaps". `readDesignSystem(root, id)` and the new `readDesignSystemFromAny(bundledRoot, userRoot, id)` (`apps/daemon/src/design-systems.ts:54-71`) both do `path.join(root, id, 'DESIGN.md')` with no validation that `id` stays inside `root`. An `id` like `../../../etc/passwd` escapes the design-systems directory if reachable from user input.
- **@mrcfps** (`COMMENTED`): `OD_USER_STATE_DIR` override is non-deterministic for tests/programmatic callers, and `userDesignSystemsDir()` falling back to `~/.open-design/design-systems` causes isolated finalize runs to silently read host-local design systems.

## Findings

### Test isolation risk

`apps/daemon/tests/design-systems.test.ts` adds 104 lines. If those cases don't explicitly set `OD_USER_STATE_DIR` to a tmpdir, they hit the developer's real `~/.open-design/design-systems` and become non-reproducible across machines — same shape as @mrcfps's host-leak concern but in test scope.

### Severity vs label

`risk/medium` likely undersells the path-traversal severity from finding above. Worth re-labeling `risk/high` once author addresses the traversal, since the fix path itself is security-sensitive.

## Suggestions

- Path-traversal fix should validate `id` against a strict slug regex (e.g. `/^[a-z0-9-]+$/`, matching the existing `non-ascii-slug` lane convention) **at the call site closest to user input**, not deep inside `readDesignSystem` — preserves the low-level "trust the caller" contract while moving validation to the boundary.
- Pick one isolation strategy and apply it consistently: either every test sets `OD_USER_STATE_DIR=<tmpdir>`, or the daemon takes a `userStateDir` config knob whose default is the home-dir fallback. Mixing the two leaves footguns.
- Consider splitting the path-traversal fix into a security-only PR ahead of the feature — the traversal is exploitable as soon as `id` reaches the function from a user-facing route, regardless of whether the user-overlay feature ships.

## Validation expected (after author addresses CHANGES_REQUESTED items)

```bash
pnpm guard
pnpm typecheck
pnpm --filter @open-design/daemon typecheck
pnpm --filter @open-design/daemon test
```

Test re-runs should include a path-traversal regression (`readDesignSystem(root, '../etc/passwd')` returns `null` or throws) and an `OD_USER_STATE_DIR=<tmpdir>` isolation case.
