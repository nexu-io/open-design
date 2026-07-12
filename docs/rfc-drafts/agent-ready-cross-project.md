# RFC: Agent-ready Open Design — cross-project tasks & spanning-project permissions

**Status:** Draft (companion to agent-ready.md; the maintainer's separate reviewable permissions writeup)
**Author:** @leonaburime-ucla
**Related:** #5398 (make Open Design agent-ready); companion: [agent-ready.md](./agent-ready.md) (slice 5)

## Summary

The umbrella RFC ([agent-ready.md](./agent-ready.md)) defers "cross-project task
ownership + bounded permissions" to slice 5 and, per the maintainer's request,
keeps spanning-project **permissions** as their own reviewable writeup rather than
a footnote. This is that writeup. It introduces one minimal pure type — `AgentTask`
— and presents the permissions model as **options → recommendation**, not a decree.

Key insight: cross-project work and the deferred "long-horizon complex task" are
the SAME shape. A task that is not bound to one project owns a goal across many
steps AND across many projects. `AgentTask` answers both. No behavior code ships
here — types + prose only; actual multi-project runs are slice 4/5 implementation.

## Problem

Today a chat is bound to one project's page, so a real instruction like "drop the
HeyGen intro into the Apple project's index.html, and pull the Ford project's hero
images near the footer" (issue #5398, Example 2) has nowhere to live: it spans two
projects, two integrations, and a file edit. Two things are missing:

1. **A durable owner** for a goal that outlives one step and crosses projects.
2. **A bounded permission model** — what set of projects may a task touch, and how
   is that granted — so cross-project autonomy does not become unbounded
   blast-radius.

## The AgentTask model

`AgentTask` (in `packages/contracts/src/agent-tools/task.ts`) is a durable,
project-agnostic record: a stable `taskId`, an optional human `goal`, a
`projectIds` set (the authorized projects — the ownership/blast-radius boundary,
NOT the enforcement mechanism), and a `status` from the `AGENT_TASK_STATUSES`
const-union (`active` / `awaiting-consent` / `completed` / `failed` / `cancelled`).

It is deliberately minimal. It carries **no** embedded project state, no roles, no
UI shape — the guard against re-modeling `ProjectView` as a "task." Steps correlate
to a task the same way single-project steps already correlate to a run: by id. A
long-horizon single-project task is just an `AgentTask` whose `projectIds` has one
entry; a cross-project task has several.

## Project addressing — options → recommendation

How does a tool call say which project it targets?

- **(a) `projectId` inside the tool's `input`.** Works today with zero contract
  change. *But* it is invisible to the daemon: the daemon cannot route or
  permission-check a target buried in tool-specific `input` without parsing every
  tool's schema.
- **(b) A first-class `targetProjectId?` the daemon reads directly** — carried on
  each surface's own request path (per agent-ready.md the two surfaces have
  distinct call paths, so there is no single universal envelope to bolt it onto).
  The daemon reads the target without parsing tool-specific `input`, so it can
  route and enforce the task's `projectIds` boundary uniformly on both paths.

**Recommend (b)** for cross-project work, added as OPTIONAL, non-breaking fields
when slice 5 lands (alongside an optional `taskId?` to correlate steps to the
`AgentTask`). Because a `browser` call and an `api` call travel different paths,
the fields are added on **both**: on `BrowserActionRequest` for the browser
surface, and on the `api`-call request (query/body the daemon controls) for `api`
tools — which do not use the browser envelope. They are **not** added in slice 1:
adding an optional field later is non-breaking, so the shipped contract stays
minimal. The future browser-envelope addition:

    // BrowserActionRequest (slice 5, non-breaking optionals):
    taskId?: string;          // the AgentTask this step advances
    targetProjectId?: string; // absent = the run's current project

    // The api-call path carries the same two as daemon-controlled request
    // params, so an api capability can be routed and permission-checked
    // cross-project without ever touching the browser envelope.

## Cross-project discovery

No new mechanism is required. The registry and `capability.search` are already
**workspace-level** for `api`-surface tools (see agent-ready.md "Agent tool
search — options"). So "pull the Ford project's hero images" is a content-search
`api` tool invoked with a `targetProjectId` the task is authorized for — discovery
and retrieval reuse the existing search/registry surface, scoped by the task's
`projectIds`. Cross-project is a *permission + addressing* problem, not a new
discovery problem.

## Permissions — options → recommendation (the maintainer's separate reviewable decision)

This is the decision the maintainer asked to keep as its own writeup. How does a
user grant a task access to projects?

- **Option 1 — Explicit allow-list at task creation.** `projectIds` is fixed when
  the task is created. *Pros:* simplest, fully bounded blast-radius, trivially
  reviewable/auditable. *Cons:* rigid — the user must know every project up front;
  widening scope mid-task means restarting or re-prompting.
- **Option 2 — Just-in-time consent on first touch.** The task starts with a
  narrow (or empty) `projectIds`; touching a new project moves it to
  `awaiting-consent` and prompts the user, appending on approval or denying via the
  reserved `USER_DENIED` action error. *Pros:* least-privilege, grows the set
  naturally, no upfront enumeration. *Cons:* interrupts long autonomous runs; needs
  a consent surface (GenUI / `question-form` can serve it).
- **Option 3 — Workspace-wide with per-write confirmation.** Reads span the whole
  workspace; only writes confirm. *Pros:* frictionless discovery/reads. *Cons:*
  broad read blast-radius; write-confirmation fatigue; weakest audit story.

**Recommended default: Option 1 as the authoritative boundary, extended by Option 2
to widen it.** The `projectIds` set is the hard blast-radius boundary; a step
targeting a project outside it does not silently proceed — the task enters
`awaiting-consent` and the user either appends the project (Option 2) or the step
is denied (`USER_DENIED`). Reads and writes within the allow-list proceed; any
touch outside it requires consent. This gives an auditable static boundary plus
least-privilege growth, and reuses the already-reserved consent primitive rather
than inventing a new one.

**This recommendation is explicitly a proposal for review, not a decree** — it is
the reviewable permissions decision the maintainer flagged. Reviewers should weigh
whether writes *inside* the allow-list also warrant confirmation, and whether
read-only cross-project discovery is granted more liberally than write access.

## Relationship to slices 4 and 5

- **Slice 4 (global chat mount)** is the prerequisite home: a task not bound to one
  project's chat needs a workspace-level assistant to live in.
- **Slice 5 (this design's runtime)** creates/persists `AgentTask` in the daemon's
  SQLite store under the resolved data root (`RUNTIME_DATA_DIR` — no path literal
  per the data-directory contract), adds the optional `taskId?`/`targetProjectId?`
  routing fields on both call paths (browser envelope + `api`-call request), and
  enforces `projectIds` per the chosen permission model.

The `AgentTask` **type** lands now (slice 1 companion) so reviewers judge the shape
and the permission options together; the runtime is slice 5.

## Deferred / Out of scope

- All behavior/runtime: task creation, persistence, scheduling, and permission
  enforcement (slice 5).
- Cross-project routing fields (`taskId?`, `targetProjectId?`) on both call paths —
  the `BrowserActionRequest` envelope and the `api`-call request — added
  non-breakingly in slice 5, not this PR.
- Per-step progress/streaming for long-horizon tasks; task pause/resume UX; task
  history and audit-log shapes; multi-user / shared-task ownership; role- or
  capability-scoped grants (beyond project-set scoping).

## Open questions

1. **Permission model** — which of the three options (or the recommended hybrid) do
   product + maintainers want as the default?
2. **Read vs write asymmetry** — should cross-project reads be granted more freely
   than writes within the same `projectIds` boundary?
3. **Consent surface** — reuse GenUI / `question-form` for `awaiting-consent`, or a
   dedicated task-permission prompt?
4. **Task durability** — should `AgentTask` gain an optional `protocolVersion` /
   timestamps when the runtime lands, or stay envelope-free? (Both are non-breaking
   additions later.)

See the umbrella design: [agent-ready.md](./agent-ready.md).
