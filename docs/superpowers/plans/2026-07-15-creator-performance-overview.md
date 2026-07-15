# Creator Performance Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a read-only comparison view of latest performance snapshots for published Creator release packages.

**Architecture:** Derive overview rows in `TasksView.tsx` from existing per-project release, content, and performance state. Keep all filtering and stable sorting local to the Web view; no daemon or contract change is required.

**Tech Stack:** React, TypeScript, existing `@open-design/contracts` types, Vitest, existing CSS tokens.

---

### Task 1: Derive Overview Rows and Controls

**Files:**
- Modify: `apps/web/src/components/TasksView.tsx`
- Modify: `apps/web/src/styles/home/tasks.css`
- Modify: `apps/web/tests/components/TasksView.page.test.tsx`

- [ ] Add platform-filter and sort state, plus a typed `useMemo` that excludes failed Release/Performance projects and non-published releases.
- [ ] For each row, sort that release's snapshots by capturedAt, createdAt, id; choose the latest and next older snapshot; only calculate deltas where both values exist.
- [ ] Add the compact `Performance overview` section with filters, sort control, no-snapshot state, missing-value marker, stable rows, and `Open release` action.
- [ ] Add `creator-performance-overview-*` CSS using existing panel tokens and responsive single-column behavior at 640px.
- [ ] Add page tests for latest/delta, filters, sorting/missing placement, failed-project exclusion, and Open release behavior.
- [ ] Run `pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "performance overview" --maxWorkers=1`, web typecheck/build, and `git diff --check`.
- [ ] Commit `feat: show creator performance overview`.
