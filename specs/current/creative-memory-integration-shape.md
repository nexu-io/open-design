# Creative Memory Integration Shape

## Purpose

Capture the integration-boundary decisions the product/pipeline team needs to
make before any creative-memory implementation can land in the live generation
loop. What this doc covers is **not** the memory engine itself. It is the
contract between memory and the rest of Open Design: where signals come from,
where the prompt block goes (and how it relates to the existing `## Personal
memory` slot the daemon composer already populates), how users control it,
and how the raw-events / content-addressed-derivations contract (background
below) reshapes the boundary.

This is doc-only. No code lands with this PR. Each section enumerates the
option space, names a working lean, and flags the decision that needs an
explicit product/pipeline call. The intent is to react against this doc rather
than against committed code, so reversing a decision costs a doc edit instead
of a refactor. The doc is written to apply to either implementation that
might land — PR [#1746](https://github.com/nexu-io/open-design/pull/1746)'s
RFC/prototype package or a team-internal implementation — per the resolved
foundation-vs-reference question on the parent issue.

Anchor threads:

- Issue [#1637](https://github.com/nexu-io/open-design/issues/1637) — the
  product-direction thread; carries the Section 11 raw-events contract
  discussion in line.
- PR [#1746](https://github.com/nexu-io/open-design/pull/1746) — the
  RFC/prototype engine package, parked while this doc is reviewed.

## Background

This section inlines just enough of the engine's external shape that the
later sections do not depend on any file outside `main`. Anyone who wants
the full simulation suite, lifecycle rationale, or open-questions ledger
can read PR [#1746](https://github.com/nexu-io/open-design/pull/1746); the
material below is what this doc itself relies on.

### Engine external API (current shape, subject to integration)

The prototype exposes a deliberately small surface:

- `retrieveForInjection(userId, context)` — pure function over stored state
  plus request context. Returns a structured result describing the
  preferences that should be injected, plus diagnostic events explaining
  what was kept, dropped, capped, suppressed, or backfilled at each stage.
- `buildPromptBlock(retrieved, projectId)` — formats the retrieval result
  as a fixed `[MEMORY CONTEXT]` block (Prefer / Avoid sections per
  confidence tier, plus an optional `Project override:` line).
- `ingestSignal(userId, signal)` — accepts one classified signal at a time
  (one of `generation_accepted`, `manual_refinement`, `explicit_tag`,
  `thumbs`, `abandon`, `revert`).
- `runDecay(userId)` — invoked by the host on a fixed schedule (typically
  session start); decays untouched preferences and archives stale ones.
- Typed adapter handlers — `onGenerationAccepted`, `onArtifactEditedAndSaved`,
  `onExplicitTagApplied`, `onThumbsRated`, `onGenerationAbandoned`,
  `onRevertAfterEdit`. Each wraps `ingestSignal` with the right signal type;
  these are the integration touch points §1 of this doc decides on.

The integration contract this doc defines does **not** require keeping
those exact names or signatures. They are listed so the §1 / §2 decisions
have a concrete starting point.

### Engine storage shape (current shape, also subject to integration)

The prototype stores plain JSON per user at
`<storage_root>/<userId>/preferences.json`, schema-versioned, with:

- `global_preferences[]` — preferences with no project scope.
- `project_overrides{<project_id>: prefs[]}` — per-project preferences.
- `refinement_log[]` — diff history; dormant today (nothing reads it),
  preserved as the natural seed for the future raw-events log.
- `memory_enabled` — soft kill switch; when `false`, ingestion no-ops and
  retrieval returns empty.

`<storage_root>` defaults to a package-local directory and is overridable
via `MEMORY_STORAGE_ROOT`. §3 of this doc proposes aligning that with
`OD_DATA_DIR` precedence per [`AGENTS.md`](../../AGENTS.md) FAQ "Where is
data written?".

### Raw-events / content-addressed-derivations contract

The current engine is **write-time-derivation**: `ingestSignal` mutates
preference records directly. Two failure modes were identified during PR
[#1746](https://github.com/nexu-io/open-design/pull/1746) review:

1. **Attribution.** A unary accept/reject is one bit; without contrastive
   context, an extractor will attribute rejections to whatever it finds
   most salient in each candidate, not what the user actually disliked.
   After enough events, rejection memory hardens around extractor salience
   rather than user intent.
2. **Re-derivation impossible.** Derived features are written directly,
   so an improved extractor or new contextual signals cannot retroactively
   re-interpret older events.

The agreed forward-looking contract:

- **Raw events are canonical.** Every interaction event is persisted as an
  append-only record with enough context to re-derive features later.
- **Derived features are a cache.** What is currently the preference
  records becomes a cached interpretation over the raw event log. Each
  derived feature carries the derivation function version that produced it.
- **Pairwise > unary for attribution.** Where the UX can support it, prefer
  pairwise comparison over unary accept/reject. Unary signals stay
  weaker/provisional unless reinforced by explicit tags, edits, or
  contrastive evidence.
- **Cache invalidation is content-addressed.** Cache key for a derived
  feature is `hash(raw_event_set, derivation_fn_version)`. When either
  side changes — new raw events arrive, the derivation function changes,
  the version tag bumps — the key changes and the old derived value is
  unreachable. Re-derivation happens on demand against whatever set of
  raw events the new key resolves over. A derived feature can never be
  stale, because if it were stale its key would have changed and the
  lookup would miss.

This is the "Section 11 contract" §4 of this doc maps onto integration
boundaries.

## Non-goals

- Choosing between PR #1746's package and an internal team implementation as
  "the" foundation. The product call has been made: PR #1746 is RFC/prototype
  input. This doc is written to apply to either implementation.
- Designing UI screens. Where user controls are needed, the doc names the
  surfaces and the dual-track UI/CLI obligations from
  [`AGENTS.md`](../../AGENTS.md), but stops short of pixel-level proposals.
- Tuning normalizer values, reversal multipliers, or injection format.
  Those are engine-internal numerics, not integration boundaries.

## 1. Signal capture points

The engine exposes six typed handlers. Each needs a concrete pipeline event to
fire from. The decisions here are the integration form of the same questions
called out in the Background section above; the table captures the decision
space.

| Handler | Engine assumption | Candidate trigger sites | Lean | Open product call |
|---|---|---|---|---|
| `onGenerationAccepted` | One signal per acceptance event. | (a) Explicit "Use this" button. (b) Tab/run promotion to the active artifact. (c) Idle timeout after preview opens with no edit. | (a) only. (b) and (c) inflate the confidence ladder by treating non-rejection as approval. | Is there an explicit-accept affordance today, or should we add one before wiring this handler? |
| `onArtifactEditedAndSaved` | One signal per saved diff. | Manual-edit panel save, srcdoc bridge save, finalize-design save. | All three, host coalesces by `(artifactId, session)` window before calling. | Coalesce window. 30s feels conservative; longer windows risk dropping intent shifts within a single edit session. |
| `onExplicitTagApplied` | One signal per tag. | A "tag this" / "I like the spacing here" affordance that does not exist today. | Defer until the affordance exists; do not synthesize tags from chat NLP. | Is the surface area for this UI in scope, or should the handler stay dormant? |
| `onThumbsRated` | One signal per click. | Critique theater rating, comment-mode reaction. | Critique theater first, comment-mode if/when it ships ratings. Host debounces double-click. | Whether thumbs are unary or pairwise (see §4 below). |
| `onGenerationAbandoned` | One signal per abandon. | (a) Explicit discard. (b) Inactivity timeout. (c) New generation started with previous unaccepted. | (a) + (c). (b) is too noisy across multitasking. | Whether (c) requires the previous run to be the active tab, or just any pending one. |
| `onRevertAfterEdit` | One signal per revert. | History panel revert, `git revert` on artifact dir, `Cmd-Z` rapid-undo. | History-panel revert only. The other two are noisy and context-free. | Whether to surface a "revert as feedback" affordance distinct from undo. |

### Cross-cutting

- **Debounce ownership.** Lean: host coalesces and calls the handler once per
  coalesced window. Adapter stays simple.
- **Classifier placement.** Lean: pipeline populates
  `artifact_meta.signals[]` upstream of the adapter call. The adapter remains
  a pass-through. ML classification, if any, belongs in the host, not in the
  memory subsystem.
- **Headless / CLI parity.** Per the dual-track rule, every signal capture
  surface in the UI must have a CLI equivalent that emits the same event
  shape. `od memory ingest` (or similar) is the contract; without it,
  external agents driving Open Design through `od` cannot contribute to the
  user's preference memory and the memory becomes UI-only.

## 2. Retrieval insertion into generation / critique

The engine returns a structured retrieval result and `buildPromptBlock` formats
it as a fixed `[MEMORY CONTEXT]` block. The decisions are: where in prompt
composition that block lands, how it relates to the existing `## Personal
memory` slot the daemon composer already populates, and whether critique sees
the same block.

### Memory-relevant prefix of the live composer order

`apps/daemon/src/prompts/system.ts` composes a longer system prompt than the
prefix below; this section enumerates only the blocks that bear on memory
placement. Blocks 1–13 are the ones the new memory layer has to insert into
or alongside; the tail blocks (summarized at the end of this subsection)
are mode-specific overrides that creative memory neither displaces nor sits
between. Each block below is gated on its input being non-empty.

0. `API_MODE_OVERRIDE` (plain-stream daemon agents only) — pinned at the
   absolute top, before block 1. Out of scope for memory placement.
1. Locale prompt (optional).
2. `DISCOVERY_AND_PHILOSOPHY` + `BASE_SYSTEM_PROMPT` — identity / workflow
   charter.
3. `## Personal memory (auto-extracted from past chats)` — facts sedimented
   from previous conversations and edited in Settings. Treated as
   preferences not hard rules; brand wins on token conflicts; skill wins on
   workflow conflicts.
4. `## Custom instructions (user-level)` — persistent user instructions,
   apply to every project.
5. `## Custom instructions (project-level)` — per-project instructions;
   overrides user-level on conflict.
6. `## How to use this design system` — usage guidance for the active brand.
7. `## Active design system` — the DESIGN.md prose contract.
8. `## Design system import mode` (optional) — how the brand was imported.
9. `## Active design system tokens` — the tokens.css contract; verbatim
   `:root` block to paste into the artifact.
10. `## Reference component manifest` (or `## Reference fixture` fallback) —
    component inventory grounded in the brand.
11. `## Pull-layer files available on demand` — paths the agent can read on
    request.
12. `## Active craft references` — universal brand-agnostic rules opted into
    via `od.craft.requires`.
13. `## Active skill` — the skill body the agent must follow.

#### Tail blocks (mode-specific, after `## Active skill`)

The composer keeps appending after block 13. These blocks are noted here so
implementers do not treat block 13 as the tail of the stack and miss
precedence layers a creative-memory block has to coexist with. None of them
are candidate placements for the memory block itself; each is gated by mode,
agent identity, or feature flag.

- Plugin block and per-stage atom blocks (active plugin + stage-bundled
  atom guidance).
- Metadata block (project metadata, skill template, audio voice options).
- Deck framework directive — pinned for deck projects without a skill seed,
  conditional variant for kind=other projects.
- Media generation contract — for image/video/audio surfaces.
- Codex imagegen override — gated on agent + metadata.
- Critique theater addendum — gated on `cfg.enabled`, suppressed on media.
- Active-design visual-direction override — gated on the brand being bound.
- Connected external MCP directive — gated on connected MCP servers.
- Mid-conversation `<question-form>` clarification guidance — available to
  every agent because the form is UI-parsed assistant-text markup, not a
  native tool call.

Source: the tail assembly in `buildSystemPrompt` in
`apps/daemon/src/prompts/system.ts`. The exact line numbers are unstable; the
gating conditions and order are the durable shape.

The existing precedence rule, declared in the `## Personal memory` block's
own narrative, is: **personal memory is preferences, not hard rules; brand
tokens win on style conflicts; skill workflow wins on workflow conflicts.**
Creative memory has to either inherit that rule or replace it explicitly.

### Decision A: relationship to `## Personal memory`

The existing `## Personal memory` slot is auto-extracted from chat history
and editable in Settings. Creative memory is a different signal source
(typed pipeline events: accept / refine / tag / thumbs / abandon / revert)
with a different invalidation contract (deterministic ranking, decay,
reversal, and the §4 raw-events / content-addressed-derivations contract).

| Option | What it does | Cost | Benefit |
|---|---|---|---|
| A1. Replace | Creative memory subsumes `## Personal memory`. Single block, single pipeline. | Loses the existing block's identity / tone / "things-already-told-you" content, which chat NLP captures and event-based extraction does not. | One layer to reason about. |
| A2. Append | Creative memory body is concatenated into the same `## Personal memory` block. Same precedence rules. | Two extractors writing into one block: no audit trail, no per-source diagnostics, harder to disable one source without the other. | Smallest composer change. |
| A3. Sibling block, shared precedence | New `## Creative memory` block placed adjacent to `## Personal memory`. Each has explicit scope; both follow the same "preferences not rules; brand wins; skill wins" precedence. | One more block in the system prompt; small token cost. | Audit trail preserved (which extractor produced what); §4 contract advantages preserved; either source can be disabled independently. |

Lean: **A3.** The two memories serve different purposes (identity facts vs
stylistic preferences) and have different invalidation models. Mashing them
together loses the §4 raw-events contract advantages (re-derivability,
content-addressed cache, derivation-version provenance). Sibling placement
with shared precedence wording lets the model treat them similarly without
collapsing them.

This is the one explicit decision §2 surfaces that the live composer makes
unavoidable; treating it as implicit is the failure mode this section is
meant to remove.

### Decision B: insertion point

Given A3, the question is where the new `## Creative memory` block sits in
the live order above.

| Option | Where | Effect | Lean |
|---|---|---|---|
| B1. Inside the soft-preferences cluster, after `## Personal memory` | Position 3.5, before custom instructions | Both preference layers are adjacent; custom instructions and the brand contract follow. Coarse-to-fine progression preserved. | **Lean.** Matches the live composer's existing grouping (soft → instructions → brand → craft → skill). |
| B2. After the brand contract, before craft | Position 9.5 / 10 | Brand wins by virtue of preceding the block; memory becomes a brand-aware nudge. | Reasonable if real-world traces show creative memory drifting against the brand. Treat as a fallback. |
| B3. After craft, before the skill | Position 12.5 | Memory becomes a skill-prefix nudge. Weakest influence; easy for opinionated skills to ignore. | Not preferred — buries the signal too late in the stack. |
| B4. As a separate user-role turn | Outside system | Treats memory as a runtime hint, not a system constraint. | Worth A/B testing once integration ships, not the default. |

Lean: **B1**. Placement keeps the two preference layers together; the
existing precedence narrative (brand wins on tokens, skill wins on workflow)
already covers both blocks once they share the precedence wording.

### Decision C: precedence wording

If A3 + B1, the new block needs a header narrative that mirrors `## Personal
memory` so the model treats them with the same hierarchy. Proposed wording:

> ## Creative memory (preferences from generation feedback)
>
> The following stylistic preferences have been derived from this user's
> past acceptances, edits, tags, and rejections in generation runs. Treat
> them as preferences and context, NOT hard rules: when they collide with
> the active design system tokens, the brand wins; when they collide with
> the active skill's workflow, the skill wins. Project-level preferences
> take precedence over global ones whenever both address the same pattern.

This duplicates the `brand wins / skill wins` clause from `## Personal
memory` deliberately — the model treats each block on its own; a single
shared rule split across two blocks would be lost.

### Critique path

Critique runs (existing critique theater + future critique-conformance work)
should also see the memory block, but the contract is different:

- **Generation:** memory is *aspirational* — what the user prefers.
- **Critique:** memory is *evaluative* — what the user rejected.

Lean: same retrieval call (`retrieveForInjection`) but a different
`buildPromptBlock` variant that flips emphasis (Avoid items first, Prefer
items as supporting context). The structured retrieval result is sufficient
for either format; only the formatter changes. Scope: the same A3 sibling
block, with the formatter chosen by the caller (composer for generation,
critique runner for critique).

### Project-override semantics

The engine already returns project-scoped overrides separately. Two surfaces
to confirm:

- **Generation block.** Project line appended after global Prefer/Avoid, as
  the engine already produces. Mirrors how `## Custom instructions
  (project-level)` overrides user-level in the live composer.
- **Critique block.** Project overrides should be presented as harder
  constraints than global preferences ("project says X", not "user prefers
  X"), because critique is project-scoped by definition.

### Failure modes

- **Memory disabled.** Engine short-circuits and returns empty. The composer
  must tolerate an empty block without a stray separator. The existing
  composer already gates `## Personal memory` on non-empty body; the new
  block follows the same pattern.
- **Empty retrieval.** No invariants violated; same handling as disabled.
- **Token budget exceeded.** Engine drops at cut and emits a diagnostic. The
  composer should not see a half-formed block — engine already prevents this.
- **Latency.** `retrieveForInjection` is local-file IO, but worst case (50+
  patterns, multi-stage balancing) should still complete well under 50ms.
  Open question: budget alarm threshold.

## 3. User controls and escape hatches

The engine exposes a `memory_enabled` boolean kill switch in stored state and
no other user surface. Everything else needs to be designed.

### Required surfaces (UI/CLI dual-track)

| Surface | UI | CLI | Why required |
|---|---|---|---|
| Master enable/disable | Settings → Memory toggle | `od memory disable` / `od memory enable` | Trust posture; users must be able to turn it off. |
| Per-project override | Project settings → "this project ignores global memory" | `od memory project-disable <project>` | Sensitive projects (client work, NDAs) should not leak general preference memory. |
| "What's in my memory right now" inspector | Settings → Memory → Inspect | `od memory inspect --json` | Trust requires legibility. The engine emits diagnostics; this surface reads them. |
| Forget a specific pattern | Inspector row → Forget | `od memory forget <type> <pattern>` | GDPR-shaped escape hatch and recovery from ingestion errors. |
| Wipe all memory | Settings → Memory → Reset | `od memory reset --confirm` | Recovery from corruption, account handover, fresh start. |
| Pause without forgetting | Settings → Memory → Pause | `od memory pause [--until <date>]` | Useful when the user knows they're working in an atypical mode (client work, exploration) without wanting to lose the existing model. |

### Surfaces to consider

- **Diagnostic feed in chat.** The engine emits typed diagnostics on every
  retrieval (`hard_cap_applied`, `polarity_ceiling_applied`, etc.). Surfacing
  these as a collapsed "memory adjusted X" line in chat is high-trust but
  also potentially noisy. Lean: off by default, opt-in via Settings.
- **Per-conversation override.** "Don't use memory in this conversation"
  toggle. Defer until usage data shows it's needed.
- **Edit a pattern's strength.** The engine's deterministic ranking would
  break if users edited strengths directly. Lean: do not expose. Forget +
  re-ingest is the supported workflow.

### Storage location and portability

The engine defaults to `<package install dir>/memory/<userId>/preferences.json`
overridable via `MEMORY_STORAGE_ROOT`. For Open Design integration, two
decisions:

- **Default ownership.** Memory is daemon-managed state. The integration must
  receive an explicit storage root derived from the daemon's already-resolved
  `RUNTIME_DATA_DIR`; it must not independently reinterpret `OD_DATA_DIR` or
  choose a cwd-relative fallback. The exact daemon path is intentionally left
  to root [`AGENTS.md`](../../AGENTS.md) → **Daemon data directory contract**.
- **Portability.** `od memory export --to <path>` and `od memory import <path>`
  for moving memory across machines without a cloud sync layer. The engine's
  storage is already plain JSON; this is just CLI plumbing.

### Trust boundary

The engine deliberately has no UI of its own and no API surface beyond
function exports. That is the right boundary for the engine. The integration
layer is where trust controls live, and the dual-track rule means every
control needs both UI and CLI from day one — not staged across PRs.

## 4. Section 11 contract shape

The Background section above states the raw-events / content-addressed-
derivations contract: raw events canonical, derived features as a re-derivable
cache keyed on `hash(raw_event_set, derivation_fn_version)`, pairwise
preferred over unary for attribution. This section maps that contract onto
integration boundaries.

### Ownership: who stores raw events?

| Option | Where raw events live | Implication |
|---|---|---|
| A. Engine package owns raw events | Engine-owned storage alongside `preferences.json` | Engine boundary expands to include event log. Re-derivation runs inside the package. |
| B. Daemon owns raw events | Daemon-managed storage | Engine becomes a pure derivation function over an event slice handed in by the daemon. |
| C. Hybrid — daemon writes, engine reads | Daemon writes through its storage contract; engine reads through a typed accessor | Decouples write path (event capture is a host concern) from derivation (engine concern). |

This spec MUST NOT define daemon data paths. Before documenting or changing
daemon storage, read root [`AGENTS.md`](../../AGENTS.md) → **Daemon data
directory contract**.

Media config storage is outside this spec. Read the same root contract before
documenting any storage exception. Raw events are general daemon runtime data
and must follow the daemon storage contract; an implementation that routes
preference event data into credentials storage would use the wrong contract.

Lean: **C**. Event capture is intrinsically a host concern — the daemon is
where the pipeline events fire from, where debounce/coalesce happens, and where
sensitivity/redaction policy applies (a chat transcript can carry PII; raw
events should respect redaction before they hit disk). Derivation is
intrinsically a memory-package concern. Splitting the responsibilities along
that axis matches the existing daemon ↔ package boundary in the repo.

### Where does the derivation function version live?

The content-addressed key is `hash(raw_event_set, derivation_fn_version)`. The
version tag has to live somewhere both the writer and reader agree on.

Lean: as an exported constant in `@open-design/creative-memory-system`,
imported by the daemon when computing the cache key. Bumping the version is a
package release. This matches how the package already exports
`schema_version: "1.0"` in `preferences.json`.

### Read-time vs background derivation

Two modes for when re-derivation runs:

| Mode | Trigger | Latency | Cost |
|---|---|---|---|
| Lazy on read | First call to `retrieveForInjection` after raw events change | Adds derivation cost to first call | Small if events are batched, can spike if a session's events are large |
| Background worker | Daemon job after each accepted batch of events | Read is always fast | Constant background cost, even when the user is idle |

Lean: **lazy on read** for MVP, with the structured option to add a background
worker behind a feature flag later. Lazy-on-read with a write-back cache is
the documented path; background re-derivation is a follow-up once derivations
grow heavy enough to dominate p99 latency.

### Pairwise vs unary signal capture

The engine accepts unary signals today (accept / reject / edit / tag). The
contract favors pairwise where the UX can support it.

Pairwise candidate surfaces:

- **Critique theater.** Naturally pairwise — the user is comparing variants.
  Lowest-friction place to introduce a `comparison` event type.
- **Tab promotion.** When a user switches the active artifact between two
  open generations, the implicit comparison signal is "I prefer this one
  right now." High noise, but also high volume.
- **Live-artifact refresh.** When a refresh produces a new variant of a
  saved artifact, accepting the new one over the old is pairwise.

Lean: ship pairwise for critique theater first, leave the other two as
follow-ups. Adding pairwise means a new event shape (`{ chose: artifactA, over: artifactB, dimensions?: [...] }`)
and a new handler (`onPairwiseComparison`); the engine's existing handlers
stay valid for unary cases. The weighting policy between pairwise and unary
aggregates lives in `derivation_fn_version` and is auditable per derived
record, per the §11 contract.

### Cache eviction

Content-addressed cache → eviction is by capacity, not by age. Decision:

- **Cap.** Lean: 1000 derived feature entries per user, evicted LRU. Worst
  case is a single `preferences.json` storing 1000 records, which is well
  under any practical token or memory limit.
- **Persistence.** Cache survives daemon restarts (it is a file on disk).
  Engine handles cold start by computing on first read.

### Migration from the current write-time-derivation engine

The current engine writes derived features directly. Migration path:

1. Land raw-events writer in the daemon (this PR's contract gates it).
2. Backfill: each existing `preferences.json` record becomes a synthetic
   "v0" raw event. Ugly but bounded.
3. Switch derivation to read from raw events, content-addressed cache fills
   on demand.
4. Old write-time derivation paths in `ingestSignal` / `_applyReversal` /
   `runDecay` deprecate behind a `derivation_mode: "raw" | "write-time"`
   flag for one release, then remove.

Lean: this migration belongs to whichever implementation lands as the
foundation, not to PR #1746. The package and daemon contracts in this doc
should be agnostic to which side does the work.

## 5. Decision summary

For maintainer review, the explicit calls this doc surfaces:

1. **Acceptance trigger** for `onGenerationAccepted`. (§1)
2. **Edit-coalesce window.** (§1)
3. **Whether explicit-tag UI is in scope.** (§1)
4. **Relationship to `## Personal memory`** — replace, append, or sibling block. (§2; lean A3 sibling block)
5. **Memory block insertion point** in the live composer order. (§2; lean B1, after `## Personal memory`)
6. **Precedence wording** for the new block. (§2; lean: mirror the existing `brand wins / skill wins` clause)
7. **Critique-side memory format.** (§2)
8. **Default storage path** under `OD_DATA_DIR`. (§3; lean yes)
9. **Diagnostic feed surface** in chat. (§3; lean off by default)
10. **Raw-events ownership** between daemon and engine package. (§4; lean C)
11. **Derivation-version exporter.** (§4)
12. **Pairwise rollout sequencing.** (§4)
13. **Cache eviction cap.** (§4; lean 1000/user)

None of these require a decision today. They are surfaced so that when the
memory roadmap moves, the conversation has a concrete option space rather
than starting from a blank page.

## What this doc does not commit to

- A specific pairwise event shape. The lean is `{ chose, over, dimensions? }`,
  but UX details (does the user pick one, or pick + dimension annotation?)
  belong to the surface that actually ships pairwise first (critique theater).
- A specific CLI subcommand layout for `od memory`. The dual-track rule says
  every UI control needs a CLI peer; the names in §3 are illustrative, the
  actual subcommand grammar follows whatever pattern the existing
  `od automation`, `od plugin`, `od ui` family establishes.
- A rollout schedule. The decisions above are independent and can land in
  any order behind a `memory_enabled: false` default.

## Open follow-ups

- Confirm that `OD_DATA_DIR` precedence applies to the memory storage root
  (it should, per AGENTS.md FAQ, but the integration code has not been
  written yet).
- Decide whether memory state is part of `od project export` /
  per-project portability flows, or strictly user-scoped.
- Sketch the `od memory inspect --json` output shape — likely just a passthrough
  of the engine's diagnostic events plus the current preference list.

These are tractable doc edits once the §5 decisions land; flagged here so
they are not forgotten when implementation work resumes.
