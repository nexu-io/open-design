# Production Generation Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the production generation logic out of `ProductionWorkspace` into a reusable service layer so script, voice, storyboard, and media generation can be orchestrated through OpenRouter and FAL.ai with validation, rollback, and Claude-reviewed boundaries.

**Architecture:** Start with a pure TypeScript production-generation module that owns prompts, validation, merge logic, and snapshots. Then wire `ProductionWorkspace` to that module without changing the user-facing buttons, and add provider adapters for OpenRouter text generation and FAL.ai media jobs. Keep the first slice refactor-in-place: the UI keeps its current segment state, but the orchestration moves out of the component.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, the existing `streamMessage` provider layer, OpenRouter-compatible chat APIs, and FAL.ai media provider contracts.

---

## File Map

### Create

- `apps/web/src/production-generation/types.ts`
- `apps/web/src/production-generation/state.ts`
- `apps/web/src/production-generation/prompts.ts`
- `apps/web/src/production-generation/validate.ts`
- `apps/web/src/production-generation/merge.ts`
- `apps/web/src/production-generation/openrouter.ts`
- `apps/web/src/production-generation/fal.ts`
- `apps/web/src/production-generation/index.ts`
- `apps/web/tests/production-generation/merge.test.ts`
- `apps/web/tests/production-generation/openrouter.test.ts`
- `apps/web/tests/production-generation/fal.test.ts`
- `reports/2026-07-10-production-generation-implementation-notes.md`

### Modify

- `apps/web/src/components/production/ProductionWorkspace.tsx`
- `apps/web/tests/components/ProductionWorkspace.test.tsx`
- `apps/web/src/providers/anthropic.ts` only if the service needs a narrower helper export
- `apps/web/src/state/config.ts` only if provider presets need to expose a new production-generation default

---

### Task 1: Extract the pure production-generation domain

**Files:**
- Create: `apps/web/src/production-generation/types.ts`
- Create: `apps/web/src/production-generation/state.ts`
- Create: `apps/web/src/production-generation/prompts.ts`
- Create: `apps/web/src/production-generation/validate.ts`
- Create: `apps/web/src/production-generation/merge.ts`
- Create: `apps/web/tests/production-generation/merge.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { mergeGeneratedSegments, validateGeneratedSegments } from '../../src/production-generation';

it('rejects unknown voiceProfileId values before merge', () => {
  expect(() =>
    validateGeneratedSegments({
      segments: [{ id: 'hook', label: 'Hook', voiceProfileId: 'unknown-id' }],
    }, ['guide-host']),
  ).toThrow(/voiceProfileId/i);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm --filter @open-design/web test -- tests/production-generation/merge.test.ts`

Expected: fail because `validateGeneratedSegments` is not implemented yet.

- [ ] **Step 3: Implement the minimal domain helpers**

```ts
export type GenerationKind = 'draft' | 'voice' | 'storyboard';

export interface ProductionSegment {
  id: string;
  label: string;
  paragraph: string;
  narration: string;
  shot: string;
  assets: string;
  output: string;
  voiceProfileId: string;
}

export interface GeneratedSegmentPatch {
  id?: string;
  label?: string;
  paragraph?: string;
  narration?: string;
  shot?: string;
  assets?: string;
  output?: string;
  voiceProfileId?: string;
}

export function validateGeneratedSegments(
  payload: { segments?: GeneratedSegmentPatch[] },
  knownVoiceProfileIds: readonly string[],
): void;

export function mergeGeneratedSegments(
  current: ProductionSegment[],
  generated: GeneratedSegmentPatch[],
  kind: GenerationKind,
  voiceTone: string,
  defaultVoiceProfileId: string,
): ProductionSegment[];
```

- [ ] **Step 4: Re-run the test until it passes**

Run: `pnpm --filter @open-design/web test -- tests/production-generation/merge.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/production-generation apps/web/tests/production-generation
git commit -m "feat: add production generation domain helpers"
```

---

### Task 2: Move OpenRouter text generation behind a service boundary

**Files:**
- Create: `apps/web/src/production-generation/openrouter.ts`
- Create: `apps/web/src/production-generation/index.ts`
- Modify: `apps/web/src/components/production/ProductionWorkspace.tsx`
- Modify: `apps/web/tests/components/ProductionWorkspace.test.tsx`
- Create: `apps/web/tests/production-generation/openrouter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('builds a strict JSON prompt for draft generation and parses the streamed response', async () => {
  const result = await runProductionGeneration({
    kind: 'draft',
    config: openRouterConfig,
    segments,
    voiceTone: 'professional',
    streamMessage: mockStreamMessage,
  });

  expect(result.notice).toContain('Draft updated');
  expect(result.segments[0]?.paragraph).toContain('question the viewer cares about');
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm --filter @open-design/web test -- tests/production-generation/openrouter.test.ts`

Expected: fail because `runProductionGeneration` is not implemented yet.

- [ ] **Step 3: Implement the minimal service entrypoint**

```ts
export async function runProductionGeneration(input: {
  kind: GenerationKind;
  config: AppConfig;
  segments: ProductionSegment[];
  voiceTone: string;
  streamMessage: typeof streamMessage;
}): Promise<{ segments: ProductionSegment[]; notice: string }>;
```

Use this function to own:

- prompt construction
- JSON extraction
- validation
- merge
- one retry on a transient transport failure
- explicit timeout handling through the existing fetch/stream layer

- [ ] **Step 4: Rewire `ProductionWorkspace` to call the service**

Keep the current buttons and lane editing behavior, but move the orchestration out of the component.

- [ ] **Step 5: Re-run the component and service tests**

Run:

```bash
pnpm --filter @open-design/web test -- tests/production-generation/openrouter.test.ts
pnpm --filter @open-design/web test -- tests/components/ProductionWorkspace.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/production/ProductionWorkspace.tsx apps/web/src/production-generation apps/web/tests/production-generation apps/web/tests/components/ProductionWorkspace.test.tsx
git commit -m "feat: route production generation through service"
```

---

### Task 3: Add the FAL.ai adapter boundary and media-job state

**Files:**
- Create: `apps/web/src/production-generation/fal.ts`
- Create: `apps/web/src/production-generation/state.ts`
- Modify: `apps/web/src/media/models.ts` only if a production-generation-specific provider alias is needed
- Create: `apps/web/tests/production-generation/fal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('maps a storyboard shot into a FAL.ai media job request', () => {
  const request = buildFalMediaRequest({
    kind: 'image',
    shotId: 'hook',
    prompt: 'Bold title card with one sample image',
    model: 'fal/flux-pro',
  });

  expect(request.provider).toBe('fal');
  expect(request.kind).toBe('image');
  expect(request.prompt).toContain('Bold title card');
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm --filter @open-design/web test -- tests/production-generation/fal.test.ts`

Expected: fail because `buildFalMediaRequest` is not implemented yet.

- [ ] **Step 3: Implement the adapter interface**

```ts
export type FalMediaKind = 'image' | 'video' | '3d';

export interface FalMediaRequest {
  provider: 'fal';
  kind: FalMediaKind;
  shotId: string;
  prompt: string;
  model: string;
  referenceAssetIds?: string[];
}

export function buildFalMediaRequest(input: FalMediaRequest): FalMediaRequest;
```

Keep this layer dumb and provider-shaped. It should not reach into React state.

- [ ] **Step 4: Keep the UI ready for job state**

Add lightweight media job placeholders in the production state model so later work can surface pending / running / failed jobs without reshaping the segment graph again.

- [ ] **Step 5: Re-run the FAL.ai test**

Run: `pnpm --filter @open-design/web test -- tests/production-generation/fal.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/production-generation apps/web/tests/production-generation apps/web/src/media/models.ts
git commit -m "feat: add fal media generation adapter"
```

---

### Task 4: Verify the end-to-end production workspace path and Claude-review the result

**Files:**
- Modify: `apps/web/tests/components/ProductionWorkspace.test.tsx`
- Add: `reports/2026-07-10-production-generation-implementation-notes.md`

- [ ] **Step 1: Write the integration-focused regression checks**

Make sure the component test still covers:

- draft generation
- voice generation
- storyboard generation
- voice profile binding
- add/remove segment

```ts
it('keeps manual edits intact when generation is idle', () => {
  renderWorkspace();
  fireEvent.change(screen.getByRole('textbox', { name: 'Hook 段落' }), {
    target: { value: 'Manual edit that must remain user-owned.' },
  });
  expect(screen.getByRole('textbox', { name: 'Hook 段落' })).toHaveValue('Manual edit that must remain user-owned.');
});
```

- [ ] **Step 2: Run the full web test target**

Run: `pnpm --filter @open-design/web test`

Expected: all web tests pass.

- [ ] **Step 3: Prepare a sanitized Claude review summary**

Use the same summary rules as the spec review:

- no secrets
- no raw `.env`
- no full repo dumps
- architecture / behavior only

- [ ] **Step 4: Send the summary to Claude through OpenRouter**

Ask Claude to review:

- whether the service extraction is small enough
- whether the adapter boundaries are clean
- whether rollback and validation are enough to protect manual edits
- whether the FAL.ai boundary is intentionally deferred or still too broad

- [ ] **Step 5: Write the review notes**

Save the response to:

- `reports/2026-07-10-production-generation-implementation-notes.md`

- [ ] **Step 6: Commit**

```bash
git add apps/web/tests/components/ProductionWorkspace.test.tsx reports/2026-07-10-production-generation-implementation-notes.md
git commit -m "chore: verify production generation workflow"
```

---

## Self-Review

### Spec coverage

- service extraction: Task 1 and Task 2
- OpenRouter orchestration: Task 2
- rollback / validation: Task 1
- FAL.ai adapter boundary: Task 3
- beginner-friendly UI preservation: Task 2 and Task 4
- Claude verification: Task 4

### Placeholder scan

- No `TBD`, `TODO`, or hand-wavy validation steps remain in the plan body.
- Each test task names the concrete file and command.

### Type consistency

- `GenerationKind`, `ProductionSegment`, `GeneratedSegmentPatch`, and `runProductionGeneration` are introduced once and reused consistently.
- The FAL adapter keeps its own `FalMediaKind` / `FalMediaRequest` names so the media path does not leak into the text-generation types.

