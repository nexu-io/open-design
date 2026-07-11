# Production Canvas Lite Design

## Goal
Build a lightweight, usable canvas editor for the production workspace that lets Arthur and future users:

- drag production cards around
- create and remove connections between cards
- edit card content in place
- keep the existing Script / Voice / Storyboard / Assets / Output workflow intact
- preserve the current save/load and generation flow

This is intentionally not a full infinite-canvas rewrite yet. It is the smallest useful step toward a tapnow / lovart-style workflow.

## Current State

The repo already has:

- a production workspace with editable Script / Voice / Storyboard / Assets / Output lanes
- OpenRouter text generation for draft / voice / storyboard
- FAL.ai queue planning and submission for image/video
- a 3D plan-only adapter contract
- a canvas draft that renders six fixed nodes and lets the user drag them and create simple links

What is missing:

- freeform node creation and deletion in the canvas itself
- editable node fields directly inside canvas cards
- connection persistence in workspace state
- a shared data model so the canvas and the lane editor stay in sync
- better affordances for reading and editing the flow at a glance

## Scope

### In scope for this phase

- convert the current canvas draft into the primary visual editor for the production flow
- support node drag, add, delete, and rename
- support link creation and removal between nodes
- persist canvas layout and links per project
- keep the canvas focused on production lanes rather than becoming a general-purpose whiteboard
- sync canvas node content with the existing production document state

### Out of scope for this phase

- zoom / pan / minimap / infinite scrolling surface
- arbitrary node types beyond the production lanes
- real-time multi-user collaboration
- port-level advanced graph editor features
- video rendering or export engine work
- TTS synthesis, 3D execution, and final video assembly

## Recommended Approach

Use the current lightweight board and upgrade it incrementally rather than replacing it with a third-party graph library.

Why:

- the current app already stores production data and sync state
- the current workflow is already opinionated around Script / Voice / Storyboard / Assets / Output
- a small custom canvas keeps the interaction model aligned with the product, not with a generic node editor
- it reduces risk while still proving the core canvas experience

## User Experience

The canvas should become the visual front door for the production workspace:

- each node represents one production lane or a user-added segment
- nodes can be dragged to reorder the workflow visually
- each node should expose:
  - title
  - short summary
  - quick add / delete controls
  - connection controls
- links should show the current downstream relationship
- when Script changes, downstream lanes should clearly show stale / diverged / detached state

The canvas is still beginner-friendly:

- the lane editor remains available below the canvas
- the canvas should not hide the existing text fields
- the user can use whichever surface feels easier for the moment

## Data Model

Add a project-scoped canvas state that stores:

- node id
- node title
- node description
- node position
- outgoing links
- optional lane binding to the production document

Keep the production document as the source of truth for the lane content. The canvas is a view + layout + link layer on top of that document, not a second independent truth source.

## Sync Rules

- editing a lane in the canvas updates the underlying production document
- editing a lane in the lane editor updates the corresponding canvas node
- adding a node in the canvas creates a corresponding segment when appropriate
- deleting a node removes or detaches only the canvas representation unless the user explicitly removes the underlying segment
- if a script beat changes, downstream lanes become stale unless they were detached
- regeneration should only rewrite lanes that are still attached to the script flow

## Interaction Rules

- dragging a node updates its stored canvas coordinates
- clicking `Out` starts a connection from that node
- clicking `In` on another node completes the connection
- duplicate edges are ignored
- self-links are blocked
- delete should be guarded so the user does not accidentally destroy the only script segment

## Implementation Notes

- keep the current `ProductionWorkspace` orchestration
- replace the fixed-node assumptions in `ProductionCanvasBoard` with state-driven nodes and edges
- store canvas layout in localStorage first, matching the existing workspace persistence pattern
- keep lane editing and canvas editing in the same project session
- do not block the UI on FAL or OpenRouter availability

## Verification

We will consider this phase done when:

- the production canvas can drag, link, add, and delete nodes
- the layout persists across refresh
- the canvas reflects edits made in the lane editor
- the lane editor reflects edits made in the canvas
- the existing generation buttons still work
- `git status --short --branch` is clean after the change set

## Risks

- The canvas can become too generic if we add too many node types too early
- Sync logic can become confusing if canvas state and production document state diverge
- A custom canvas may need a second phase for zoom and infinite navigation

## Next Step

Implement the canvas editor as a lightweight production-specific board, then layer TTS, output assembly, and 3D execution on top of the same data model.
