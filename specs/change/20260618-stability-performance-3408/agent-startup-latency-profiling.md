# Agent startup latency: profiling and session-reuse

Design doc (human/reviewer-facing). Implementation runbooks per slice are written separately at build time.

Status: proposed · Parent: #3408 · Related: #3380, #3535 · Spec format: `spec-battle`

## Why · Why this matters

- **Use case**: After taking over the #3408 reliability/performance thread, the most user-visible latency in the product is "after sending a message, it takes ~10s before the first word appears." This is a real pain point encountered directly and reported by users, not speculative pre-work.
- **Pain**: This 10s repeats on **every message**, not as a one-time warmup. It directly hurts perceived usability for AMR / `claude_code`, and it is one of the highest-ROI items on the #3408 track while being orthogonal to failure rate.

## Sources · Fact sources (required, reviewers can verify against these)

- **Repo**: `nexu-io/open-design`. This spec is on branch `spec/agent-startup-latency` (PR #4504); the **code to verify is in `origin/main`**.
- **Checkout**:
  ```
  gh repo clone nexu-io/open-design && cd open-design && git checkout main
  # To view this spec: gh pr checkout 4504
  ```
- **Key code locations** (reviewers can jump directly):
  - `apps/daemon/src/run-analytics-observability.ts:284-346` — `summarizeRunTimingAnalytics`, `spawn_to_first_token_ms` / `time_to_first_token_ms` / `process_spawn_duration_ms` are computed here from timestamps in `run.analyticsTelemetry`. `:50-60` is the `RunTimingAnalytics` field list.
  - `apps/daemon/src/server.ts:8853` (`processSpawnStartedAt`) / `:8868` (`processSpawnedAt`) / `:9228-9232` (`noteFirstTokenAt` → `firstTokenAt`). **The interval between `processSpawnedAt` → `firstTokenAt` is the 8-10s `spawn_to_first_token` segment**; Phase 1 adds two new anchors inside it: `cli_ready` / `session_init`.
  - `apps/daemon/src/server.ts:10846` (`summarizeRunTimingAnalytics(...)` call) / `:10945` (`...timingAnalytics` spread into `run_finished`) — new telemetry fields ship here.
  - `apps/daemon/src/runtimes/defs/claude.ts` + `apps/daemon/src/claude-stream.ts` — `claude_code` session handling; the #3380 fix (session resume) lands here.
  - `packages/contracts/src/analytics/events.ts` — add three new fields near `TrackingRunTiming*`.
  - **prompt-cache prefix stability (Root cause below, verified on latest main)**:
    - `apps/daemon/src/server.ts:7670` — `composed` assembly order: `# Instructions {instructionPrompt + cwdHint}` first, `# User request` (with flattened transcript) later.
    - The `instructionPrompt` prefix includes **volatile blocks**: `connectedExternalMcp` (server.ts:7464/7483), `memoryBody` (:6762/7011), `runContextPrompt` (:7343), current file list.
    - `apps/web/src/providers/daemon.ts:222-235` — `buildDaemonTranscript` renders each message only as `## role\n{m.content}`, **dropping `m.events`** (thinking/tool_use/tool_result); conditionally inserts `buildPriorRunContextWarning` at the beginning (:87). `MAX_TRANSCRIPT_MESSAGE_CHARS=12000` (:56).
    - vela-side `loadSession:false` / single ACP session is in the **vela repo** (not verifiable in this repo; see Open questions).
- **Related material**: #3408 (umbrella), #3380 (Claude creates a new session for every message instead of resuming), PR #3535 (reuse ACP sessions per conversation, by another author), PR #4502 (classification sibling on the same thread).
- **Data source**: PostHog project **OpenDesign = 420348**, timing fields on the `run_finished` event. The two tables in this spec come from the following queries (rolling 7d, `result='success'`):
  - segment p50/p90: `quantile(...)(toFloat(properties.<seg>_ms))` group by `agent_provider_id`.
  - turn ordinal: `row_number() OVER (PARTITION BY conversation_id ORDER BY timestamp)`, bucketed by turn=1 vs 2+ and comparing `time_to_first_token_ms`.
- **Access prerequisites**: Rerunning queries requires a PostHog personal API key (`phx_…`); inspecting real errors on individual traces can optionally use Langfuse `us.cloud.langfuse.com` (trace_id == run.id).

## What the telemetry already shows

Startup timing breakdown (success runs, 7d, p50):

| segment | AMR | claude_code |
|---|---|---|
| queue | 2 ms | 2 ms |
| pre_spawn(prompt build + env) | ~400 ms | ~465 ms |
| process_spawn | 1 ms | 2 ms |
| **spawn → first token** | **10,378 ms** | **8,150 ms** |
| time_to_first_token(total) | 11,120 ms(p90 24.8 s) | 9,063 ms(p90 34.3 s) |

The full ~10s sits in `spawn_to_first_token`; queue+spawn+prompt-build total ~0.5s and are not worth optimizing.

**Every message repays a full cold start (corroborates #3380)** — TTFT by turn within a conversation (success, 7d, p50):

| provider | turn 1 | turn 2+ |
|---|---|---|
| **claude_code** | 8,226 ms | **9,308 ms (slower)** |
| amr | 12,169 ms | 10,859 ms (faster by ~11%) |

If sessions were reused, follow-up turns should be meaningfully faster. `claude_code` has **zero** reuse benefit → each message cold-starts a new session, exactly #3380. AMR shows partial reuse, but the baseline is still ~10s.

## Root cause (verified on latest origin/main): prompt-cache prefix instability

> This attribution originally came from another AI's investigation; this spec has verified each claim against real latest `origin/main` code (anchors in Sources).

Why are cache hit rate low and follow-up turns not faster? Three structural problems stack together:

1. **Volatile system blocks are before the stable transcript** (`server.ts:7670`). The prompt sent to the model = `[# Instructions: volatile prefix with MCP list / personal memory / current file list / run context]` + `[# User request: append-only transcript]`. Prompt cache matches byte prefixes — if any volatile block changes (a generated file, a connected MCP, a memory edit), the prefix drifts → the later transcript, which would otherwise be byte-stable, is invalidated too. **Stable content must come first and volatile content later; here it is reversed.**
2. **New session every turn + history flattened into plain text** (`daemon.ts:222`). `buildDaemonTranscript` flattens multi-turn history into a single `## role\n{visible text}` markdown blob, **dropping the native thinking/tool_use/tool_result structure**, and feeds it to a fresh session every turn. The native structured cache built by the agent in the previous turn (signed thinking, structured tool round trips) is lost with the process across turns, so the next turn repays input tokens from zero.
3. **TTL fallback cannot save this**: Anthropic default cache TTL is 5 minutes, and human thinking/typing time between turns often exceeds it.

The only thing that might survive is the flattened transcript text (append-only), but a hit requires: ① the daemon freezes the volatile system blocks ahead of it (problem 1) so the prefix is byte-stable across turns, and ② the request still falls within TTL (problem 3). The gateway side is **already handled** — the AMR spec ground-checked that Vela Link injects `cache_control` itself (`bifrostengine/prompt_cache.go`), so there is **no ACP passthrough condition to satisfy**; the only gateway-side gap is TTL/provider coverage, which folds into ②. Today ① is not done and ② defaults to 5min, so the transcript prefix does not hit cross-turn.

### Experiment source (honest labels)
- ✅ **Real production client**: cache hit/miss TTFT and cross-turn hit rate above come from PostHog `run_finished` (real Open Design client telemetry).
- ✅ **Latest origin/main code verification**: all three Root cause points were checked against real code.
- ❌ **Invalidated**: an early local bare `claude -p` setup/model breakdown **did not go through the daemon** and does not represent the real path; discarded. Real subsegment breakdown must be measured inside the daemon by Phase 1 instrumentation.

## Goals / Non-goals

- **Goals**: (1) Split `spawn_to_first_token` into `cli_ready_ms` / `session_init_ms` / `model_first_token_ms` and correlate with existing `cache_hit_ratio`, locating the real owner of the 10s; (2) improve prompt-cache hit rate (root cause = volatile prefix drift + new session every turn, see Root cause) — first do cheap prefix stabilization (3a), then ACP native session reuse (3b), reducing follow-up TTFT. Primary metrics = cache-miss rate + follow-up TTFT p50.
- **Non-goals**: provider-side first-token latency (including AMR→vela gateway extra hop); token/context trimming (#3547, that path needs #3545 gate); prompt-build / spawn cost (already ~0.5s).

## Proposed design

Three phases, **observe first, then use data to decide what to fix**:

1. **Phase 1 — Add subsegment instrumentation to `spawn_to_first_token` (pure observability, ship first)**: Add two timestamps between `processSpawnedAt`→`firstTokenAt`: `cliReadyAt` and `sessionInitDoneAt`, and emit `cli_ready_ms` / `session_init_ms` / `model_first_token_ms` on `run_finished` (sum of the three ≈ `spawn_to_first_token_ms`; also emit `remainder` for audit). **`cli_ready_ms` contract — one auditable marker per runtime family (no per-owner ambiguity)**: `claude-stream-json` = first JSONL line parsed from stdout; `acp-json-rpc` (AMR/devin/hermes) = first well-formed ACP JSON-RPC message received; `json-event-stream` (codex/gemini/cursor) = first decoded stream event; `plain` = first non-empty stdout chunk. `sessionInitDoneAt` = the resume/`session/new` handshake ack for ACP, or the first model-bound request for stream agents. These markers are declared in one place (the runtime def) so two owners cannot record different events. The new fields ride the **existing shared analytics contract + Langfuse mirror** (same path as the other `run_finished` reliability fields — not a divergent surface). No behavior change.
2. **Phase 2 — Confirm experimentally**: Rerun turn-1 vs turn-2+ in PostHog with the new subsegments (expected: `session_init_ms` stays flat across turns = cold start repaid, `model_first_token_ms` grows with context); local A/B (same conversation fresh vs resumed, data injected only through production HTTP APIs). **Reproducible go/no-go gate**: population = successful `claude_code` runs, last 7d, turn-2+ only; statistic = **both p50 and p90** of `session_init_ms / spawn_to_first_token_ms`; threshold = enter Phase 3 if **p50 ≥ 30%** (or p90 ≥ 40%); local A/B = ≥ 30 paired fresh-vs-resumed runs. **Tie-break**: if the PostHog cut and the local A/B disagree, the PostHog production cut decides (A/B only sizes the effect). If `cli_ready_ms` dominates instead, choose a warmed process pool; otherwise classify as provider-side and stop with a recorded conclusion.
3. **Phase 3a — Stabilize cacheable prefix (cheap, independent, requires QA/state-continuity gate)**: Move or freeze volatile system blocks (file list / MCP list / personal memory / run context) from **before** the stable transcript to after it, so the append-only transcript becomes a prefix that can really hit. **No ACP `cache_control` passthrough work is needed here** — the sibling AMR spec (`amr-latency-session-reuse-prompt-cache.md` Feasibility review §1) already ground-checked that the Vela Link gateway injects cache directives itself (`services/link/internal/bifrostengine/prompt_cache.go`); the remaining gateway-side gap is TTL/provider coverage (Step 1 in that spec), not transport passthrough. This phase's only job is the host-side prefix ordering so whatever the gateway caches actually byte-matches across turns. Prefix order is model input, so this gives immediate benefit (lower cache-miss rate) only after quality/state-continuity acceptance.
4. **Phase 3b — ACP-native multi-turn session reuse (large, depends on vela)**: Change daemon to "one long-lived ACP connection per conversation, `session/prompt` per turn"; the agent maintains native multi-turn arrays + working memory + cache, and the host no longer resends flattened history every turn. Prerequisite: vela supports `session/load` + opencode session persistence first (current `loadSession:false` cannot handle it), requiring cross-repo coordination. Align with #3380 / #3535. Acceptance = follow-up cache hit rate rises, `session_init_ms` approaches zero, TTFT p50 drops, and edit state is not lost.

### Phase 3a guardrail: prefix-stability invariant (structured enforcement that self-protects as features evolve)

3a moving volatile blocks away is **one-time**; without a guardrail, the next feature may put volatile content back into the prefix and silently break cache again. Reuse the existing prompt-stack telemetry as a structural guardrail — `apps/daemon/src/prompt-telemetry.ts` already emits each section's `fingerprint` plus global `stackFingerprint` by `kind`, and has kind-based collections such as `SECTION_PRIORITY` (`:105`) for ordering and `REDACTED_CONTENT_KINDS` (`:91`):

- **Classification**: Mark every `PromptTelemetrySectionKind` as `STABLE` (cacheable, must be in the prefix) or `VOLATILE` (changes every turn, must come after the stable prefix). Current volatile items: current file list, `connectedExternalMcp`, `memoryBody`, `runContextPrompt`, `buildPriorRunContextWarning`.
- **Invariant (falsifiable)**: Concatenate all STABLE sections (system core + tools + append-only transcript) in order into the "cacheable prefix"; its fingerprint **must be byte-for-byte unchanged when only VOLATILE inputs change**. Red test: fixed history, change file list / MCP set / memory three times, assert cacheable prefix fingerprint is unchanged and all VOLATILE sections have `ordinal` greater than the prefix boundary.
- **Self-protection as features evolve**: STABLE/VOLATILE classification is a map (analogous to existing `SECTION_PRIORITY`) and is the **single declaration point** when future prompt sections are added; the guardrail additionally asserts "every `kind` must have a classification" — if a new feature adds an unclassified section kind, tests go **red**, forcing the author to explicitly declare whether it belongs in the prefix or tail. This makes "prefix stability" structural, not a one-off fix, and it continues to hold as the system evolves.
- **Follow-up (not delivered by this spec PR)**: when Phase 3a is implemented, that implementation PR must also add the prompt-assembly / cacheable-prefix invariant to `specs/current/architecture-boundaries.md` so the rule lives in the canonical current-doc set. This spec only *plans* the guardrail; it does **not** yet update the boundaries doc, so do not treat repo-wide enforcement as already in place.

## Alternatives considered

- **Jump straight to session reuse without instrumentation**: rejected — turn-ordinal data is strong, but "cold start repaid" and "context growth" are confounded; without subsegments we may fix the wrong thing (spending effort on session reuse when the main contributor is actually model first token). Phase 1 is the cheap deconfounding step.
- **Persistent / warmed agent process pool**: more aggressive and maybe faster, but cross-agent complexity plus process lifecycle/isolation risks are higher; session resume is smaller and aligned with #3380/#3535. If Phase 1/2 shows `cli_ready_ms` (cold start itself) dominates, warmed pooling becomes the right alternative instead of session reuse.
- **Provider-side first token**: outside our control (especially with AMR's extra hop), explicitly excluded.

## Risks & mitigations

- **observability**: the "ready signal" for `cli_ready` differs per runtime (ACP first message / plain stdout / session ack); choosing the wrong anchor distorts subsegments → Phase 1 must define defensible ready markers per runtime type and verify the three subsegments sum to approximately the total segment.
- **correctness (Phase 3)**: #3380 records that "new session every message" also loses edit state; session resume must stay correct (do not reintroduce lost state for speed) → acceptance must include state-continuity tests in addition to TTFT.
- **compatibility**: new timing fields are additive only (optional fields in contracts); old readers are unaffected; no migration or rollback risk.
- **scope creep**: Phase 1 must have zero behavior change; review should watch for "timestamps only, no control-flow changes".

## Validation · Acceptance (behavior-level)

- Phase 1: one daemon test asserts `run_finished` includes the three new subsegments and `cli_ready_ms + session_init_ms + model_first_token_ms + remainder == spawn_to_first_token_ms` (falsifiable).
- Phase 3: `session_init_ms` drops significantly on follow-up turns in the same conversation (before/after PostHog slice + local A/B).
- **QA-gate boundary**: Phase 1 telemetry does not need #3545 gate because it is observability-only. Phase 3a prefix reordering and Phase 3b session reuse do require QA/state-continuity gates because they change what is fed to the model; order is part of the input. before/after evidence is `spawn_to_first_token_ms` and subsegment p50/p90 + turn-ordinal slices, plus state-continuity acceptance for behavior-changing phases.

## Implementation slices

1. Add 3 optional timing fields to contracts + Phase 1 instrumentation + sum test (independently shippable, pure observability).
2. Phase 2 experiment script + conclusion (no code change / analysis only).
3. Phase 3 session resume (only if 2 passes) + state continuity + TTFT acceptance.

## Reproduction · Reproduce experimental data (where the numbers came from)

All table numbers are reproducible. PostHog project **OpenDesign = 420348**, personal API key required (`phx_…`), `POST https://us.posthog.com/api/projects/420348/query/`, body `{"query":{"kind":"HogQLQuery","query":"<SQL>"}}`. HogQL pitfalls: numeric fields use `toFloat(properties.x)` (not `toFloat64OrNull`); null filtering uses `isNull(...)` (`empty()` fails on JSON null); P90 uses `quantile(0.9)(...)`; cross-turn uses `row_number() OVER (PARTITION BY properties.conversation_id ORDER BY timestamp)`. Window is always `result='success' AND timestamp >= now()-INTERVAL 7 DAY`.

- **Startup timing segment table**: `SELECT properties.agent_provider_id AS prov, round(quantile(0.5)(toFloat(properties.queue_duration_ms))) AS queue, ...(pre_spawn_duration_ms / process_spawn_duration_ms / spawn_to_first_token_ms / time_to_first_token_ms)..., round(quantile(0.9)(toFloat(properties.time_to_first_token_ms))) AS ttft_p90 FROM events WHERE event='run_finished' AND properties.result='success' AND properties.agent_provider_id IN ('amr','claude_code') AND timestamp >= now()-INTERVAL 7 DAY GROUP BY prov`
- **Cross-turn TTFT per provider (reproduces the turn-1 vs turn-2+ table above)** — note the `prov` group-by, so each provider gets its own row (without it the result collapses to one combined bucket and the per-provider numbers cannot be verified): `WITH o AS (SELECT properties.agent_provider_id AS prov, toFloat(properties.time_to_first_token_ms) AS ttft, row_number() OVER (PARTITION BY properties.conversation_id ORDER BY timestamp) AS turn FROM events WHERE event='run_finished' AND properties.result='success' AND properties.agent_provider_id IN ('claude_code','amr') AND isNotNull(properties.conversation_id) AND toFloat(properties.time_to_first_token_ms)>0 AND timestamp >= now()-INTERVAL 7 DAY) SELECT prov, if(turn=1,'turn_1','turn_2plus') AS bucket, round(quantile(0.5)(ttft)) AS ttft_p50 FROM o GROUP BY prov, bucket ORDER BY prov, bucket`
- **Cache hit vs TTFT**: same `run_finished` filter + `if(toFloat(properties.cache_read_input_tokens)>0,'HIT','MISS') AS cache, round(quantile(0.5)(...)), round(quantile(0.9)(...)) GROUP BY cache`
- **Cache hit rate by turn**: same cross-turn window, `countIf(cr>0)/count()` (`cr = toFloat(properties.cache_read_input_tokens)`)
- **Langfuse single-error digging**: host `https://us.cloud.langfuse.com` (US only), Basic auth `base64(pk-lf-…:sk-lf-…)`, `GET /api/public/traces/{run_id}` (**trace_id == run.id**), read `statusMessage` from `observations[].level=='ERROR'`.
- ⚠️ **Do not extrapolate from bare `claude -p`**: it does not go through the daemon (no system prompt assembly / no flattened transcript / no daemon session semantics), so it does not represent the real path. Real subsegments must be measured inside the daemon by Phase 1 instrumentation, or with the PostHog production telemetry above. For local end-to-end reproduction: start the real daemon with `pnpm tools-dev` (Node 24), run two turns against the same `conversationId` through `/api/chat`, and compare `cache_read_input_tokens` / `time_to_first_token_ms` on the two `run_finished` events.

## Open questions

- The per-runtime-family `cli_ready_ms` marker is now fixed by contract in Phase 1 (Proposed design §1), so the "what is the signal" blocker is closed. Remaining narrow question: does any adapter family need a `null` + `timing_unavailable_reason` fallback because its declared marker cannot be observed in practice (e.g. a `plain` agent that emits no stdout before the first model token)? If so, emit the field as nullable rather than guessing a wrong anchor.
- Can `claude_code` resume preserve enough state to remain correct (avoiding #3380's lost edit state)? Phase 3 must be both faster and correct.
- Should this merge with PR #3535 (ACP session reuse) to avoid two separate implementations of session reuse?
