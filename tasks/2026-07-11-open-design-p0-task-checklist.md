# Open Design P0 Task Checklist

Date: 2026-07-11
Source: [Open Design Production Implementation Plan](/Users/arthur/Documents/Codex/2026-07-06/open-design/docs/plans/2026-07-11-open-design-production-implementation-plan.md)

## Purpose

Turn the P0 foundation into a concrete execution checklist.

P0 is about removing the biggest architecture risks first:

- one canonical production document model
- explicit sync / stale rules
- provider adapter boundaries
- 3D contract definition, but still plan-only

## P0 Execution Order

1. Define the canonical document model.
2. Define sync / stale / provenance rules.
3. Extract provider adapter boundaries.
4. Define the 3D schema and keep it plan-only.

## Status

P0 foundation work has been implemented in the current branch:

- canonical production document model
- explicit sync / stale / detach rules
- provider adapter boundaries
- 3D schema with plan-only execution

## P0.1 Canonical Production Document Model

### Checklist

- [x] Define the normalized production document shape in `apps/web/src/production-generation/types.ts` or a nearby domain file.
- [x] Decide which fields are canonical vs derived.
- [x] Add stable IDs for every production entity that can be edited independently.
- [x] Add provenance metadata:
  - `source: "user" | "generated"`
  - `derivedFrom`
  - `revision`
  - `stale`
- [x] Update the segment model so lane projections can reference the same canonical record.
- [x] Add a short design note describing the model and why each lane is a projection, not a second store.

### Acceptance Criteria

- Script, Voice, Storyboard, Assets, and Output can all be explained as views over one document model.
- No lane owns a separate conflicting truth.
- Every generated field can be traced back to its source.

### Suggested Verification

- Add unit tests for the model helpers.
- Confirm the model still supports the current editable five-lane workspace.

## P0.2 Explicit Sync / Stale Rules

### Checklist

- [x] Define the sync policy in writing before changing more UI behavior.
- [x] Decide what happens when script edits conflict with downstream manual edits.
- [x] Implement a stale marker for downstream data when script changes invalidate it.
- [x] Add a divergence state for manually edited downstream fields.
- [x] Define the user actions for diverged content:
  - `regenerate`
  - `keep`
  - `detach`
- [x] Prevent silent overwrite of downstream user edits.
- [x] Add UI wording that makes stale vs detached vs in-sync states obvious.

### Acceptance Criteria

- A user can edit a shot or narration after generation.
- A later script edit does not silently destroy that downstream change.
- The UI can show whether each lane item is stale, detached, or still in sync.

### Suggested Verification

- Add tests for:
  - script edit -> downstream stale
  - downstream manual edit -> preserved
  - regenerate -> clears stale state

## P0.3 Provider Adapter Boundaries

### Checklist

- [x] Define `TextGenAdapter` for OpenRouter-backed text generation.
- [x] Define `MediaGenAdapter` for FAL.ai-backed media generation.
- [x] Move provider-specific payload shaping into adapter files.
- [x] Move retries, timeout handling, and error normalization into adapters.
- [x] Ensure React workspace code no longer talks to providers directly.
- [x] Keep provider keys out of renderer-side orchestration.
- [x] Add a note on where provider secrets are allowed to live.

### Acceptance Criteria

- The workspace calls a service boundary, not a provider.
- Provider swap risk is localized to the adapter layer.
- The UI remains ignorant of provider-specific payload details.

### Suggested Verification

- Add adapter unit tests for request shape and error mapping.
- Confirm existing generation buttons still behave the same from the user perspective.

## P0.4 3D Contract, Plan-Only for Now

### Checklist

- [x] Define a 3D job schema.
- [x] Include camera / view direction, scene depth, model or asset reference, and expected output type.
- [x] Keep 3D in plan-only mode until daemon support is confirmed.
- [x] Make the UI say clearly that 3D is planned but not yet executable.
- [x] Ensure 3D nodes cannot be accidentally dispatched as live media.

### Acceptance Criteria

- Users can plan 3D in the canvas.
- The system does not pretend 3D execution exists before the backend supports it.
- 3D jobs remain visibly different from executable image / video jobs.

### Suggested Verification

- Add a test that 3D remains plan-only.
- Add a test that live dispatch rejects unsupported 3D execution.

## P0 Ready State

P0 is done when all of the following are true:

- the production document model is canonical
- sync / stale behavior is explicitly defined
- provider access is behind adapters
- 3D has a schema but remains plan-only

## Notes For The Next Phase

Once P0 is done, move to:

- daemon-persistent job ledger
- orchestration extraction out of `ProductionWorkspace`
- sync / rollback tests
- canvas ergonomics and beginner mode
