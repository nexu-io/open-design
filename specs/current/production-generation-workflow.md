# Production Generation Workflow

## Purpose

Open Design's production workspace should stop behaving like a local mock and
become a real generation pipeline for short-form video work.

The target workflow is:

- `Script` is the source of truth.
- `Voice` is derived from script segments plus stable voice profiles.
- `Storyboard` is derived from script beats and can later feed image/video jobs.
- `FAL.ai` handles image / video / related media generation.
- `OpenRouter` handles text-heavy generation and refinement through Claude-class models.

This is not a full NLE. The goal is a trustworthy generation loop that can
produce draft text, voice directions, storyboard output, and eventually media
assets from the same segment state.

## Current State

The current implementation already has a useful base:

- `apps/web/src/components/production/ProductionWorkspace.tsx` keeps a
  five-lane production board in local React state.
- The workspace already supports `Generate draft`, `Generate voice`, and
  `Generate storyboard` buttons.
- Those generation actions already stream through `apps/web/src/providers/anthropic.ts`.
- `apps/web/src/state/config.ts` already knows about `OpenRouter`.
- `apps/web/src/media/models.ts` already has an integrated `fal` media provider.
- The workspace now includes Chinese voice profile cards such as:
  - 專業講解者
  - 年輕聲線
  - 成熟聲線
  - 親切聲線
  - 沉穩聲線
  - 活潑聲線

The missing piece is not the UI chrome. It is the generation service boundary:
the workspace currently owns prompt construction, JSON parsing, and state merge
logic directly.

## Goals

- Turn the production workspace into a real generation orchestrator.
- Keep script, voice, storyboard, assets, and output tied to the same segment
  graph.
- Use OpenRouter for text generation and Claude-based review.
- Use FAL.ai for image, video, and related media generation.
- Preserve manual editing. Generated output must remain editable and
  overwriteable by the user.
- Make the workflow understandable for beginners as well as future power users.

## Non-Goals

- No full editing timeline or video editor in v1.
- No background job queue or distributed worker farm in the first slice.
- No automatic long-running render scheduler beyond what the current web app
  can reliably trigger.
- No assumption that every media type is already natively supported by a single
  provider.
- No conversion of the workspace into a general-purpose agent runtime.

## Proposed Architecture

### 1. Production generation service

Create a dedicated service layer that owns generation orchestration.

Suggested shape:

- `apps/web/src/production-generation/`
  - `state.ts`
  - `types.ts`
  - `prompts.ts`
  - `openrouter.ts`
  - `fal.ts`
  - `merge.ts`
  - `validate.ts`

Responsibilities:

- Accept the current production state and a generation kind.
- Build provider-specific payloads from the same normalized state.
- Parse and validate model output.
- Merge results back into the same segment graph.
- Keep provider failures isolated from UI state.

### 1.1 Migration path

This is a refactor-in-place, not a parallel production engine.

The first implementation should move the existing prompt construction, JSON
parsing, and segment merge logic out of `ProductionWorkspace` into the new
service layer while keeping the current buttons and state shape working. The UI
should continue to call the same user-facing actions, but the orchestration
logic should live in reusable helpers.

### 2. Normalized production state

The segment model should stay centered on one shared object graph:

- `id`
- `label`
- `paragraph`
- `narration`
- `shot`
- `assets`
- `output`
- `voiceProfileId`

The next slice may add provider result fields without replacing the core model:

- `voiceJobId`
- `imageRefs`
- `videoRefs`
- `assetRefs`
- `status`
- `error`

The key rule is that voice profiles remain stable identifiers. A character or
host should not change voice every time the text regenerates.

### 2.1 State safety and rollback

Every generation action must preserve a recoverable pre-change snapshot of the
segment list.

Required behavior:

- Keep a pre-mutation copy of the current segment graph before applying model
  output.
- If parsing or validation fails, leave the current state untouched.
- If a generated patch is accepted but the user rejects it, allow reverting the
  whole action.
- Manual edits should still be the user-owned source of truth between
  generation steps.

The first version can use in-memory snapshots and explicit revert actions in
the component state. It does not need a full event-sourced history in v1, but it
does need a concrete rollback path.

### 2.2 Validation rules

Before any generated payload is merged, it must pass schema and invariant
checks.

Required invariants:

- `voiceProfileId` must resolve to a known voice profile.
- Segment order must remain stable unless a segment is explicitly added or
  removed.
- Segment ids must remain unique.
- `paragraph`, `narration`, `shot`, `assets`, and `output` remain string fields.
- Empty generated payloads do not mutate state.

Use a versioned JSON schema or equivalent validation layer so the parser and
the UI can evolve without guessing the payload shape.

### 3. Provider boundaries

#### OpenRouter

OpenRouter is the text-generation and review gateway.

Use it for:

- script cleanup
- segment rewrite
- voice narration rewriting
- storyboard text refinement
- Claude-based spec review

OpenRouter should remain the provider for JSON-shaped text outputs. The
workspace should not care whether the upstream model is Claude Sonnet, Opus, or
another supported Claude-class model. It only cares about the contract:

- strict JSON
- ordered segments
- partial patch merge
- deterministic fallback when parsing fails
- bounded retries for transient transport failures
- explicit timeout handling for long model calls

#### FAL.ai

FAL.ai is the media generation gateway.

Use it for:

- image generation per shot or scene
- video generation per shot or scene
- future 3D / model generation if the product later needs it
- media enhancement or lip-sync style capabilities when the provider and model
  support them

FAL.ai should be called through a dedicated adapter layer, not from component
code. The adapter should normalize provider payloads into the same production
state shape the workspace already uses.

Media job requirements:

- image and video adapters may ship separately if that keeps the first version
  simple
- long-running media jobs must expose a cancellable job id
- failed media jobs must preserve the originating script / storyboard state
- provider-specific rate limits and cost controls should be visible in the
  adapter boundary, even if only as conservative defaults in v1

## Generation Flows

### Flow A: Generate draft

Input:

- current segment text
- current voice binding
- current voice tone

Output:

- revised paragraphs
- revised narration placeholders
- revised shot notes
- revised assets / output placeholders

Expected behavior:

- OpenRouter returns strict JSON.
- The service validates the payload before applying it.
- Invalid payloads leave the current workspace state untouched.
- The action should allow one retry on obvious transport failure before surfacing
  the error.

### Flow B: Generate voice

Input:

- script segments
- voice profile bindings
- voice tone

Output:

- narration rewrites
- stable voice profile ids
- optional per-segment voice direction metadata

Expected behavior:

- Changing the voice profile should update the narration wording for that
  segment.
- Manual edits to narration remain allowed.
- Voice profiles stay bindable per segment.
- The voice profile id remains stable even when narration text changes.

### Flow C: Generate storyboard

Input:

- script segments
- narration
- assets

Output:

- shot text
- shot-level prompt seeds
- later: image/video generation jobs tied to each shot

Expected behavior:

- Storyboard output should stay segment-aligned.
- The service can later fan out each shot into FAL.ai image/video calls.
- Storyboard generation may start as text-only, but the output contract must be
  shaped so that shot-level media jobs can be attached later without a schema
  rewrite.

### Flow D: Generate media

Input:

- a shot or scene id
- prompt seed
- selected provider model
- optional reference assets

Output:

- image asset refs
- video asset refs
- job status / error metadata

Expected behavior:

- Media generation can be added after the text pipeline without reshaping the
  workspace state model again.
- A failed media job should not erase the script or storyboard state.
- The UI should show the job as failed with a retry affordance rather than
  silently dropping it.

## UI Requirements

The current buttons stay, but the workspace should become visibly more
production-oriented:

- show which provider is handling the current generation
- show job progress and last error
- keep the segment editor editable during idle state
- keep generated result blocks in the same workspace
- surface media outputs next to the segment they belong to

The UI should remain beginner-friendly:

- one obvious script input path
- one obvious voice binding path
- one obvious storyboard path
- one obvious generate action per stage

## Error Handling

The generation service must be defensive.

Required behaviors:

- Missing OpenRouter key or unsupported API mode should show an actionable
  notice before the request starts.
- Missing FAL.ai credentials should fail with a provider-specific message.
- Malformed JSON from a text model should be rejected and keep the current
  state unchanged.
- Partial generation should not destroy the rest of the segment graph.
- Provider/model mismatch should identify the provider, not just say "failed".
- Text generation requests should have a finite timeout.
- Media generation jobs should have a visible pending / running / failed state.
- Cancellation should be available for in-flight media jobs.

Fallback rules:

- On text generation failure, keep the current segment state and allow retry.
- On media generation failure, keep the text state and expose the failed job.
- On invalid response format, store the raw response only in debug logs or test
  fixtures, not in user-facing state.

## Claude Verification

The last step of this feature must be a Claude review through OpenRouter.

Verification shape:

- prepare a sanitized summary of the spec and implementation diff
- send that summary to a Claude-class model available through OpenRouter
- ask it to review:
  - provider boundaries
  - state shape
  - error handling
  - scope creep
  - whether the workflow is still beginner-friendly
- record the review notes in a report file under `reports/`
- keep the review summary sanitized and limited to architecture / spec
  commentary

Hard rule:

- Do not send secrets, `.env` files, raw keys, or full repository dumps.

## Testing Strategy

### Unit tests

- state merge helpers for draft / voice / storyboard
- payload validation for OpenRouter JSON responses
- FAL.ai adapter request shaping
- fallback behavior when provider output is malformed

### Component tests

- generation buttons still trigger the right workflow
- voice profile binding remains stable
- segment edits still update derived lanes
- failed generation leaves current state intact

### Review tests

- Claude review findings are checked against the final spec and implementation
- any high-risk scope expansion is explicitly rejected before coding further

## Rollout Plan

1. Extract the current prompt construction and JSON parsing out of
   `ProductionWorkspace`.
2. Add the generation service layer and keep the current button set working.
3. Wire OpenRouter text generation through the new service.
4. Add FAL.ai adapters for image and video jobs.
5. Add the Claude review step using sanitized summaries only.
6. Expand the UI with provider/job status once the pipeline is stable.

## Acceptance Criteria

- Production generation lives behind a dedicated service boundary.
- The workspace can produce draft, voice, and storyboard output from the same
  segment graph.
- OpenRouter handles text generation and Claude review.
- FAL.ai handles media generation through adapters, not component code.
- Failed provider calls do not wipe user edits.
- The final validation includes a Claude second opinion recorded in `reports/`.
