# Creator Focus Contract Hardening Implementation Plan

**Goal:** Make the Creator Workbench focus chain depend only on typed semantic data, so changing a title or displayed label can never change a recommended action or navigation behavior.

**Architecture:** The current uncommitted baseline already separates focus reason/action keys from display labels and gives event-derived activities an `eventType`. Preserve that baseline as an isolated refactor. Then narrow `eventType` to the subset of `CreatorEvent` values that can produce an activity row, validate it at the presentation boundary, and centralize focus-action navigation policies in the adapter. `TasksView` renders labels and executes returned policies only.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, React 18, Next.js 16.

---

## Scope

```text
CreatorEvent -> creator-ui ActivityItemViewModel -> creator adapter FocusCard
             -> focus-action policy -> TasksView navigation/session handoff
```

Do not combine this hardening work with a full creator-workbench i18n migration. Current labels stay visually unchanged. A later i18n change must consume the semantic keys defined here and must not restore label-based branching.

The following seven validated, uncommitted files are the baseline. Review and commit them separately before the follow-up tasks:

- `apps/web/src/components/TasksView.tsx`
- `apps/web/src/creator-adapters/index.ts`
- `apps/web/tests/creator-adapters/creator-dashboard.test.ts`
- `packages/creator-ui/src/normalizers.ts`
- `packages/creator-ui/src/types.ts`
- `packages/creator-ui/src/view-models.ts`
- `packages/creator-ui/tests/creator-ui.test.ts`

## Contract

| Concern | Canonical field | Allowed values | Display boundary |
| --- | --- | --- | --- |
| Activity provenance | `ActivityItemViewModel.eventType` | `activity.recorded`, `run.started`, `run.finished`, `runback.recorded`, or absent for a domain activity | `creator-ui` converter |
| Focus reason | `CreatorFocusCard.reasonKey` | `CreatorFocusReasonKey` | adapter creates `reasonLabel` |
| Recommended action | `CreatorFocusCard.recommendedActionKey` | `CreatorFocusActionKey` | adapter creates `recommendedActionLabel` |
| UI behavior | `CreatorFocusActionPolicy` | typed discriminated union | adapter maps, `TasksView` executes |

Invariants:

1. `title`, `summary`, `stageLabel`, `statusLabel`, `reasonLabel`, and `recommendedActionLabel` are presentation data. Behavior must never compare them.
2. A domain `ActivityEvent` titled `运行开始` or `运行完成` is not a run lifecycle event unless derived from a matching `CreatorEvent`.
3. Unknown or malformed `eventType` values are rejected by the normalizer.
4. Adding a focus action key must fail TypeScript until one explicit policy is supplied.

## Files

| File | Responsibility |
| --- | --- |
| `packages/creator-ui/src/types.ts` | Typed activity provenance |
| `packages/creator-ui/src/view-models.ts` | Domain/event to view-model conversion |
| `packages/creator-ui/src/normalizers.ts` | Runtime view-model shape guard |
| `packages/creator-ui/tests/creator-ui.test.ts` | Converter/normalizer contract tests |
| `apps/web/src/creator-adapters/index.ts` | Focus selection, labels, action-policy mapping |
| `apps/web/tests/creator-adapters/creator-dashboard.test.ts` | Dashboard semantic and policy tests |
| `apps/web/src/components/TasksView.tsx` | Policy execution and label rendering |
| `apps/web/tests/components/TasksView.page.test.tsx` | User-visible handoff regression tests |

All tests stay in existing sibling `tests/` directories, never under `src/`.

## Task 1: Commit the verified baseline

1. Inspect only the baseline files:

```powershell
git diff --check
git diff -- apps/web/src/components/TasksView.tsx apps/web/src/creator-adapters/index.ts apps/web/tests/creator-adapters/creator-dashboard.test.ts packages/creator-ui/src/normalizers.ts packages/creator-ui/src/types.ts packages/creator-ui/src/view-models.ts packages/creator-ui/tests/creator-ui.test.ts
```

Expected: `reasonKey` / `recommendedActionKey` drive behavior; labels are separate; event-derived rows carry `eventType`.

2. Verify the baseline:

```powershell
corepack pnpm --filter @open-design/creator-ui build
corepack pnpm --filter @open-design/creator-ui test
corepack pnpm --filter @open-design/web exec vitest run tests/creator-adapters/creator-dashboard.test.ts
corepack pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx
```

Expected: exit `0`. Current focused counts: creator-ui 37, dashboard 25, TasksView 24.

3. Commit only the baseline:

```powershell
git add apps/web/src/components/TasksView.tsx apps/web/src/creator-adapters/index.ts apps/web/tests/creator-adapters/creator-dashboard.test.ts packages/creator-ui/src/normalizers.ts packages/creator-ui/src/types.ts packages/creator-ui/src/view-models.ts packages/creator-ui/tests/creator-ui.test.ts
git commit -m "refactor: separate creator focus semantics from labels"
```

Expected: none of those seven files remain in `git status --short`. Do not stage unrelated work.

## Task 2: Close and validate activity provenance

1. In `packages/creator-ui/tests/creator-ui.test.ts`, add normalizer tests beside the existing activity normalizer tests:

```ts
it("accepts a run.finished activity event type", () => {
  expect(normalizeActivityItemViewModel({
    ...validActivityVm,
    eventType: "run.finished",
  })).not.toBeNull();
});

it("rejects an event type that cannot create an activity row", () => {
  expect(normalizeActivityItemViewModel({
    ...validActivityVm,
    eventType: "task.updated",
  })).toBeNull();
});

it("rejects an unknown activity event type", () => {
  expect(normalizeActivityItemViewModel({
    ...validActivityVm,
    eventType: "run.cancelled",
  })).toBeNull();
});
```

2. Confirm the two rejection tests fail before implementation:

```powershell
corepack pnpm --filter @open-design/creator-ui exec vitest run tests/creator-ui.test.ts
```

3. In `packages/creator-ui/src/types.ts`, add the type-only import and alias before `ActivityItemViewModel`:

```ts
import type { CreatorEventType } from "@open-design/creator-events";

export type ActivityItemEventType = Exclude<
  CreatorEventType,
  "task.created" | "task.updated"
>;
```

Change the field to:

```ts
eventType?: ActivityItemEventType;
```

4. In `packages/creator-ui/src/normalizers.ts`, add the exact allowlist near `isObjectRecord`:

```ts
const activityItemEventTypes = [
  "activity.recorded",
  "run.started",
  "run.finished",
  "runback.recorded",
] as const;

function hasValidActivityItemEventType(record: Record<string, unknown>): boolean {
  const eventType = record.eventType;
  return eventType === undefined || activityItemEventTypes.includes(
    eventType as (typeof activityItemEventTypes)[number],
  );
}
```

Keep `eventType` in `hasOptionalStringFields`. Before returning an activity model, add:

```ts
if (!hasValidActivityItemEventType(input)) return null;
```

5. Keep `eventType: event.type` for every event-derived object in `packages/creator-ui/src/view-models.ts`; direct domain activities leave it absent. Do not infer provenance from titles.

6. Validate and commit:

```powershell
corepack pnpm --filter @open-design/creator-ui build
corepack pnpm --filter @open-design/creator-ui test
corepack pnpm --filter @open-design/creator-ui typecheck
git add packages/creator-ui/src/types.ts packages/creator-ui/src/normalizers.ts packages/creator-ui/tests/creator-ui.test.ts
git commit -m "fix: validate creator activity event provenance"
```

## Task 3: Centralize focus-action behavior as an exhaustive policy

1. In `apps/web/tests/creator-adapters/creator-dashboard.test.ts`, add a failing test and import `resolveCreatorFocusActionPolicy`:

```ts
it("defines one policy for every creator focus action key", () => {
  expect(Object.values(CREATOR_FOCUS_ACTIONS).map(resolveCreatorFocusActionPolicy)).toEqual([
    { kind: "retry" },
    { kind: "open-project", conversation: "focus" },
    { kind: "open-project", conversation: "focus" },
    { kind: "start-first-run" },
    { kind: "open-project", conversation: "root" },
    { kind: "open-project", conversation: "root" },
    { kind: "open-project", conversation: "root" },
  ]);
});
```

2. In `apps/web/src/creator-adapters/index.ts`, immediately after `CreatorFocusActionKey`, add:

```ts
export type CreatorFocusActionPolicy =
  | { kind: "open-project"; conversation: "focus" | "root" }
  | { kind: "retry" }
  | { kind: "start-first-run" };

export function resolveCreatorFocusActionPolicy(
  actionKey: CreatorFocusActionKey,
): CreatorFocusActionPolicy {
  switch (actionKey) {
    case CREATOR_FOCUS_ACTIONS.retryRun:
      return { kind: "retry" };
    case CREATOR_FOCUS_ACTIONS.monitorRun:
    case CREATOR_FOCUS_ACTIONS.reviewOutput:
      return { kind: "open-project", conversation: "focus" };
    case CREATOR_FOCUS_ACTIONS.startFirstRun:
      return { kind: "start-first-run" };
    case CREATOR_FOCUS_ACTIONS.unblockProject:
    case CREATOR_FOCUS_ACTIONS.continueEditing:
    case CREATOR_FOCUS_ACTIONS.continueTask:
      return { kind: "open-project", conversation: "root" };
  }
}
```

No `default` branch. A new action key must fail compilation until it gets a policy.

3. In `apps/web/src/components/TasksView.tsx`, import `resolveCreatorFocusActionPolicy` instead of `CREATOR_FOCUS_ACTIONS`. At the top of `triggerCreatorFocusAction`, resolve once:

```ts
const policy = resolveCreatorFocusActionPolicy(focus.recommendedActionKey);
```

Replace all action-key comparisons with policy checks. Plain navigation must be:

```ts
if (policy.kind === "open-project") {
  navigate({
    kind: "project",
    projectId: focus.projectId,
    conversationId: policy.conversation === "focus"
      ? focus.conversationId ?? null
      : null,
    fileName: null,
  });
  return;
}
```

Keep current session-storage behavior in the `retry` and `start-first-run` branches unchanged. The CTA renders `recommendedActionLabel` only.

4. In `apps/web/tests/components/TasksView.page.test.tsx`, create an existing retry or monitor fixture with a known action key and override only:

```ts
recommendedActionLabel: "A label that must not affect navigation",
```

Click the focus CTA and assert the same `navigate(...)` call as before. The destination must come from the key/policy, not that replacement label.

5. Validate and commit:

```powershell
corepack pnpm --filter @open-design/web exec vitest run tests/creator-adapters/creator-dashboard.test.ts
corepack pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx
corepack pnpm --filter @open-design/web typecheck
git add apps/web/src/creator-adapters/index.ts apps/web/src/components/TasksView.tsx apps/web/tests/creator-adapters/creator-dashboard.test.ts apps/web/tests/components/TasksView.page.test.tsx
git commit -m "refactor: centralize creator focus action policies"
```

## Task 4: Acceptance gate

1. Check final source invariant:

```powershell
rg -n -e 'reasonLabel\\s*===' -e 'recommendedActionLabel\\s*===' -e 'activity\\?\\.title\\s*===' apps/web/src packages/creator-ui/src
```

Expected: no source matches. Titles may render or appear in tests but cannot select focus reason, action, rank, or navigation.

2. Run complete verification:

```powershell
git diff --check HEAD~2..HEAD
corepack pnpm --filter @open-design/creator-ui build
corepack pnpm --filter @open-design/creator-ui test
corepack pnpm --filter @open-design/creator-ui typecheck
corepack pnpm --filter @open-design/web test
corepack pnpm --filter @open-design/web typecheck
corepack pnpm --filter @open-design/web build
git status --short
```

Expected: all validation commands exit `0`; no whitespace errors. If unrelated files exist, report their paths and do not stage or revert them.

## Acceptance checklist

- [ ] `ActivityItemViewModel.eventType` is an event subset, not `string`.
- [ ] Direct domain activities have no provenance; event-derived rows keep their real source type.
- [ ] Invalid and task-only event types are rejected.
- [ ] A domain activity titled `运行完成` resolves to `next_best_task` / `continue_task`.
- [ ] A real `run.finished` event resolves to `fresh_result_to_review` / `review_output`.
- [ ] `TasksView` makes no behavioral decision from a label or title.
- [ ] Every `CreatorFocusActionKey` maps through a typed policy without a default branch.
- [ ] Creator-ui build/test/typecheck and web tests/typecheck/build pass.

## Deferred follow-up

Create a separate i18n plan after this lands. Move creator labels from `packages/creator-ui` and `apps/web/src/creator-adapters/index.ts` to the web locale boundary, preserve all semantic keys and policies above, and do not combine that locale sweep with this hardening work.
