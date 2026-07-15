# RFC: Agent-ready Open Design — one assistant that can drive the whole app

**Status:** Draft (umbrella design for review; only slice 1 ships code in the first PR)
**Author:** @leonaburime-ucla
**Related:** #5398 (make Open Design agent-ready)

## Summary

Today the chat assistant only helps with the page you are on. This RFC proposes
turning it into one assistant that can drive the whole app — including taking
actions in the browser UI on the user's behalf — built product-neutrally so the
same engine could power other products on this foundation.

This umbrella RFC presents the WHOLE arc so maintainers and product reviewers can
evaluate it at once (the issue is labeled `needs-product-direction`). Only
**slice 1** ships code in the first PR: the shared contracts
(`packages/contracts/src/agent-tools/`) plus this RFC. Everything past slice 1 is
described here as types + prose, and the genuinely open calls are presented as
**options considered → recommendation** rather than decrees, so reviewers judge
the design space.

## Problem

- **The chat is stuck on one page; real work isn't.** A real task touches several
  places (design system → deck → media), which today means several chats and a
  lot of clicking.
- **People can't find what OD can do.** Capabilities are discoverable only by
  navigating to their page; there is no one catalog of "what can you do?".
- **The inbound half is missing.** OD already emits its runs in **AG-UI format —
  the outbound half** (`packages/agui-adapter` → `/api/agui`). There is no
  inbound path where the assistant *executes* an interface action and gets the
  result back. That return path is the genuinely new seam.

Two execution models must both be served: (a) the **BYOK daemon-loop**, where the
daemon runs the model turn and orchestrates tools; and (b) a **local-CLI agent**
subprocess (Claude/Codex/etc.) that can only reach tools via MCP.

## The capability model (declare / list / search / call / result)

Every capability is one **tool**, declared once and reachable through an
MCP/WebMCP-congruent surface:

| Concern | Shape (in `contracts`) | MCP analog |
|---|---|---|
| **Declare** | `AgentToolDescriptor` (`browser` \| `api` union) | tool definition |
| **List** | `AgentToolManifest` (`protocolVersion`, `runId`, `tools[]`) | `tools/list` |
| **Search** | `AgentToolSearchQuery` → `AgentToolSearchResult` (paged, `api` only) | discovery over `tools/list` |
| **Call — `browser`** | `BrowserActionRequest` (`invocationId`, `runId`, `tool`, `input`) — dispatch toward a live session | `tools/call` (browser surface) |
| **Result — `browser`** | `BrowserActionResult` (`ok`-discriminated; `result: JsonValue`) | tool result |
| **Call — `api`** | the tool's own declared `/api/*` route + `od` subcommand (`ApiToolDescriptor.api` / `.cli`) — no round-trip envelope | `tools/call` (api surface) |

`AgentToolDescriptor` carries `name` (stable, dot-namespaced), `description`
(model- and catalog-facing), `inputSchema` (JSON Schema as `JsonValue`, so it
crosses the MCP wire verbatim — WebMCP / MCP-UI / A2UI ready), and a `surface`
discriminant. A `browser` tool asserts `viewStateOnly: true`; an `api` tool
carries both its `/api/*` route and its `od` subcommand, so the UI/CLI dual-track
law is **structural**, not a review checkbox.

**The two surfaces are called through two distinct request paths — the envelope is
not universal.** An `api` capability is a normal `/api/*` action: the daemon
invokes its declared route directly (and it is reachable as an `od` subcommand),
so it needs no dispatch-and-await round-trip and does **not** use
`BrowserActionRequest`. `BrowserActionRequest` / `BrowserActionResult` exist
**only** for the `browser` surface — the genuinely new inbound seam — because a
browser tool runs in a remote context (the live session) the daemon must dispatch
to and await a result from. On that browser path the action identity is a
daemon-minted `invocationId`; a provider `tool_call_id` or MCP request id maps to
it daemon-side and never enters the contract, so `result: JsonValue` means a
navigation acknowledgement and a future data-returning browser read serialize
identically — no navigation special case. `protocolVersion` on the manifest and
on the browser-action messages is the literal `typeof AGENT_ACTIONS_PROTOCOL_VERSION`,
so catalog and browser calls version together.

## Complex / multi-step workflows

The slice-1 shapes support complex work, not just one action:

- **Chaining.** The agent loop drives one step at a time: each step is a
  `BrowserActionRequest` correlated to its `BrowserActionResult` by
  `invocationId`; because `result` is `JsonValue`, one step's output feeds the
  next step's `input`. No workflow object is required for sequential work.
- **Concurrency.** Each invocation has its own `invocationId`, so independent
  invocations may be in flight at once; the daemon reconciles each result to its
  own record. Nothing in the shapes forces serialization.

**Deferred:** streaming/progress for long-running steps (results are terminal in
slice 1), and a first-class task/workflow object that can span projects — slice 5,
with its own permissions RFC.

## Agent tool search — options

As OD accumulates tools across design systems, media, connectors, and Composio,
handing the model the full catalog gets expensive — the daemon's own MCP layer
notes a `tools/list` response costs on the order of ~150 tokens per call. So the
model should **find** relevant tools, not receive all of them. Two orthogonal
axes: how matches are computed (A/B/C), and how much of a tool enters model
context at all (D).

**Option A — Keyword / substring (SQL `LIKE`/FTS5 over name + description).**
Query the persisted registry over `name` and `description`.
*Pros:* zero new infra, deterministic, debuggable, no model dependency, cheap.
*Cons:* weak on vague intent ("make the images match the brand" won't match
`imagegen.recolor` by keyword); sensitive to naming discipline.

**Option B — Semantic / embedding search.**
Embed each descriptor; store vectors; rank the query by cosine similarity.
*Pros:* best recall on fuzzy intent; robust to vocabulary mismatch.
*Cons:* needs an embedding model + a vector store, adds cost + latency + a model
dependency, and non-determinism that complicates review and tests. Overkill until
tool count and fuzzy-intent misses justify it.

**Option C — Hybrid (keyword prefilter → semantic rank).**
`LIKE`/FTS narrows to a candidate set; embeddings rank within it.
*Pros:* bounds embedding cost to a small candidate set while keeping fuzzy recall.
*Cons:* two subsystems to build and keep consistent; premature before B is even
warranted.

**Option D — Deferred tools / progressive disclosure (context-budget strategy,
orthogonal to A/B/C).**
Only tool **names** (and one-line descriptions) enter model context; the full
`inputSchema` is fetched on demand via search — exactly how coding-agent harnesses
expose a "ToolSearch" over deferred tools. This is not a matching algorithm; it is
what the model *sees*, and it composes with whichever of A/B/C computes the match.

**Advertisement axis — PUSH vs PULL.**
- *PUSH:* the frontend advertises its live `AgentToolManifest` on mount / on tool
  registration. **Required for browser-surface tools** — the daemon cannot know
  which browser tools are live without the session telling it.
- *PULL:* the agent calls `capability.search` on demand against the persisted
  registry. Transport-agnostic; works for local-CLI-via-MCP; the natural fit for
  the large, persistent `api`-surface catalog.

**Recommended slice-3 default: A + D, with hybrid PUSH/PULL.** Ship keyword/FTS5
matching (A) under deferred/progressive disclosure (D): names-only in context,
schemas fetched on `capability.search`. Advertise **browser** tool availability by
PUSH (the session tells the daemon what is live) and discover the **api** catalog
by PULL (`capability.search`). Defer B/C until we have evidence of fuzzy-intent
misses at real tool counts — adding embedding ranking later is a
runtime/`providers` change behind the same `search` port and needs no contract
change (see "Non-breaking type hooks").

## Options considered → recommendation (key decisions)

**Return path.**
Options: (1) reuse GenUI `POST /api/runs/:runId/genui/:surfaceId/respond`;
(2) a NEW run-scoped `POST /api/runs/:runId/actions/:invocationId/result`;
(3) make `agui-adapter` inbound.
Tradeoff: (1) is live and proven but its surface/`respondedBy` lifecycle is shaped
for HITL surfaces, so every future action feature would mutate a table owned by
another concern; (3) welds the return path to one wire protocol and abandons the
native non-AG-UI chat path.
**Recommend (2)** — a dedicated endpoint *patterned on* GenUI's pending→responded
lifecycle without overloading `genui_surfaces`, keeping action semantics
(timeouts, consent, correlation) in their own home.

**Registry persistence.**
Options: in-memory; the daemon's SQLite store under the resolved data root
(`RUNTIME_DATA_DIR`); a flat file.
Tradeoff: in-memory loses the catalog on restart and can't scale to "too many
tools" or support search; a flat file re-implements indexing badly.
**Recommend SQLite** under the resolved data root — it scales, gives FTS5 for
Option A for free, and matches how the daemon already persists state. (Per the
repo's Daemon data directory contract, this RFC names no filesystem path; the
store derives from the resolved data root.)

**Advertisement scope.**
Options: per-run; per-session/tab; per-app-shell.
Tradeoff: browser tools are only live while their tab is mounted, so app-shell
scope over-claims availability and per-run alone can't see a tab that mounted
mid-run.
**Recommend per-session/tab availability advertised into the active run** — the
manifest granularity stays `manifest(runId)`, but browser-tool availability is
sourced from the live session, reconciled to the run.

**Action identity.**
Options: daemon-minted `invocationId`; provider `toolCallId`.
Tradeoff: `toolCallId` is free in the BYOK loop but absent in the MCP bridge and
scoped per-provider-turn, so using it as identity binds the contract to one
execution model.
**Recommend daemon-minted `invocationId`** as the sole contract identity; a
`toolCallId`/MCP request id maps to it daemon-side and never enters the contract.

**Result transport.**
Options: `POST` return; a websocket/SSE push channel for lower latency.
Tradeoff: `POST` is simplest and the browser already has an authenticated HTTP
path; a push channel lowers latency but adds a persistent connection and
reconnection semantics.
**Recommend `POST` for slices 2–3**; revisit a push channel only if action
round-trip latency becomes a measured problem. Dispatch (daemon→browser) already
rides the existing outbound run-event stream, so only the return leg is at issue.

## Registry boundary

The descriptor + manifest + search shapes and the `AgentToolRegistry` **port**
live in `packages/contracts` (this PR, pure types). The registry **runtime**
(registration + lookup + SQLite persistence) lands in slice 2 in a NEW standalone
`packages/agent-tools` package **forbidden from importing `apps/*` or any
project-specific code** — the guard against re-inventing a `ProjectView`-shaped
abstraction — enforced by a `scripts/check-cross-app-imports.ts`-style guard wired
into `pnpm guard`. Design tools register themselves as entries; the list itself
stays product-neutral.

## Return path

Transport-agnostic across both execution models, converging on a daemon-side
invocation record keyed by `invocationId`:

- **Dispatch** rides the existing outbound run-event stream as a new event kind
  carrying a `BrowserActionRequest`.
- **Return** is a new run-scoped endpoint
  `POST /api/runs/:runId/actions/:invocationId/result`, patterned on GenUI's
  pending → responded lifecycle (see the return-path option above).
- **Local-CLI agents** reach browser tools via a per-run **frontend-bridge MCP
  server** extending `buildLiveArtifactsMcpServersForAgent`; its handlers await
  the same invocation record.

## Dual-track exemption

> A tool may be `surface: 'browser'` — and ship without an `od` CLI form — ONLY
> if its whole effect is an ephemeral browser view movement (navigate, scroll,
> focus, panel visibility, current selection) and nothing it produces outlives the
> browser session. If it creates, mutates, or reads anything that persists beyond
> the session, or could be meaningfully invoked with no browser attached, it is a
> capability: `surface: 'api'` with both an `/api/*` route and an `od` subcommand.

Litmus: *"could it be meaningfully invoked with no browser attached?"* must FAIL
for a browser tool. "Go to Media" fails it (exempt); "export the deck" passes it
(a capability — cannot hide behind the exemption).

## Slice roadmap

| Slice | Deliverable | Ships code? |
|---|---|---|
| **Prereq** | `ChatComposer` decomposition — the active vertical-slice canary, **in progress**; prerequisite for a global mount. | in progress |
| **1 (this PR)** | Contracts (`agent-tools/`: descriptor, actions, manifest, registry port) + this RFC. | ✅ types only |
| **2** | Guarded `packages/agent-tools` runtime + SQLite persistence + one browser nav tool AND one browser click tool + the return endpoint → prove one action round-trips live. | ✅ |
| **3** | Search (`capability.search`, default A + D) + PUSH/PULL advertisement handshake + "what can you do?" catalog view + frontend-bridge MCP server for local-CLI agents. | ✅ |
| **4** | Global chat mount (one assistant, not three page-bound ones). | ✅ |
| **5** | Cross-project task ownership + bounded permissions — see [companion RFC](./agent-ready-cross-project.md) (`AgentTask` + permissions options). | own RFC |

## Non-breaking type hooks — ruled out for now

Adding an optional field later is itself non-breaking, so slice 1 stays minimal:

- **`AgentToolSearchResult` item `score?`** — ruled OUT. Only Option B needs it;
  add it (optional) when embedding ranking lands. Non-breaking then.
- **`AgentToolSearchQuery.tags?: string[]`** — ruled OUT. No taxonomy exists yet;
  add optionally if a tag facet appears.
- **`AgentToolManifest` `hasMore?`/cursor** — ruled OUT. The manifest is the
  *full* small-run catalog; the large-registry path is `search()`, which already
  pages. Adding paging to the manifest would duplicate that seam.

## Deferred / Out of scope (this PR)

- Any behavior/feature code — slice 1 is contracts + this RFC only.
- The `packages/agent-tools` runtime, its guard, and SQLite persistence (slice 2).
- Search execution, the advertisement handshake, the catalog view, and the
  frontend-bridge MCP server (slice 3).
- Global chat mount (slice 4); cross-project ownership + permissions (slice 5).
- Consent UX (`USER_DENIED` is reserved in the contract but unwired).
- Multi-tab / multi-session arbitration; streaming/progress results;
  result-size limits; `resultSchema` validation; any `scope`/permission fields.
- No new chat framework, no changes to `agui-adapter` / `genui_surfaces` / the run
  engine in this PR.

## Open questions

1. **Product direction** — is the browser-action bridge the right first
   investment (the `needs-product-direction` question), ahead of global chat?
2. **Search default** — is A + D sufficient for slice 3, or do reviewers expect
   semantic search (B/C) from day one?
3. **Consent** — when does a browser action need explicit confirmation, and should
   `USER_DENIED` gate destructive `api`-surface tools too?
4. **Manifest freshness** — does a run re-fetch the manifest as tools register
   (PUSH), or snapshot it at run start?
