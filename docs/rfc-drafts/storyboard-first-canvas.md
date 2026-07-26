# RFC: Storyboard-first evolution of Studio into a production canvas

**Status:** Draft (umbrella design for review; only slice 1a ships code in the first PR)
**Author:** @pftom
**Related:** [`agent-ready.md`](./agent-ready.md) — this proposal extends the same UI/CLI dual-track law to artifact and asset operations. Companion RFC: [`multi-artifact-agent-execution.md`](./multi-artifact-agent-execution.md) (that one owns *how agents execute*; this one owns *where results live*). Reference implementation: the Open Design Canvas project (Workspace v2, storyboard/canvas dual views, asset/node object model).

## Summary

Studio's right side today is an artifact tree plus a sandboxed preview: files in, one
artifact out. This RFC proposes evolving that rail — in three independently shippable
slices — into a **Storyboard** (a typed, provenance-aware board of everything the
project has produced) and then unlocking a **Canvas view** over the same data: artifacts
become placeable nodes with positions and context edges, and a persisted view switch
toggles between Storyboard and Canvas. Project files gain a curated **Asset** layer so
reusable materials are first-class without disturbing the daemon-owned file workspace.

The end state is that every coding agent already wired via `od mcp install` can operate
a persistent multimodal production surface — not just emit one artifact per
conversation — while existing users experience each step as "Studio got stronger,"
never "there is a new product to learn."

## Problem

- **Production state is trapped in single artifacts.** A real brief spans several
  artifacts (design system → images → prototype → deck). Today those are separate
  outputs in a flat tree; nothing records which inputs, prior artifacts, or design
  decisions produced which result.
- **The file workspace conflates three roles.** Source files agents read/write,
  reusable brand/reference materials, and generated deliverables all live as "files."
  Reuse means remembering paths; provenance means scrolling chat history.
- **Agents have no spatial/contextual surface.** The MCP surface can create artifacts
  but cannot express "this deck derives from these three images and this brief." A
  context graph is the natural substrate for the multi-step, multi-artifact work the
  agent-ready RFC anticipates.

## Object model: File ≠ Asset ≠ Node

The one hard rule in this RFC. Collapsing these layers is the failure mode.

| Layer | Owner | What it is | Mutability |
|---|---|---|---|
| **File** | daemon file workspace (unchanged) | Real bytes on disk; agents read/write directly | As today |
| **Asset** | new asset service | Curated, workspace-level reference/snapshot of a file or generated artifact; searchable, reusable | Promote / update / archive; deleting an asset never deletes files or placed nodes |
| **Node** | canvas state | A placed instance on the canvas: position, edges, versions, run status; records `sourceAssetId` | Independent snapshot; no automatic two-way sync with its source asset |

Generated artifacts are **auto-promoted** to assets (they are the product's output —
provenance comes free). Ordinary files are promoted **manually**. "Files become canvas
assets" therefore means a curated layer above files, not a bulk import of every file
into a library.

## Design

### Slice 1a — Storyboard rail (ships first, view-layer only)

Replace the artifact tree + preview with a Storyboard view:

- Columns exist only for artifact kinds present in the project (Prototype / Deck /
  Image / HyperFrame / …), each card showing base-vs-generated provenance: design
  system, primary skill/template, runtime + model, parameters, and version.
- Opening a card keeps the typed rail visible and swaps only the bounded preview stage;
  artifact-specific commands sit above the preview.
- No data-model change: this slice is a unified read model over existing project files,
  runs, and conversations, plus UI. Independently releasable behind a flag.

### Slice 1b — Asset layer

- `Asset` objects + promote/place/detach/archive commands in `packages/contracts`,
  daemon routes, `od` CLI subcommands, and MCP tools (dual-track law: every asset
  operation declares both its `/api/*` route and its `od` subcommand).
- Library UI: search, favorites, recents, upload, drag-to-place.

### Slice 1c — Canvas view

- Nodes (position + size), context edges, and `@` mentions of upstream nodes; a
  persisted per-project **Storyboard ⇄ Canvas** switch over the same data.
- Two invariants, both load-bearing:
  1. **The view switch adds no execution semantics.** Edges express context and
     derivation; the canvas as a whole is never a runnable DAG. Explicit sub-graph
     selection is the only future run boundary (kept out of scope here).
  2. **The single-artifact flow stays the default.** Storyboard is the default right
     rail; Canvas is opt-in per project.

### What this unlocks later (out of scope, for orientation)

Once edges exist, follow-up RFCs can attach: approved-input gates (fail-closed input
review before any provider spend), durable generation jobs, incremental sub-graph
runs, and publishable workflow apps. None of that is needed to evaluate slices 1a–1c.
The execution side of that arc is sketched in
[`multi-artifact-agent-execution.md`](./multi-artifact-agent-execution.md).

## Options considered → recommendation

1. **Separate "Canvas" project type** alongside Studio — clean isolation, but forks the
   product mental model, duplicates preview/export surfaces, and strands existing
   projects. **Rejected.**
2. **Bulk-convert files to canvas assets** — makes the library a mirror of the file
   tree, burying reusable materials under build output. **Rejected** in favor of the
   promote layer.
3. **Storyboard-first evolution of the existing rail** (this RFC) — each slice is
   independently valuable, existing projects upgrade in place, and the canvas arrives
   as a view over data users already trust. **Recommended.**

## Compatibility and rollout

- Slice 1a behind a feature flag defaulting on after one release; the legacy tree
  remains one release as an escape hatch.
- No migration required until 1b (assets are additive tables/state); 1c stores node
  layout as per-project view state.
- The MCP/CLI additions version through `packages/contracts` as usual.

## Open questions

1. Should auto-promotion of generated artifacts be per-project configurable?
2. Does node layout belong in project state or per-user view state for shared/exported
   projects?
3. Minimum provenance schema for 1a cards when a run predates this feature (backfill
   from run bookkeeping vs. "unknown provenance" badge)?
