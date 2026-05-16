<!--
Frozen-in-time snapshot — captured 2026-05-11 against PR #1037 at the
state it had on that day. File paths, line numbers, status, prior review
references, and SHAs reflect that moment and will not be updated when the
PR or the underlying code evolves. Kept here as a style-shape exemplar
for the `agent-review.md` template (scope-expansion case).
-->

# Agent review · PR #1037

## Identification

- Title: `fix(daemon): follow symlinked skill and design-system dirs`
- Author: desmond-rai (external)
- Status: OPEN · REVIEW_REQUIRED · DIRTY · **draft**
- Labels: `size/S`, `risk/high`, `type/bugfix`
- Lane: `default` (no forbidden surfaces, no public seams touched)
- Diff: +899 / −3 across 4 files

## Findings

### Scope expansion vs declared intent

The PR title declares a symlink-follow fix. The diff actually contains three distinct changes:

| Change | Files | Lines | Matches PR title? |
|---|---|---|---|
| Symlink-follow helper + call sites | `apps/daemon/src/design-systems.ts`, `apps/daemon/src/skills.ts` | ~50 | ✓ |
| Chat-run inactivity timeout `2m → 20m` | `apps/daemon/src/server.ts:1819-1824` | 3 | ✗ unrelated |
| Hardcoded `renderReturningAiShowcase` route + 837-line implementation | `apps/daemon/src/design-system-showcase.ts:107-128, 549-1402` | 853 | ✗ unrelated, vendor-specific |

`code-review-guidelines.md §3 Out of scope` lists "Piggybacks unrelated cleanup, formatting, dependency churn, migrations, or feature work onto a focused fix" as a block-or-split condition.

### Product-relevance test

`renderReturningAiShowcase` is triggered by `id === 'returning-ai' || /ReturningAI|CFD-brokerage/i.test(raw)` and renders a vendor-specific design-system showcase. The PR body doesn't name an Open Design capability this branch validates. `code-review-guidelines.md §1` lists "customer vertical / marketing experiment / unrelated rendering demo / arbitrary product page" as out-of-scope unless first-party and motivated, and this matches.

### Symlink fix itself is clean

`entryIsDirectoryFollowingLinks` (duplicated 14 lines in `design-systems.ts:33-46` and `skills.ts:94-107`, well-commented) is the correct fix for `Dirent.isDirectory()` returning false on symlinks. Broken links fall through `try/catch` and are skipped — identical end-state to the previous filter. No regression test for the symlink-as-directory path. lefarcen's prior `COMMENTED` review at SHA `b86885c0` predates the scope-expanding commits.

## Suggestions

- Ask the author to split: land the symlink fix as a standalone PR (`design-systems.ts` + `skills.ts` + one regression test), and bring the timeout and vendor-specific showcase back as separately motivated PRs or drop them.
- The 2m → 20m chat timeout has real resource implications (10× idle window); if the author wants to keep it, it needs its own motivation. The vendor-specific showcase fails `§1` as written and is the more disposable of the two.

## Validation expected (for the trimmed symlink-fix-only scope)

```bash
pnpm guard
pnpm typecheck
pnpm --filter @open-design/daemon typecheck
pnpm --filter @open-design/daemon test
```

Plus a regression test under `apps/daemon/tests/` that creates a temp dir with a symlinked subdir and confirms `listSkills` / `listDesignSystems` discover it.
