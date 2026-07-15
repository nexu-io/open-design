# Creator Performance Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local, manual, append-only performance snapshots for published Creator release packages.

**Architecture:** Contracts define the snapshot DTOs. Daemon stores project-scoped snapshots separately under `RUNTIME_DATA_DIR`, validates the target published release in routes, and exposes CRUD HTTP endpoints. The existing Release editor loads project snapshots through HTTP and provides manual entry, delete, and deterministic basic deltas.

**Tech Stack:** TypeScript, Express, React, Vitest, `@open-design/contracts`, local JSON persistence with atomic rename.

---

## File Structure

- Create `packages/contracts/src/api/creator-performance-snapshot.ts`: public DTOs and request shape.
- Modify `packages/contracts/src/index.ts`: export the public DTO module.
- Create `apps/daemon/src/creator-performance/store.ts`: project-scoped atomic snapshot persistence and input validation.
- Create `apps/daemon/tests/creator-performance-store.test.ts`: store validation, recovery, ordering, deletion tests.
- Create `apps/daemon/src/routes/creator-performance.ts`: HTTP routes, project/release boundary checks.
- Create `apps/daemon/tests/creator-performance-routes.test.ts`: route ownership and published-release gate tests.
- Modify `apps/daemon/src/server.ts`: register the route module.
- Modify `apps/web/src/components/TasksView.tsx`: load, create, list, delete, and delta-display snapshots inside Release.
- Modify `apps/web/src/styles/home/tasks.css`: compact Performance region and responsive fields.
- Modify `apps/web/tests/components/TasksView.page.test.tsx`: mocked HTTP and focused Performance UI tests.
- Create `docs/verification/2026-07-15-cw-04-performance-snapshot-acceptance.md`: real-project acceptance record.

## Task 1: Public Contracts

**Files:**
- Create: `packages/contracts/src/api/creator-performance-snapshot.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Define the public DTOs without runtime validation**

```ts
export interface CreatorPerformanceMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  favorites?: number;
  followers?: number;
  watchSeconds?: number;
}

export interface CreatorPerformanceSnapshot {
  id: string;
  projectId: string;
  releaseId: string;
  source: 'manual';
  capturedAt: string;
  metrics: CreatorPerformanceMetrics;
  note?: string;
  createdAt: string;
}

export interface CreatorPerformanceProjectData {
  snapshots: CreatorPerformanceSnapshot[];
}

export interface CreateCreatorPerformanceSnapshotRequest {
  releaseId: string;
  capturedAt?: string;
  metrics: CreatorPerformanceMetrics;
  note?: string;
}
```

Do not expose `id`, `projectId`, `source`, or `createdAt` in the create request. Export the module from `index.ts` beside the other Creator API modules.

- [ ] **Step 2: Build contracts**

Run: `pnpm --filter @open-design/contracts build`

Expected: exit 0.

- [ ] **Step 3: Commit contracts**

```bash
git add packages/contracts/src/api/creator-performance-snapshot.ts packages/contracts/src/index.ts
git commit -m "feat: define creator performance contracts"
```

## Task 2: Safe Snapshot Store

**Files:**
- Create: `apps/daemon/src/creator-performance/store.ts`
- Create: `apps/daemon/tests/creator-performance-store.test.ts`

- [ ] **Step 1: Write failing store tests**

Cover all of these exact cases with temporary data directories:

```ts
it('creates snapshots with server identity and defaults capturedAt', async () => {});
it('returns snapshots sorted by capturedAt descending after reload', async () => {});
it('rejects empty metrics and every negative, fractional, unsafe, or non-number metric', async () => {});
it('trims note and omits an empty note', async () => {});
it('ignores forged id, projectId, source, and createdAt fields', async () => {});
it('uses write-temp then rename and cleans temp after rename failure', async () => {});
it('recovers ENOENT, invalid JSON, and invalid top-level data but propagates EACCES', async () => {});
it('deletes only the requested snapshot and returns false for an absent id', async () => {});
```

- [ ] **Step 2: Implement project-scoped store functions**

Export exactly:

```ts
getCreatorPerformanceProjectData(dataDir, projectId)
createCreatorPerformanceSnapshot(dataDir, projectId, input)
deleteCreatorPerformanceSnapshot(dataDir, projectId, snapshotId)
```

Persist only at `path.resolve(dataDir, 'creator-performance', `${projectId}.json`)`, with the same `assertProjectId`, path containment, temp-write, rename, and original-I/O-error propagation posture as `apps/daemon/src/creator-release/store.ts`.

Require every accepted metric value to satisfy `Number.isSafeInteger(value) && value >= 0`. Require at least one known metric key. Reject unknown metric keys. Validate ISO UTC timestamps using the existing release-store format. Filter semantically invalid stored records on read, including a mismatched `projectId`.

- [ ] **Step 3: Run focused checks**

Run:

```bash
pnpm --filter @open-design/contracts build
pnpm --filter @open-design/daemon exec vitest run tests/creator-performance-store.test.ts --maxWorkers=1
pnpm --filter @open-design/daemon typecheck
```

Expected: all exit 0.

- [ ] **Step 4: Commit store**

```bash
git add apps/daemon/src/creator-performance/store.ts apps/daemon/tests/creator-performance-store.test.ts
git commit -m "feat: persist creator performance snapshots"
```

## Task 3: HTTP API and Release Boundary

**Files:**
- Create: `apps/daemon/src/routes/creator-performance.ts`
- Create: `apps/daemon/tests/creator-performance-routes.test.ts`
- Modify: `apps/daemon/src/server.ts`

- [ ] **Step 1: Write route tests using Express and real temporary stores**

Test these endpoints and outcomes:

```text
GET    /api/projects/:id/creator-performance-snapshots?releaseId=:releaseId
POST   /api/projects/:id/creator-performance-snapshots
DELETE /api/projects/:id/creator-performance-snapshots/:snapshotId
```

Required cases: unknown project returns 404 JSON; unsafe optional releaseId query returns 400; unknown or cross-project requested release returns 400; draft, ready, and archived release create returns 400; published release create returns 201; GET without a query returns project snapshots and GET with releaseId returns only that release's snapshots in descending capturedAt order; delete does not alter the release or another snapshot; invalid metrics return 400 JSON.

- [ ] **Step 2: Implement and register the routes**

Use the narrow dependency shape already used by `registerCreatorReleaseRoutes`. Resolve a requested release via `getCreatorReleaseProjectData(RUNTIME_DATA_DIR, projectId)`. For GET, `releaseId` is optional: no query returns all project snapshots; a query validates the release is in the project and returns only that release's snapshots. Require `release.status === 'published'` only for POST. GET and DELETE must permit reading/deleting historical snapshots even if a release later becomes archived. Do not add update routes.

All errors must be `{ error: string }`; no stack traces. Register `registerCreatorPerformanceRoutes(app, { db, paths: { RUNTIME_DATA_DIR }, projectStore: { getProject } })` in `server.ts` next to other Creator route registrars.

- [ ] **Step 3: Run focused checks**

Run:

```bash
pnpm --filter @open-design/daemon exec vitest run tests/creator-performance-store.test.ts tests/creator-performance-routes.test.ts --maxWorkers=1
pnpm --filter @open-design/daemon typecheck
git diff --check
```

- [ ] **Step 4: Commit API**

```bash
git add apps/daemon/src/routes/creator-performance.ts apps/daemon/src/server.ts apps/daemon/tests/creator-performance-routes.test.ts
git commit -m "feat: expose creator performance APIs"
```

## Task 4: Release Performance UI

**Files:**
- Modify: `apps/web/src/components/TasksView.tsx`
- Modify: `apps/web/src/styles/home/tasks.css`
- Modify: `apps/web/tests/components/TasksView.page.test.tsx`

- [ ] **Step 1: Extend the page test fetch mock first**

Add per-project performance data and failures to `mockTasksViewFetch`. Support list GET, create POST, and delete requests. Add focused tests covering: a published release creates a snapshot with only filled metric keys; non-published release has no enabled creation control; failed POST preserves numeric values/note and exposes `role="alert"`; list ordering and same-metric deltas; deletion confirmation; project-level API failure while Release remains usable.

- [ ] **Step 2: Load project data independently**

Create `CreatorPerformanceProjectState` with `projectId`, `{ snapshots }`, and `failed`. In `refresh()`, independently load each project at `/api/projects/${encodeURIComponent(project.id)}/creator-performance-snapshots` without a `releaseId`; a failure must become `{ snapshots: [] }, failed: true` only for that project.

- [ ] **Step 3: Add the Performance region inside the existing Release editor**

Filter selected project snapshots by `creatorReleaseEdit.id`. For a published release, render seven optional numeric inputs (`views`, `likes`, `comments`, `shares`, `favorites`, `followers`, `watchSeconds`), a datetime-local field, and `note`. Build the POST body with only filled metric keys, plus optional `capturedAt` converted to ISO and trimmed nonempty note. Do not submit empty metrics.

For draft, ready, or archived releases, render a short read-only status message and no create action. Sort display by capturedAt descending. For each snapshot, compare it to the next older snapshot only for metric keys present on both and render signed numeric deltas. Do not calculate percentages, scores, or revenue. Delete must use `window.confirm('Delete this performance snapshot?')` and only remove local state after 204.

- [ ] **Step 4: Add compact responsive styling**

Use `creator-performance-*` classes, existing tokens, fieldset style, and a two-column metrics grid that becomes one column at 640px. Do not introduce cards, charts, gradients, dependencies, a new route, or a page-level dashboard.

- [ ] **Step 5: Run focused checks**

Run:

```bash
pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "performance snapshot" --maxWorkers=1
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/web build
git diff --check
```

If the unfiltered TasksView file still has its existing OOM/hang, record it and do not claim it is caused by CW-04 when all focused tests pass.

- [ ] **Step 6: Commit UI**

```bash
git add apps/web/src/components/TasksView.tsx apps/web/src/styles/home/tasks.css apps/web/tests/components/TasksView.page.test.tsx
git commit -m "feat: record creator performance snapshots"
```

## Task 5: Real Acceptance and Regression

**Files:**
- Create: `docs/verification/2026-07-15-cw-04-performance-snapshot-acceptance.md`

- [ ] **Step 1: Verify the actual daemon and project before any writes**

Use the running daemon and confirm project `creator-media-acceptance-20260712`, an existing published CW-03 release, and its real runtime data directory. If any is unavailable, do not create a substitute project or hand-edit data; document BLOCKED and run automated checks only.

- [ ] **Step 2: Create and verify two real snapshots**

For the existing `[CW-03验收]` published release, create two manual snapshots with different `capturedAt` values and overlapping `views`, `likes`, and `comments`. Restart daemon using the same runtime data directory. Verify both snapshots return in descending order, the later snapshot has correct basic deltas, and release/content/media remain unchanged.

- [ ] **Step 3: Run final regression and document it**

Run:

```bash
pnpm --filter @open-design/contracts build
pnpm --filter @open-design/daemon exec vitest run tests/creator-performance-store.test.ts tests/creator-performance-routes.test.ts --maxWorkers=1
pnpm --filter @open-design/daemon typecheck
pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "performance snapshot" --maxWorkers=1
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/web build
git diff --check
```

Document actual IDs, API outcomes, restart outcome, commands, omissions, and an explicit statement that no platform account/API or original material was accessed. Do not include absolute paths, tokens, cookies, or source file contents.

- [ ] **Step 4: Commit acceptance documentation**

```bash
git add docs/verification/2026-07-15-cw-04-performance-snapshot-acceptance.md
git commit -m "docs: verify creator performance snapshots"
```

## Final Review Checklist

- [ ] Every snapshot is project-scoped and only targets a published release at creation time.
- [ ] Stored data cannot bypass integer, ISO timestamp, source, or project ownership validation.
- [ ] No route, UI, or test imports daemon private implementation into Web.
- [ ] No automatic collection, credentials, uploads, platform writes, file import, or material mutation was added.
- [ ] Existing CW-01 to CW-03 data remains independent and no delete cascades exist.
- [ ] Worktree is clean, all focused commands pass, and root guard failures are recorded only if they remain the known design-system stale issue.
