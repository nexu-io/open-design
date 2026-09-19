---
id: 20260918-freeform-canvas
name: Freeform Canvas v1
status: proposed
created: '2026-09-18'
issues:
  - https://github.com/nexu-io/open-design/issues/8230
---

# Freeform Canvas v1

## Overview

An OpenDesign project today is centered on a single primary artifact: the
workspace opens one file at a time and renders it in a sandboxed preview.
Issue #8230 asks for an empty spatial canvas ("like paper.design") where a
project can hold several artifacts at once and place them freely for
side-by-side comparison.

This spec defines v1 of that canvas: a spatial, multi-object surface where a
project holds N artifacts, each positioned by the user, each still rendered
through the existing sandboxed preview. It is a new project surface, not a
redecoration of the current single-artifact viewer.

## Existing System

- Projects are single-artifact. `ProjectTabsState` carries `tabs: string[]` +
  `active` -- a file-tab list, not a spatial layout (no x/y/w/h/z). See
  `packages/contracts/src/api/projects.ts`.
- Artifacts render through a sandboxed, opaque-origin iframe: `srcDoc` plus the
  powered-preview loopback host, with `sandbox="allow-scripts ..."`. See
  `apps/web/src/components/FileViewer.tsx` (sandbox at `:2504`/`:3995`,
  opaque-origin note at `:1034`, powered-preview at `:384`).
- `ProjectFileKind` / `ProjectFile` are defined in
  `packages/contracts/src/api/files.ts`; `ProjectKind` and the scenario/intent
  routing live in `packages/contracts/src/api/projects.ts` and
  `packages/contracts/src/plugins/scenario-defaults.ts`.
- Frontend stack: React 18.3.1, `@excalidraw/excalidraw@0.18.1` (already used
  for the Sketch surface), `three@0.185.1`, `motion@12.40.0`. There is no
  react-flow / tldraw / konva / fabric / pixi dependency today.

## Goals

- A project can hold multiple artifacts positioned on an infinite canvas, each
  with a persisted `{ x, y, w, h, z }`.
- When an agent finishes a turn, its primary artifacts are appended to an
  existing canvas automatically. A turn started from an empty canvas creates
  the first nodes there; projects that have never opened a canvas keep their
  current single-preview workflow.
- Core spatial interactions: pan, zoom, drag, marquee multi-select, resize.
- Each artifact renders inside the existing sandboxed iframe, wrapped in a
  token-styled shell that gives the board its look and feel.
- Two-layer editing is explicit: canvas-level operations act on the shell
  (move, resize, select, z-order); element-level edit-mode acts inside the
  iframe. The two layers never fight over the same gesture.
- Layout survives reload via a new persistence model.

## Non-Goals (v1)

- No edges, connectors, or node handles.
- No rotation, freehand drawing, shapes, arrows, or sticky notes.
- No on-canvas AI generation. Bringing existing artifacts onto the board is the
  v1 loop; generating in place is a fast-follow.

## Design Decisions

### Canvas engine: React Flow (`@xyflow/react`, MIT)

The board is built on React Flow. Its rendering model -- a single transformed
container holding absolutely-positioned DOM nodes with viewport culling -- is
exactly what a sandboxed iframe as a first-class node needs, so an artifact
frame drops in as a node type without fighting the engine.

React Flow covers the spatial baseline directly: infinite canvas, pan/zoom,
node dragging, marquee multi-select, `NodeResizer`, `NodeToolbar`, z-index, and
culling. Alignment guides, copy/paste/duplicate, zoom-to-selection, and a
context menu are bounded additions on top.

The board's look and feel is skinned with the existing CSS tokens so it reads
like a tldraw-style surface. Edges and handles are turned off for v1.

### Undo/redo

React Flow does not ship history, so v1 adds a command stack (zustand + zundo,
or a hand-rolled stack) scoped to canvas-level operations.

### Layout persistence

A new layout model maps each on-board artifact to `{ x, y, w, h, z }` and lets a
project hold N artifacts at peer level, rather than the current single-active
file-tab shape. This is the largest OpenDesign-specific piece and is
independent of which canvas library is chosen.

### Artifact intake

Users can drag existing project artifacts onto the board. When an agent turn
finishes, its primary artifacts are also appended to a canvas that already
exists, or to an empty canvas from which that turn was started. The generated
artifact remains focused in the existing single-artifact preview, so automatic
synchronization does not interrupt the current delivery flow.

## Open Questions

- Live iframe vs snapshot: proposed default is snapshot-first -- every artifact
  shows a static snapshot and only the focused artifact upgrades to a live
  sandboxed iframe. Running N live sandboxes at once is heavy to render and hard
  to manage.

## Constraints

- The sandbox stays. Artifact HTML ships global CSS, untrusted JS, and its own
  viewport semantics; it must keep export fidelity and the powered-preview
  cross-origin isolation. The canvas wraps each artifact in a shell but never
  inlines its content into the host document -- the shell is host-rendered React
  for the board chrome, the content stays a sandboxed opaque-origin iframe.
