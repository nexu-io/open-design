# Open Design Production Implementation Plan

Date: 2026-07-11
Source: Claude second-opinion review on the current production workspace

## Goal

Make the production workspace reliable enough for real short-form video work:

- script, voice, storyboard, assets, and output stay in sync
- OpenRouter handles text generation through a clean service boundary
- FAL.ai handles media generation through a clean adapter boundary
- the canvas remains a usable infinite-canvas-style production view
- the system remains beginner-friendly without losing power

## Current Starting Point

Already in place:

- five editable lanes
- reusable voice profile cards
- draggable canvas nodes and links
- FAL.ai job tracking, sync, and cancellation
- OpenRouter-backed text generation
- plan-only 3D node in the canvas
- tests passing for the touched areas

The main remaining risk is architectural coupling:

- orchestration is still too close to the React workspace
- sync rules are not yet a formal document model
- job durability and reconciliation are not yet daemon-authoritative

## Execution Order

### P0 - Foundation before more feature work

These items remove the highest-risk coupling first.

1. Define a canonical production document model.
2. Define sync and stale-state rules for all lanes.
3. Extract OpenRouter and FAL.ai behind adapter boundaries.
4. Define the 3D job schema now, but keep execution plan-only.

### P1 - Make it durable and maintainable

These items make the workflow survive reloads, retries, and future growth.

1. Move job authority into a daemon-persistent job ledger.
2. Extract orchestration out of `ProductionWorkspace`.
3. Add sync / stale / rollback tests for the riskiest transitions.
4. Keep canvas state as a projection of the document, not a second truth.

### P2 - Improve the product experience

These items make the studio feel closer to Tapnow / Lovart while staying more structured.

1. Add canvas ergonomics and node-grouping improvements.
2. Add a guided beginner mode that drives the same underlying model.
3. Add dry-run and cost awareness before batch generation.
4. Postpone live 3D generation until the surface contract exists.

## P0 Plan

### P0.1 Canonical production document model

Create one normalized document shape:

- `Project`
- `Segments`
- `narration`
- `shots`
- `assetRefs`
- `outputRefs`

Rules:

- every lane reads from this model
- each lane is a projection, not a separate source of truth
- each entity needs stable IDs
- every generated field should know whether it is user-owned or derived

Minimum metadata to add:

- `source: "user" | "generated"`
- `derivedFrom`
- `revision`
- `stale: boolean`

Acceptance criteria:

- a script edit marks dependent narration / shot / asset / output data as stale
- downstream edits are not silently overwritten
- stale items are visible in the UI

### P0.2 Explicit sync rules

Write the sync policy down before more UI work.

Recommended rule set:

- script is the primary source for structure
- downstream edits are allowed
- if a downstream item diverges from the latest script revision, show a divergence state
- user chooses between `regenerate`, `keep`, or `detach`
- no silent clobbering

Acceptance criteria:

- a user can edit a shot after generation
- a later script edit does not destroy that shot without warning
- the UI can tell when a lane is stale, detached, or still in sync

### P0.3 Provider adapter boundaries

Split provider responsibilities into two adapters:

- `TextGenAdapter` for OpenRouter
- `MediaGenAdapter` for FAL.ai

Each adapter should own:

- submit
- poll
- cancel
- normalizeError

Rules:

- no provider calls from React component code
- no provider keys in renderer-side orchestration
- all retry / timeout / payload shaping should live in the adapter layer

Acceptance criteria:

- the workspace calls a service, not a provider
- provider swap risk is isolated to one layer

### P0.4 3D contract, but still plan-only

Define the 3D schema now:

- camera / view direction
- scene depth or layering
- model or asset reference
- expected output type

Rules:

- the UI may show 3D planning
- the daemon must not execute 3D until support is confirmed
- 3D jobs must remain visibly plan-only

Acceptance criteria:

- the UI can plan 3D without pretending execution exists
- the schema exists before execution support

## P1 Plan

### P1.1 Durable job ledger

Move job authority to the daemon.

Recommended storage:

- SQLite or append-only JSON ledger

Responsibilities:

- persist job records
- reconcile local state after reload
- reattach running jobs after crash
- resolve orphaned or stale jobs

Acceptance criteria:

- a reload does not lose job identity
- queued / running / failed jobs can be restored
- local UI state and daemon state can be reconciled deterministically

### P1.2 Extract orchestration out of `ProductionWorkspace`

Create a workflow layer or state machine that owns:

- lane sync cascade
- stale marking
- provider dispatch
- result attachment
- rollback / revert handling

The React component should become:

- render
- dispatch
- view state

Preferred implementation options:

- reducer-based workflow store
- XState-style workflow machine

Acceptance criteria:

- the workspace component becomes smaller and easier to test
- orchestration can be tested without rendering the full UI

### P1.3 Tests for the highest-risk transitions

Add tests specifically for:

- script edit -> stale downstream state
- downstream manual edit -> protected from silent overwrite
- job cancel -> reconciles correctly
- queue sync -> durable job state remains consistent
- 3D plan-only node -> cannot be dispatched as live media

Acceptance criteria:

- the riskiest sync behavior is covered by deterministic tests
- tests describe the intended production rules, not just UI output

## P2 Plan

### P2.1 Canvas ergonomics

Treat the canvas as the view of the document, not a second data store.

Useful upgrades:

- minimap
- group / frame scenes
- snap-to-lane behavior
- clearer provenance badges
- better empty / stale / diverged states

Acceptance criteria:

- the canvas feels like a real production surface
- nodes and links reflect document state instead of drifting away from it

### P2.2 Beginner-friendly guided mode

Add a linear guided mode that drives the same model as the canvas.

Suggested steps:

- script
- voice
- storyboard
- generate
- review
- export

Rules:

- no forked data model
- the canvas remains the advanced view
- beginners can complete a flow without learning the whole graph first

Acceptance criteria:

- a new user can finish a basic workflow without touching canvas internals
- advanced users can switch to the canvas without losing state

### P2.3 Cost and dry-run awareness

Before a batch generation run, show:

- estimated number of jobs
- rough provider cost implication
- which lanes will be mutated

Acceptance criteria:

- users can preview impact before committing generation
- accidental large batch runs become less likely

## Postpone

Do not prioritize these until the foundation above is in place:

- live 3D generation
- real-time collaboration / CRDTs
- heavy infinite-canvas polish before the document model exists
- more provider-specific UI until the adapter layer is stable

## Recommended Next Build Order

1. Production document model
2. Sync / stale / provenance rules
3. TextGenAdapter / MediaGenAdapter
4. Durable daemon job ledger
5. Orchestration extraction
6. Sync / rollback tests
7. Canvas ergonomics
8. Guided beginner mode
9. Cost / dry-run awareness

## Definition of Done for the Next Milestone

The next milestone is ready when:

- script edits, voice edits, and storyboard edits all have explicit sync behavior
- generation provider calls live behind adapters
- job state survives reload / crash recovery
- the canvas still works as a useful production view
- the 3D node remains clearly plan-only until execution support exists

