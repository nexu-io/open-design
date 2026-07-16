# CW-06 Creator Release Schedule — Acceptance Verification (Audit Remediation)

**Date**: 2026-07-16
**Clean delivery branch**: `feat/cw-06-release-schedule-clean`
**Clean worktree**: `.worktrees/cw-06-release-schedule-clean`
**Base**: `main` @ `474af616d`
**Dev Server (visual)**: new worktree `next dev` on `http://127.0.0.1:3001`

> **Audit-remediation scope.** This document supersedes the earlier CW-06 acceptance note that
> referenced a real daemon seed project (`cw06-demo`) as visual-acceptance data. Per the audit, the
> final visual acceptance uses **Playwright network interception / in-browser mock only** and performs
> **zero real runtime writes**. The real daemon seed `cw06-demo` was deleted (see §3) and is **not** used
> as acceptance data anywhere in this document.

## 1. Automated Verification Results

### Typecheck
- **Status**: PASS
- **Command**: `NODE_OPTIONS= pnpm --filter @open-design/web typecheck` (`tsc -b --noEmit`)
- **Notes**: Only Node 22 engine version WARN (runtime is Node 22.22.2, not ~24); zero TS errors.

### Unit Tests (Release Schedule)
- **Status**: PASS
- **Command**: `NODE_OPTIONS= pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "release schedule" --maxWorkers=1`
- **Result**: **18 passed, 0 failures, 81 skipped** (99 total). Spec required ≥ 13 tests with name containing "release schedule".
- **Coverage areas**:
  - Entry condition: only `draft`/`ready` releases with a valid `scheduledAt` enter the agenda
  - `published` excluded
  - `archived` excluded
  - Releases without `scheduledAt` excluded
  - **Malformed `scheduledAt` excluded** (see §2 — `not-a-date`, `2026-13-45`, empty string)
  - Sort by `scheduledAt` ascending with stable secondary key (title → id)
  - Grouping by **local** date (`Intl` resolved `timeZone`)
  - Overdue = `scheduledAt < now` (absolute time comparison)
  - Time-range filter: Next 7 days (`now <= s < now + 7d`, exclusive upper)
  - Time-range filter: Next 30 days (`now <= s < now + 30d`, exclusive upper)
  - Time-range filter: Overdue (`s < now`)
  - Platform segmented filter: All / Bilibili / YouTube / Xiaohongshu / Other
  - Content title resolved; fallback to `contentId` when content missing
  - Empty state when no qualifying releases exist
  - Single-project Release API failure → unavailable hint, healthy project retained
  - Multi-project failures → plural hint (`N projects.`)
  - Same project failing twice counted once (Set dedup, no double count)
  - All projects fail → hint kept + `No available scheduled releases to show.`
  - Interaction triggers **zero write requests** (no POST/PATCH/DELETE/PUT)
  - Responsive CSS rules at ≥960px and ≤640px breakpoints

### Build
- **Status**: PASS
- **Command**: `NODE_OPTIONS= pnpm --filter @open-design/web build`
- **Notes**: Next.js production build succeeded (compiled / TypeScript / static export all green).

### Git Hygiene
- **Status**: PASS
- **Commands**:
  - `git diff --check main...HEAD` — no whitespace errors.
  - `apps/web/next-env.d.ts` is a generated artifact; it is **excluded** from all commits (commits are made targeting only intended files).
  - Forbidden files untouched: `package.json`, `pnpm-lock.yaml`, `daemon/`, `contracts/`, `design-systems/` remain clean.
  - `git status --short` after commits shows only the intended files.
  - No commit message contains `Co-Authored-By`.

## 2. Illegal `scheduledAt` Defense

A malformed `scheduledAt` (e.g. `"not-a-date"`, `"2026-13-45"`, or `""`) must be ignored rather than
producing an `Invalid Date` group, a `NaN` time-range misclassification, or a crash. The fix is a
finite-timestamp guard in the agenda aggregation loop of `apps/web/src/components/TasksView.tsx`:

```ts
for (const release of releaseState.data.releasePackages) {
  if (release.status !== 'draft' && release.status !== 'ready') continue;
  if (!release.scheduledAt) continue;
  // 非法 scheduledAt（如 "not-a-date"）→ Invalid Date → getTime() 非有限，必须忽略，
  // 否则会出现 NaN 时间范围误判或 "Invalid Date" 分组。
  const scheduledMs = new Date(release.scheduledAt).getTime();
  if (!Number.isFinite(scheduledMs)) continue;
  ...
}
```

A dedicated unit test (`TasksView.page.test.tsx`) — whose name contains "release schedule" — feeds a
project with one valid `scheduledAt` neighbor plus three malformed values
(`"not-a-date"`, `"2026-13-45T10:00:00.000Z"` which parses to month 13 → Invalid Date, and `""`) and
asserts that **only the valid neighbor is rendered** and none of the malformed titles appear. This test
passes (part of the 18/18 above).

Additionally, `tasks.css` had `letter-spacing: 0.04em;` **removed** from
`.creator-release-schedule__group-date` (CW-06-only style); the unrelated
`.creator-performance-fields` `letter-spacing: 0.04em` is untouched.

## 3. Cleanup of the Real Daemon Seed `cw06-demo`

Performed via the **official HTTP API only** (no `.od` files were read, edited, or deleted; no other
project, Content, Release, Performance, Media, or user asset was touched).

| Step | Request | Result |
|---|---|---|
| 1. Confirm target | `GET /api/projects/cw06-demo` | Matched `id: cw06-demo` **and** `name: "CW-06 Release Demo"` (exact match before any action) |
| 2. Pre-check list | `GET /api/projects` | Included `cw06-demo` |
| 3. Delete | `DELETE /api/projects/cw06-demo` | **HTTP 200** |
| 4. Post-check list | `GET /api/projects` | **`{"projects":[]}`** — `cw06-demo` no longer present |
| 5. Post-check target | `GET /api/projects/cw06-demo` | **HTTP 404** |

Re-verified at report time: `GET /api/projects` → `{"projects":[]}` and `GET /api/projects/cw06-demo` → `404`.
The seed is gone and has not been recreated.

## 4. Mock-Only Visual Acceptance (Playwright) — Zero Real Runtime Writes

**Tool**: Node Playwright (chromium) resolved from repo `node_modules/.pnpm/playwright@1.60.0`.
**Script**: external temp script `cw06-clean-visual.cjs` (lives outside the repo; **not** committed).
**Dev server**: new worktree `next dev` on `http://127.0.0.1:3001/automations`.
**Screenshots**: `cw06-clean-desktop.png` (1280×900, fullPage), `cw06-clean-mobile.png` (375×800, fullPage).

> PNGs cannot be opened inline by the model; visual correctness is evidenced by programmatically
> captured DOM assertions (element counts, attributes, computed widths) — the most reliable evidence
> available here.

**Mock strategy (no real daemon project/release data is created):**
- `page.route('**/api/**')` intercepts **every write method** (`POST`/`PUT`/`DELETE`/`PATCH`) and fulfills
  it locally with `{ ok: true }` — so no write reaches a real daemon.
- GET endpoints for schedule data are fulfilled with local mock objects:
  `/api/projects`, `…/creator-content`, `…/creator-release-packages`, `…/creator-performance-snapshots`,
  `…/creator-media-assets`.
- Other read-only GETs (auth / session / analytics / `/api/app-config`, which returns
  `onboardingCompleted: true`) fall through to the real daemon. Reads perform **no runtime-data writes**.

**Mock seed (no real daemon project created):**

| # | Title | Platform | Status | scheduledAt (mock) | Expected |
|---|---|---|---|---|---|
| 1 | 逾期项 | xiaohongshu | ready | now − 2d | **Shown, Overdue** |
| 2 | 合法草稿 | bilibili | draft | now + 2d | Shown |
| 3 | 非法日期 | youtube | draft | `"not-a-date"` | **Excluded** (defense) |
| 4 | 已发布排除 | bilibili | published | now + 5d | **Excluded** (status) |
| 5 | 无时间排除 | other | draft | — | **Excluded** (no scheduledAt) |
| 6 | 其他平台 | other | ready | now + 10d | Shown |

### Desktop (1280×900)

| Check | Result | Detail |
|---|---|---|
| Section rendered | PASS | `section.creator-release-schedule` with title "Release schedule" |
| Head meta | PASS | `Scheduled draft & ready releases across loaded projects (read-only) · Time zone: Asia/Shanghai` |
| Items count | PASS | **3** (illegal + published + no-scheduledAt correctly excluded) |
| Group count | PASS | **3** groups by local date |
| Group dates | PASS | `2026-07-14`, `2026-07-18`, `2026-07-26` (Asia/Shanghai local day) |
| Item 1 | PASS | 逾期项 / xiaohongshu / ready / 2026年7月14日 … / **Overdue badge** |
| Item 2 | PASS | 合法草稿 / bilibili / draft / 2026年7月18日 … |
| Item 3 | PASS | 其他平台 / other / ready / 2026年7月26日 … |
| Sort order | PASS | Ascending by local scheduledAt (07-14 < 07-18 < 07-26) |
| Time zone label | PASS | `Asia/Shanghai` rendered in meta |
| Platform filter buttons | PASS | All / Bilibili / YouTube / Xiaohongshu / Other (5) |
| Time-range filter buttons | PASS | All scheduled / Next 7 days / Next 30 days / Overdue (4) |
| Unavailable banner | PASS | **Absent** (release mock returned 200) |

### Interaction: Overdue filter
- Clicked "Overdue" time-range button → visible items reduced to exactly **1** (the xiaohongshu −2d item).
- Confirms `Overdue` range = `scheduledAt < now`; filtering is view-only.

### Mobile (375×800)
- **Horizontal overflow check**: region `scrollWidth = 277`, `clientWidth = 277` → `overflow = false`. **PASS** (no horizontal scroll at 375px).

### Request / error audit
- **Write requests that reached a real daemon**: **0**. The app attempted several writes
  (`POST /api/active`, `PUT /api/app-config`, `PUT /api/connectors/composio/config`); **all were
  intercepted** by the route mock and fulfilled locally. `writesReachedRealDaemon: false`.
- **Uncaught page errors**: **0** (`pageErrors: []`).
- **Console errors**: none that indicate a feature fault.

## 5. Acceptance Criteria Summary

| # | Criterion | Status |
|---|---|---|
| C1 | Only `draft`/`ready` releases with a valid `scheduledAt` enter the agenda | PASS |
| C2 | `published` excluded | PASS |
| C3 | `archived` excluded | PASS |
| C4 | Releases without `scheduledAt` excluded | PASS |
| C5 | Malformed `scheduledAt` ("not-a-date", month 13, "") excluded | PASS |
| C6 | Aggregates across loaded projects (read-only, zero writes) | PASS |
| C7 | Per-item: title, project, platform, content, status, local time, overdue | PASS |
| C8 | Content title fallback to `contentId` when content missing | PASS |
| C9 | Sort by `scheduledAt` asc with stable secondary (title → id) | PASS |
| C10 | Grouped by **local** date | PASS |
| C11 | Overdue = `scheduledAt < now` (absolute) | PASS |
| C12 | Current time injectable via `now` prop (testable) | PASS |
| C13 | Platform segmented: All / Bilibili / YouTube / Xiaohongshu / Other | PASS |
| C14 | Time range: All / Next 7 days / Next 30 days / Overdue | PASS |
| C15 | Next 7 days = `now <= s < now + 7d` (exclusive upper) | PASS |
| C16 | Next 30 days = `now <= s < now + 30d` (exclusive upper) | PASS |
| C17 | Overdue range = `s < now` | PASS |
| C18 | Filters affect view only (no requests) | PASS |
| C19 | Release API failure → project isolated (not shown) | PASS |
| C20 | Unavailable hint: `1 project.` / `N projects.` | PASS |
| C21 | Same project double failure counted once (no double count) | PASS |
| C22 | All failed → hint kept + `No available scheduled releases to show.` | PASS |
| C23 | Zero write requests on interaction | PASS |
| C24 | Responsive at ≥960px and ≤640px | PASS |
| C25 | Compact agenda, no nested cards, reuses CSS variables, `creator-release-schedule-*` prefix | PASS |
| C26 | Visual acceptance performed with **zero real runtime writes** (mock/route only) | PASS |

**Overall Verdict**: **PASS — all acceptance criteria met** (unit 18/18, typecheck green, build green,
mock-only browser visual check green, illegal-`scheduledAt` defense verified, `cw06-demo` seed deleted).

---

## 6. Implementation Notes

- New surface is a read-only sibling section inside `TasksView` (creator surface), gated by the same
  top-level `surface === 'creator'` render path as the other creator overview sections.
- Pure helpers (`normalizeReleaseSchedulePlatform`, `releaseScheduleLocalDateKey`,
  `formatReleaseScheduleLocalTime`, `compareReleaseScheduleItems`, `isReleaseScheduleOverdue`) are
  unit-tested directly and keep the component free of business logic in render.
- `now` is injected through the component prop and defaults to `new Date()`; all overdue / time-range
  math uses the injected value so tests control "current time" deterministically.
- `releaseScheduleTimeZone` is resolved from `Intl.DateTimeFormat().resolvedOptions().timeZone` so
  grouping and labels always reflect the runtime locale, not a hardcoded zone.
- Failure isolation reads each project's `releaseState` (only counts projects whose release data has
  loaded **and** `failed === true`); a `Set` dedupes by project so one project failing multiple
  requests is reported once.

## 7. Audit Trail & Confirmations

- **Old branch `feat/cw-06-release-schedule` / old worktree `.worktrees/cw-06-release-schedule` / old
  commits**: **untouched** — not modified, not rebased, not reset, not deleted, not merged, not pushed.
  All CW-06 delivery work for this remediation lives exclusively on the new clean branch/worktree.
- **Clean branch commits** (no `Co-Authored-By`):
  - `0b277bd1c` `docs: design creator release schedule` (research, direct cherry-pick)
  - `3b66cc154` `feat: add creator release schedule` (function + finite-timestamp fix + css + test)
  - `docs: verify creator release schedule` (this document)
- **Forbidden edits avoided**: no `package.json` / `pnpm-lock.yaml` changes, no `daemon/` / `contracts/`
  / `design-systems/` changes, no `next-env.d.ts` committed.
- **No other real daemon data / user assets touched**: cleanup was limited to the single confirmed
  project `cw06-demo`; all other projects, Content, Release, Performance, Media, and user materials are
  intact.
