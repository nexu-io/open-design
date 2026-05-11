<!--
Frozen-in-time snapshot — captured 2026-05-11 against PR #1149 at the
state it had on that day. File paths, line numbers, status, and other
PR-specific facts reflect that moment and will not be updated when the
PR or the underlying code evolves. Kept here as a style-shape exemplar
for the `agent-review.md` template (clean contract-lane feature case).
-->

# Agent review · PR #1149

## Identification

- Title: `feat(daemon): deploy linked HTML pages together as a multi-page site on Vercel with clean URLs (#1077)`
- Author: ButterHost69 (external)
- Status: OPEN · REVIEW_REQUIRED · BLOCKED (branch-protection, not a code blocker)
- Labels: `size/M`, `risk/high`, `type/feature`
- Lane: `contract` (public seam: `packages/contracts`)
- Diff: +326 / −11 across 5 files

## Findings

### Contract surface is clean

Two optional fields added to existing request DTOs (`DeployProjectFileRequest.linkedPages?: string[]` and `DeployPreflightRequest.linkedPages?: string[]`). `packages/contracts/src/api/projects.ts` stays pure TS (no new imports). Daemon consumer + 130-line `deploy.test.ts` land in the same PR. Meets `code-review-guidelines.md §4.2` (contract change lands with consumer + tests, additive only, no migration window needed).

### BFS implementation

`collectLinkedHtmlPages` discovers `<a href>` links to local HTML; the iterative `while (linkedPageIdx < linkedPages.length)` loop in `apps/daemon/src/deploy.ts:44-102` handles transitive chains correctly and is cycle-safe via `visited.has(page.path)`. The `page.deployedName === 'index.html'` guard at lines 81-85 explicitly throws `DeployError(400)` to prevent overwriting the entry page — defensive and well-placed. `vercel.json` injection at lines 127-135 is scoped to Vercel deploys only and respects user-supplied `vercel.json`.

### Loose ends

- `apps/web/src/providers/registry.ts` 1-line change is unmotivated by the PR body — worth confirming it's required by the feature, not a stale touch from a rebase.
- `collectLinkedHtmlPages` (lines 1466-1487) resolves paths via `resolveReferencedPath` (out of diff). Whether `../` escapes are rejected depends on that helper — given the `risk/high` label and the new caller paths exercising it, a path-traversal regression test would be appropriate.

## Suggestions

- Add a hard cap on transitively discovered HTML pages (e.g. > 50 → `DeployError`). The BFS is currently unbounded; a malformed project with a wide link graph could blow up a deploy.
- Document the `vercel.json` `cleanUrls: true` injection in release notes — it changes routing semantics on the deployed site, and users with existing `.html`-URL expectations need to know.
- Add a path-traversal test alongside the new 130 lines (an `<a href="../../../etc/passwd.html">` case asserting `collectLinkedHtmlPages` rejects or normalizes).

## Validation expected

```bash
pnpm guard
pnpm typecheck
pnpm --filter @open-design/contracts typecheck
pnpm --filter @open-design/daemon typecheck
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/daemon build
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/web test
pnpm --filter @open-design/web build
```

Plus a manual sandbox smoke: deploy a 3-page linked-HTML project to a test Vercel target, confirm clean-URL routing and that the entry-page index resolution still works.
