# RFC: Multi-artifact agent execution — three lanes and an intent-level session API

**Status:** Draft (umbrella design for review; only slice 1 ships code in the first PR)
**Author:** @pftom
**Related:** [`../external-media-orchestration.md`](../external-media-orchestration.md) (this RFC is the "separate owner decision" that note calls for), [`agent-ready.md`](./agent-ready.md) (dual-track law). Companion RFC: [`storyboard-first-canvas.md`](./storyboard-first-canvas.md) (Asset/Node substrate; that one owns *where results live*, this one owns *how agents execute*). Prior art: LibTV `libtv-labs/libtv-skills` (intent-level delegation), Open Design Canvas (command-level contract, durable jobs, gates).

## Summary

Open Design's agent loop was purpose-built for artifacts the agent can *type out*:
design-system-composed prompt in, streamed HTML out, sandboxed preview, critique. That
loop is the product's moat — and it does not generalize. Images, video, audio and 3D
are provider calls, not token streams; workflows and video-editing projects are state
mutations, not documents. This RFC routes agent execution into **three lanes by
artifact class**, adds per-lane quality mechanisms, and introduces an **intent-level
session API** so thin agents get full production capability with one instruction —
while deep agents keep the typed command contract.

## Problem

- **One pipeline, many physics.** Streaming a deck and rendering a 10-second video
  share nothing: different failure modes, latency, cost, and verification. Forcing
  media through the CLI text loop means the local model's media ability caps output
  quality, and a dropped HTTP connection loses paid work.
- **Spend is unguarded.** Provider calls can be expensive; today nothing reviews
  inputs before money is spent, deduplicates retries, or survives a daemon restart.
- **Quality is unowned for non-HTML artifacts.** The critique loop inspects rendered
  pages; nothing verifies that a generated image is on-brand or that a video used the
  intended references.
- **Breadth vs. depth is unresolved.** 25 wired CLIs could drive rich commands, but
  most integrations only need "make me a campaign video" to work reliably.

## Prior art (read before judging the design)

**LibTV (`libtv-labs/libtv-skills`)** ships a thin OpenClaw-spec skill: five
stdlib-Python scripts that send the user's *natural-language intent verbatim* to an
Agent-IM OpenAPI. Orchestration happens server-side (their agent routes models and
builds the workflow); the local agent only polls progress, downloads results, and
receives a `projectUrl` to the visible canvas. Compatibility is maximal (anything that
runs python3), quality is centrally owned, and the access key anchors billing.

**Open Design Canvas** takes the opposite stance: a 100+-command typed contract that
local agents drive directly, with durable generation jobs, approved-input gates, and
full provenance. Depth and auditability are maximal; each agent must understand more.

These are levels, not rivals. This RFC adopts both.

## Design

### Lane A — code-rendered artifacts (unchanged)

Prototype, Deck, dashboards, HyperFrame stay on the existing CLI streaming loop with
design-system prompt composition and critique. No changes; this lane is the baseline
other lanes are measured against.

### Lane B — media artifacts (typed tools + durable jobs)

The agent never emits media bytes. It calls typed generation tools that create a
**durable generation job**: idempotency key, frozen context snapshot, `start / get /
list / wait / cancel`, restart reconciliation (orphaned jobs marked `interrupted`,
retryable), artifact + version committed only on success. Provider adapters are
provider-neutral but **capability-truthful**: each model declares its real input
contract, and unsupported context is refused with a concrete reason — never silently
dropped. This slots into the existing `mediaExecution` boundary;
`external-media-orchestration.md` explicitly defers a provider router to "a separate
owner decision" — this RFC is that proposal, scoped to job lifecycle + adapters, not a
provider account pool.

### Lane C — stateful artifacts (serializable commands)

Workflows/toolboxes and video-editing projects are mutated through serializable
commands over shared state (the Asset/Node substrate from the storyboard-first-canvas
RFC; one timeline project shared by UI and agent for editing). The agent proposes and
applies operations; it never regenerates the whole document. Execution over a graph
scope gets a **free, read-only plan step** (what runs, what's stale, what's blocked)
before any provider is called.

### Quality mechanisms (per lane)

1. **Kind-locked skills and parameters.** Each artifact kind gets its own skill set
   and a locked parameter schema (image: aspect/resolution; video: duration/audio; …).
   No cross-kind switcher.
2. **`DESIGN.md` extends to media.** The design system contributes brand colors,
   reference images, and style assets as generation context, so media output is shaped
   by the same brand contract as HTML. This is the differentiator no model aggregator
   has.
3. **Verification per lane.** Lane A: existing critique. Lane B: generate → preview →
   agent visual check against the brief/design system → bounded retry. Lane C: plan
   before run; optional **approved-input gate** — when enabled on a generation source,
   every upstream input must be explicitly approved before any provider spend
   (fail-closed).
4. **Spend safety.** Idempotency keys prevent double billing; gates run before
   provider calls; job history records provider/model/parameters for audit.

### Intent-level session API (breadth lane)

A minimal surface modeled on LibTV's Agent-IM, powered by Open Design's own in-product
orchestration: `create session → send intent message → poll progress → fetch results`.
The server-side agent decomposes the intent across lanes A–C. Every response carries a
**visible project URL** so a browser-capable agent (or human) can watch the work land
in Studio — make "results link to their visible surface" a contract-level convention
for all three lanes. This API is intentionally thin enough for a stdlib-script skill,
and is the natural metering point for Open Design Cloud.

## Options considered → recommendation

1. **Teach CLI agents to produce all media themselves** — quality capped by whichever
   local model the user runs; no spend control or provenance. **Rejected.**
2. **Intent-only delegation (pure LibTV model)** — maximal breadth, but forfeits the
   typed command surface that makes Open Design agent-*operable* rather than
   agent-*callable*, and conflicts with the dual-track law. **Rejected as the sole model.**
3. **Dual-level: typed contract for depth + intent sessions for breadth, with lane
   routing underneath both** (this RFC). **Recommended.**

## Slices

1. **Contracts** (`packages/contracts`): artifact-kind descriptors, media job
   lifecycle schemas, capability declaration shape. Ships code first, with this RFC.
2. Durable job engine + first provider adapters behind `mediaExecution`.
3. Lane C command set (depends on storyboard-first-canvas slices 1b/1c).
4. Intent session API + `projectUrl` response convention.
5. Verification loops and gates.

## Open questions

1. Do gates default on for provider calls above a cost threshold, or stay opt-in per
   source?
2. Does the intent API live in the daemon or only in Open Design Cloud (local-first
   users may still want it for thin-agent breadth)?
3. Minimum viable visual-verification rubric for Lane B before it blocks delivery
   (hard fail vs. advisory)?
