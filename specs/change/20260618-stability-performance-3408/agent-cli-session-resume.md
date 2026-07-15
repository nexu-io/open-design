# Agent CLI session reuse (codex / opencode / AMR)

Design doc (human/reviewer-facing). Implementation runbooks per slice are written separately at build time.

Shared contract note: the agent-agnostic session-map contract now lives in
`specs/change/20260707-agent-session-map-contract/spec.md`.

Status: proposed · Parent: #3408 · Upstream background: amr-latency-session-reuse-prompt-cache.md

## Why

- **Use case**: follow-up turns are slow and burn balance because the daemon re-pays the whole conversation as cache-cold input every turn. For ~22 of ~24 agents the daemon flattens history into a fresh user message each turn (`buildDaemonTranscript`) and starts the agent from scratch, so the agent rebuilds its own structure and the upstream prefix cache from the previous turn no longer matches.
- **Pain**: only adapters carrying `resumesSessionViaCli` (today claude / codebuddy, plus pi via `pi-rpc`) skip the resend and let the CLI hold its own session. The other recompose agents whose CLI/runtime **natively supports session continuation** are leaving that on the table — we could resume them and hit the still-warm cache, with no upstream/provider change.
- **Scope of this doc**: generalize native session resume to the agents we control end to end via their own CLI/runtime — **codex** (~23% of users), **opencode direct** (~16%), and coordinate the **AMR runtime** resume (its own session-reuse work lives in the AMR runtime repo). This targets the in-window cache miss we incur today even for back-to-back turns; upstream cache TTL is a separate lever.

## Sources · Verified facts (measured 2026-06-22, real CLIs)

- **Recompose default**: `apps/web/src/providers/daemon.ts` `buildDaemonTranscript` is called unconditionally; `server.ts` gates the skip on `resumesSessionViaCli`. Resume-capable today: claude, codebuddy, pi only.
- **codex** (`codex exec`, `json-event-stream`): the first stream event is `{"type":"thread.started","thread_id":"<uuid>"}` — the resume handle. `codex exec resume <thread_id> <prompt>` continues it; sessions persist under `~/.codex/sessions/<date>/rollout-…-<thread_id>.jsonl` and a fresh process resumes them. **Measured (consecutive turns):** resume per-call cache **96%** vs flattened-resend **39%** (uncached **499** vs **7750**) — ~15× fewer recomputed tokens. ⚠️ **Accounting gotcha**: codex's `turn.completed.usage` is the *cumulative session* total, **not** the per-turn call — read the per-call number (the rollout `token_count.last_token_usage`), or the win looks like a loss.
- **opencode** (`opencode run`): `-s <session-id>` / `-c` continues a persisted session; `--format json` reports per-step `tokens.cache.{read,write}`. **Measured:** resume turn-2 = `input 162 + cache_read 8192` (≈98% reused); fresh turn-1 = `cache_read 0`.
- **AMR runtime**: supports session continuation; cross-process session reload is verified at the runtime layer (tracked in the AMR runtime repo). The daemon side coordinates it through the same resume infra as the CLI agents — no AMR-specific parallel path.
- **Resume failure is detectable per agent**: codex `Error: thread/resume: … no rollout found for thread id <id>`; opencode HTTP `404 NotFoundError "Session not found"`; AMR runtime emits a resume-fallback signal.

## Goals / Non-goals

- **Goals**: make follow-up turns resume the agent's own session (no flattened-history resend) so the first upstream call of the turn reuses the warm prefix cache; keep a hard fallback so a missing session never breaks a conversation.
- **Non-goals**: extending upstream cache TTL (separate lever; deepseek auto-cache TTL is not settable, so multi-minute human gaps still go cold); cross-user cache; fixing `buildDaemonTranscript` fidelity (we cannot reconstruct an agent's native cached structure — signed thinking, structured tool rounds — from our flattened text, which is exactly why the fix is "let the agent keep its own session", not "improve our reassembly").

## Proposed design (daemon)

### Capture-style vs specify-style session ids

The existing infra is "specify-style": the daemon mints `newSessionId` and passes it via claude's `--session-id`. codex/opencode/AMR are **capture-style**: the agent generates its own id and we must capture it from the stream and store *that*. Add capture support so a resume handle reported by the agent is persisted to `agent_sessions` and replayed next turn.

### Per-slice

1. **codex** — set `resumesSessionViaCli`; buildArgs emits `exec resume <id>` when a stored handle exists, else `exec` (and we capture `thread_id` from `thread.started`). Note: `exec resume` does **not** accept `--sandbox`; pass sandbox/config consistently (via `-c` or the bypass flag) so the per-turn context block byte-matches the create turn and does not break the prefix. `skipTranscript` on resume turns.
2. **opencode direct** — same shape: capture the session id, `run -s <id>` on resume, `skipTranscript`. (The AMR-via-runtime opencode path is separate and coordinated through the AMR adapter, not this CLI path.)
3. **AMR adapter** — capture the runtime's durable session handle from session setup, store it, and request resume next turn through the existing resume coordination; `skipTranscript` when the handle is valid.

### Session-missing fallback (robustness — the key safety net)

- Two layers, mirroring the user-facing requirement:
  - **Eliminate our-side reuse-breakers** (things we control): the agent's session store directory must be **stable per conversation across daemon spawns** — do not move `CODEX_HOME` / the runtime data dir between turns (sandbox toggle, namespace, packaged-vs-dev), and do not delete it per turn. A changed directory makes the session unfindable.
  - **DB transcript fallback** (things we cannot control — user deletion, corruption, different machine): detect the agent's session-not-found signal → clear the stale handle in `agent_sessions` → start a fresh session and **re-seed the full flattened transcript** (`skipTranscript=false`). We already store the full transcript (`messages.content` + `events_json`), so the worst case is **one cold turn with full context**, never a broken/amnesiac conversation. This is byte-for-byte the existing claude `isClaudeResumeFailure` fallback, generalized.
- Net effect: **only-upside** — resume hits the cache when the session is present and warm; a missing session degrades exactly to today's behavior for that one turn.

### Resume identity & invalidation tuple

The stored `agent_sessions` row is keyed by `(conversation_id, agent_id)` and, before this work, only carried `session_id` + `stable_prompt_hash`. That is **not** sufficient to decide a resume is safe: it does not encode the model, the cwd, or how far the conversation had advanced when the session last ran, so a model/cwd switch — or another agent (or an edit) adding turns the upstream session never saw — would keep resuming a stale session and silently drop visible state. The skip-transcript path must therefore be gated on an explicit **resume identity**, not on "a row exists".

Stored with the session row (in addition to `session_id`, `stable_prompt_hash`):

- `model` — the model the upstream session was created under.
- `cwd` — the resolved working directory (workspace identity).
- `last_message_id` — the assistant message the session produced on its last turn (the conversation cursor).

At resolve time the session is resumable **iff all hold** (else `isResuming = false`, with an `invalidationReason`, and the daemon reseeds the full transcript):

| Guard | Resumable when | `invalidationReason` on mismatch |
| --- | --- | --- |
| model | stored `model` == current run model | `model_changed` |
| cwd | stored `cwd` == current run cwd | `cwd_changed` |
| conversation cursor | the latest completed assistant message (excluding **this** run's in-flight placeholder) == stored `last_message_id` | `conversation_advanced` |
| cursor present | stored `last_message_id` is non-null | `missing_cursor` (legacy row → reseed once) |

The cursor advances on every successful create **and** resume turn (so back-to-back same-agent turns keep resuming). `tool-contract` / `prompt-hash` / `memory` changes are already absorbed by `stable_prompt_hash` (a changed hash re-sends the stable block on the resumed session); only changes that make the upstream session *wrong to continue* force a fresh session. Cancellation must not leave a dangling session; resume must not reintroduce the #3380 lost-edit-state failure (the resumed session is authoritative; we do not also replay flattened history when the handle is valid).

> Status: **implemented for codex/opencode in the implementation PR**. Acceptance tests: a `resolveAgentResumeContext` invalidation matrix (in-sync resume, current-placeholder-excluded follow-up, `model_changed`, `cwd_changed`, `conversation_advanced`, `missing_cursor`) plus an end-to-end `codex -> other agent -> codex` spec asserting the second codex turn starts a fresh session (no resume) instead of dropping the intervening turn. The AMR runtime applies the same caller-side contract.
>
> Related: issue #744 ("Alternative path: use native CLI resume/continue plus sessionMap instead of full transcript reinjection") describes the same approach this spec formalizes.

### Complementary: cacheable-prefix stabilization (for the non-resumable agents)

- Agents without native resume stay on flattened-resend, but the **static `[system+tools]` prefix** should still cache: move volatile blocks (run context / memory / MCP) after the stable prefix, and add a prompt-stack fingerprint invariant (the cacheable prefix is byte-identical when only volatile inputs change; an unclassified new section fails tests). Helps explicit-cache upstreams regardless of resume.

## Validation · Acceptance

- Per-agent red spec from real production text/usage; **measure the first model call of turn-2+**, not the within-turn / cumulative-session aggregate.
- Falsifiable: two consecutive turns in one `conversationId` — assert turn-2 first-call uncached input is far below turn-1 (history not repaid); and resume survives a process restart between turns within the cache window.
- Fallback: delete/relocate the agent's session store between turns — assert the conversation continues correctly via re-seed and the resume-fallback path is taken.
- End-to-end through the existing `run-failure-telemetry-smoke` real-daemon harness pattern where practical.

## Risks & mitigations

- **Session store instability (our bug)**: a non-deterministic per-turn data dir silently breaks reuse → pin the per-conversation dir; cover with a test asserting two turns share a store and resume.
- **Accounting misread**: per-call vs cumulative usage (the codex gotcha) → measurement helpers must read per-call.
- **Lost edit state (#3380)**: resume must stay correct → state-continuity acceptance in addition to cache metrics; reuse the daemon's resume keying.
- **No upstream/provider change required** for codex/opencode; the AMR runtime change is tracked in its own repo.
