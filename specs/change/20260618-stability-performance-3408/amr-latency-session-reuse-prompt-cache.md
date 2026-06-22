# AMR latency: session reuse + prompt-cache efficiency

Design doc (human/reviewer-facing). Implementation runbooks per slice are written separately at build time.

Status: proposed · Parent: #3408 · Sibling: agent-startup-latency-profiling.md (#4504) · Spec format: spec-battle

## Why · Why this matters

- **Use case**: While taking over the performance thread for #3408, strict profiling found the real major contributor to AMR first token latency of ~11s per turn, and both the root cause and implementation target are now clear.
- **Pain**: ① Latency — AMR follow-up TTFT p50 ~11s, so users wait ~11s after every message; ② Cost/stability — every turn's **first upstream call re-pays most of the conversation as uncached input** (measured below: turn-2+ first call hits only ~21% cache, ~24.5k uncached), directly burning AMR Cloud balance, and `insufficient_balance` is AMR's largest failure bucket (7,053/week, #4455 is addressing it). **This performance optimization is also a stability optimization**.
  - **Correction (this session, production-measured)**: an earlier draft claimed "AMR repays 100-153k *uncached* tokens every turn." That was wrong — the ~153k is the *context size*, most of which is cached. The real per-turn-first-call uncached is **~24.5k** (see "Production measurement" below). The headline problem is not the raw resend volume; it is that the **cross-turn first call is cache-cold (~21% hit) and sits on the TTFT path**.

## Sources · Verified facts (checked item by item in this session)

- **Repo / checkout**: `nexu-io/open-design` (main) + vela repo `git@github.com:nexu-io/vela.git`.
  - `gh repo clone nexu-io/open-design && git checkout main`.
  - ⚠️ **External-evidence caveat (refresh before implementation)**: the vela line citations below were read against a **local checkout at HEAD `fe8266e` (2026-05-21)**, which has since drifted from `nexu-io/vela@main` (`c35dae2a`, 2026-06-18). The broad facts re-verified as still true on `main` (`loadSession:false`, no `session/load`, single-session-per-process, temp-home-per-turn), but **exact line numbers will have moved** — re-run `git -C <vela> fetch && git grep` against current `main` to re-anchor before coding. Treat `:NNN` references as "approximate, in this file" not "stable line".
- **vela side (root cause, verified)**: `~/Documents/vela/apps/cli/internal/agent/acp_runtime.go`
  - `:248` `"loadSession": false` — vela reports that loading/resuming sessions is unsupported.
  - In `newSession`, `if runtime.sessionID != "" { return ... "only one ACP session is supported" }` — only one session per process.
  - `handleRequest` switch only handles `initialize / session/new / session/set_model / session/prompt` — **no `session/load`**, default→"Method not found".
- **open-design daemon side (verified)**:
  - `apps/daemon/src/server.ts:7670` — `composed` = `# Instructions{volatile system block}` + `# User request{flattened transcript}`; `prompts/system.ts:632` BASE_SYSTEM_PROMPT comes first, while `:637` memoryBody and other volatile blocks come later.
  - `apps/web/src/providers/daemon.ts:222` — `buildDaemonTranscript` flattens history into a content-only markdown blob every turn, dropping thinking/tool_use/tool_result.
  - `apps/daemon/src/runtimes/defs/amr.ts` (`acp-json-rpc`, no `resumesSessionViaCli`) → `server.ts:7578` `agentSupportsSessionResume=false` → `skipTranscript:false` → **AMR resends flattened history every turn**. (Contrast with claude.ts `resumesSessionViaCli:true` → already resumes.)
  - `apps/daemon/src/runtimes/mcp.ts:13-22` — MCP injected by the daemon: AMR(mature-acp)+1 live-artifacts; claude uses user external MCP.
- **Data sources**: PostHog project **OpenDesign=420348** (`run_finished`, requires `phx_` key); Langfuse `us.cloud.langfuse.com` (trace_id==run.id). Queries are in the Reproduction section.
- **Access prerequisites**: PostHog personal key to rerun; vela changes require the local vela repo (already available).

## Measured data baseline (real production client + local daemon)

- AMR TTFT: turn-1 p50 ~11.7s, turn-2+ p50 ~10.9-11.1s (about ~90% of runs); hit vs miss 10.9s vs 13.3s.
- **Context size per turn**: AMR turn-1 ~100.7k, turn-2+ ~153.2k total input (claude 91k/126k). NOTE: this is the *context size*, not uncached — most of it is cached. The TTFT/cost-relevant number is the **first-call uncached** (~24.5k on turn-2+, see Production measurement), not this total.
- Cache efficiency (per-turn aggregate, PostHog `run_finished`): AMR ~73-80%, claude ~93%. **This aggregate is within-turn-loop-inflated** — the per-upstream-call truth (`link.usage_events`) is that turn-2+ first call hits only ~21%.
- Real local daemon claude (minimal turn) breakdown: setup 1.67s + model first byte 3.14s (claude self-reports `[API:timing] first byte 3140ms`).
- Ruled out: bun install is not in user TTFT (shipped opencode is self-contained, measured); process cold start is not the main contributor.

## Goals / Non-goals

- **Goals**: Cut the cache-cold portion of the turn-2+ **first** upstream call (production: ~21% hit, ~24.5k uncached, ~12s) toward the within-turn hit level (~80%), so the prior conversation reuses cache instead of re-paying — reducing TTFT + token cost on the critical path.
- **Non-goals**: claude (already resumes); provider-side first-token floor (~3s, network hops + model itself); opencode direct 31s anomaly (separate investigation).

## Root cause

On the turn-2+ **first** upstream call, AMR re-pays the conversation as cache-cold input (production: only ~21% hit, ~24.5k uncached) — it feeds history the model already processed in the previous turn, but in a form that no longer matches what was cached, so it recomputes it. Root causes:
1. **vela does not support session reuse** (`loadSession:false` + single session + no `session/load`) → every turn starts from `session/new`;
2. **daemon flattens history into a new user message every turn** (`buildDaemonTranscript`) → prefixes and the previous turn's native structure do not line up;
3. **volatile system blocks** (MCP/memory/runContext) are interleaved inside the system prefix → they truncate the cacheable prefix early (for explicit-cache models).

### This is not AMR-specific — it is the default for ~22 of ~24 agents (code + production data)

Cause #2 (recompose the conversation from the DB every turn) is **structural to almost every agent**, not an AMR quirk. Only adapters that carry `resumesSessionViaCli: true` (or `streamFormat:'pi-rpc'`) let the CLI hold its own session and skip the resend — in `apps/daemon/src/runtimes/defs/` that is **only `claude` + `codebuddy` (`--resume <id>`) and `pi`**. Every other def — `amr · codex · gemini · opencode · cursor-agent · devin · hermes · copilot · aider · amp · deepseek · grok-build · kilo · kimi · kiro · qoder · qwen · reasonix · trae-cli · vibe` (and `antigravity`, which deliberately opts out) — has the daemon resend `buildDaemonTranscript(history)` (`apps/web/src/providers/daemon.ts:251`, called unconditionally; `server.ts:7609` gates the skip on `resumesSessionViaCli`).

**Production proof (PostHog `run_finished`, successful runs, 7d): turn-2+ `input_tokens` p50 by provider** — recompose agents balloon as history accumulates; the native-resume agent collapses to ~3k:

| provider | turn-1 | turn-2+ | turn-5+ | mechanism |
|---|---|---|---|---|
| codex_cli | 49k | **884k** | 799k | recompose (resends full history) |
| hermes | 46k | **424k** | 454k | recompose |
| gemini_cli | 62k | **326k** | 361k | recompose |
| cursor_agent | 38k | **73k** | 76k | recompose |
| amr | 37k | **64k** | 59k | recompose |
| **claude_code** | 17k | **3.0k** | 2.8k | native resume (history not resent) |
| pi / opencode | 24k | 0.5–0.6k | — | per-call usage reporting (not comparable) |

The claude vs codex/gemini/hermes/amr gap is the resent flattened history, measured. **Caveats (do not over-read):** (1) run_finished `cache_read` is a *within-turn-loop aggregate* and the reporting shape varies per agent (opencode/pi report per upstream call, which is why their tiny turn-2+ input is an artifact, not resume), so the **first-call-of-turn** cache hit — the TTFT-critical number — is only cleanly measurable per upstream call, which we have via `link.usage_events` for AMR only (21%); the equivalent per-call slice for codex/gemini is not in PostHog. (2) `github_copilot_cli`, `kimi_cli`, `qwen_code` currently report **no usage at all**, so they are unmeasured, not necessarily exempt.

**Severity is provider-dependent**, which is why the fix splits by tier: codex (OpenAI) and gemini resend huge histories but the upstream **automatic prefix cache** absorbs most of it (codex turn-2+ aggregate hit ~99%), so the cheap **P2 cacheable-prefix stabilization helps them with no vela change**; AMR's lead model (DeepSeek) auto-cache **decays with the inter-turn gap** (first-call 55%@15s → 21%@120s), so it additionally needs the **P3 session-reuse** project. AMR is simply the highest-reach (31% of users) recompose agent we measured end-to-end — the optimization generalizes to the whole recompose group.

### Why a high reported cache rate does NOT contradict this (within-turn vs cross-turn)

A counter-intuitive fact to pre-empt: AMR's per-turn cache rate can look healthy (~80%) while the cross-turn re-pay above is exactly the problem. They are not in tension — they measure different things:

- vela reports `cachedReadTokens` by **summing `cache.read` across every `step-finish` part within one turn** (`opencode_client.go:140`), and since vela opens a fresh session per turn, `exportSessionUsage` only covers that one turn → the number is a **per-turn aggregate**.
- One turn is an **agentic loop** = many model calls (plan → tool → observe → tool → … → answer). Calls 2..N reuse the same growing-but-stable within-turn prefix → high hit rate. That is real and already good.
- But the **first call of each turn** re-pays the conversation as a cache-cold call (cross-turn miss: opencode's structured cache from the prior turn does not byte-match our flattened-text resend, the session is new, and DeepSeek's auto-cache decays with the inter-turn gap). It is one call out of many, so it barely moves the per-turn average — yet it is the entire cross-turn cost and it sits exactly on the TTFT path.

**Consequence**: a high per-turn cache rate ≠ fast TTFT, because TTFT is set by the turn's first call (the cross-turn miss). Measurement must therefore target the **first model call of turn-2+**, not the per-turn aggregate, or the win will be invisible in the averaged metric. (This also corrects the older "AMR reports no token usage" assumption — vela #277/#288 fixed that ~2026-06-10.)

### Production measurement (vela `link.usage_events`, the proof)

vela's Link gateway persists **one row per upstream model call** to Postgres `link.usage_events` (`input_tokens`, `cache_read_tokens`, `cache_write_tokens`, `latency_ms`, `created_at`, and `metadata` carrying `openDesignSessionId` / `openDesignRunId`). `uncached = input − cache_read − cache_write` (`pricing.go:89`). Querying DeepSeek calls (the AMR lead model; note `provider='openai'`, filter on `model ILIKE '%deepseek%'`), taking the **first upstream call of each run** and bucketing by run ordinal within the session:

| First call of… | n | cache hit | input | uncached | latency |
|---|---|---|---|---|---|
| turn-1 (conversation start, fully cold) | 456 | **9.4%** | 25.2k | 22.9k | 11.8s |
| **turn-2+ (cross-turn entry)** | 2051 | **21.2%** | 31.1k | **24.5k** | 12.0s |

For contrast, the **within-turn agentic-loop calls** hit **~79%** (this is what inflates the per-turn aggregate to ~80%). And the cross-turn hit **decays with the inter-turn gap** (classic cache eviction): first-call hit at gap >15s / >30s / >60s / >120s = **55% / 42% / 32% / 21%** — since real human follow-ups are usually minutes apart, the first call is mostly cold. The lead model **deepseek-v4-flash is the coldest** (first-call ~35% at gap>30s; v4-pro is warmer at ~77%).

**Reading**: the prior turn's conversation history is **not** reused on the next turn's first call — the ~21% that does hit is the static `[system + tools]` prefix (and possibly cross-user shared static), while the history re-pays uncached. This is the data behind the headline: turn-2+ first call ≈ 21% hit, ~24.5k uncached, ~12s, and it is the TTFT-critical call.

*(Method note: measured read-only against production `link.usage_events` via an ephemeral in-cluster psql pod, statement-timeout + read-only transaction guarded. Turn ordinal uses `openDesignSessionId`/`openDesignRunId` from `metadata`; sessions straddling the query window's start can mislabel a mid-conversation run as turn-1, adding minor noise that does not change the picture.)*

## Proposed design

Explicit order: measure first, run the cheap gateway/cache experiment second, and only then decide whether ACP session reuse is still justified.

### Step 0 — instrument and measure
- Add production dashboards for `uncached_input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, cache efficiency, TTFT, and turn ordinal. Use `uncached_input_tokens` for the main before/after metric; raw `input_tokens` is not sufficient when cache fields are present.
- Confirm whether AMR follow-up latency is dominated by uncached follow-up input after separating turn-1 vs turn-2+ and hit vs miss cohorts.

### Step 1 — cheap gateway 1h-TTL + stable-prefix experiment
- Change Vela Link's explicit-cache path from default ephemeral to **1h TTL** where the upstream provider supports it, and make the cacheable prefix byte-stable. Vela Link currently emits only `{type: ephemeral}` at `prompt_cache.go:340-342`; 1h on the AMR lead path is unverified.
- Automatic-cache models (**DeepSeek, OpenAI**) do not need explicit `cache_control`; AMR's lead model `deepseek-v4-flash` needs a stable prefix and no unnecessary resend. Explicit-cache models (Claude / Gemini through Vertex) need cache breakpoints + volatile system blocks moved after the stable breakpoint.
- Layered breakpoints: `[common core]breakpoint[project stable]breakpoint[volatile]breakpoint[user]`. Cross-user reuse of the common core is a hypothesis to validate, not an assumed production fact.

### Step 2 — ACP session reuse only if uncached follow-up remains dominant
- If Step 1 shows turn-2+ `uncached_input_tokens` still dominates TTFT/cost, implement session reuse: ① change vela `initialize` to `loadSession=true`; ② add `case "session/load"` in `handleRequest`; ③ persist the opencode session (the current session id only lives in memory).
- Daemon coordination should reuse the existing centralized resume detection (`server.ts:7578-7595`) instead of duplicating an ACP-specific path. The behavior is "one long-lived ACP connection per conversation, `session/prompt` per turn", with flattened-history resend removed only after state-continuity gates pass.
- Effect to verify: turn-2+ first-call uncached drops from ~24.5k → only the new content for the current turn, and first-call cache hit rises from ~21% toward the within-turn ~80%.

### Cache model classification (for implementers)
| Model | Cache | Read discount | TTL | Needs cache_control |
|---|---|---|---|---|
| Claude(Vertex/direct) | Explicit | 0.1× | 5m/1h(write 1.25×/2×) | Yes |
| DeepSeek(AMR lead) | Automatic | 0.5× | Automatic | No |
| OpenAI | Automatic | ~0.5× | Short/uncontrollable | No |
| Gemini | Explicit ctx cache | ~0.25–0.75× | Configurable | Yes |

### Cache scope + TTL (design constraints)
- **Scope = upstream account/project level, not global and not cross-organization**. AMR uses server-side credentials, so a shared-cache cohort is architecturally plausible. claude_code is BYOK and uses each user's own account → no cross-user sharing.
- **Cross-user shared cache — verified by provider docs (the mechanism is real, but it does NOT cover AMR's lead model):**
  | Provider | Cross-user shared cache? | Evidence |
  |---|---|---|
  | Anthropic (Claude, incl. Vertex) | ✅ **Documented** | Cache is scoped per **workspace/org, NOT per-API-key and NOT per-end-user**; two end-users on the same key with an identical prefix hit the same cache. Vertex/Bedrock = org-level isolation. |
  | OpenAI | ✅ **Documented** | Org-scoped; "within the same org, the first user pays full price and subsequent users with an identical prefix get −50%" — exactly the cross-user warming model. |
  | Gemini (Vertex explicit ctx cache) | ✅ Plausible | project/org-scoped cached-content resource, reused across requests in the project. |
  | **DeepSeek (AMR lead model)** | ⚠️ **Unverified, wording leans isolated** | The KV-cache doc only defines prefix-match mechanics and **does not document an account isolation boundary**; other material says "each user's cache is isolated and logically invisible to others" → per-account vs per-conversation undefined. |
- **Two preconditions for the turn-1 cross-user benefit** (both must hold, hence "hypothesis" not "fact"): (1) AMR must route all users through the **same upstream key/workspace** — `account.go` selects from a server-side catalog by key weight, so multi-key routing dilutes the hit rate even on Anthropic; (2) the provider must be org-scoped — **AMR's dominant lead model is DeepSeek, whose cross-user sharing is exactly the unverified case**. So the turn-1 benefit is documented-real for Claude/OpenAI/Gemini but **unproven on AMR's main DeepSeek path**.
- **turn-1 immunity to TTL** remains a hypothesis: it only holds if (1)+(2) above hold and concurrency keeps the shared prefix warm.
- **turn-2+ single-session history is exposed to TTL** (human time between turns is often >5min) → use **1h extended TTL** + keep one process alive per conversation.
- Sources: Anthropic prompt-caching docs (workspace/org isolation), OpenAI prompt-caching guide (org-scoped, −50% for later users), DeepSeek KV-cache docs (no account-isolation boundary documented).

### Session invalidation & lifecycle

ACP session reuse must mirror the daemon's existing resume keying (`server.ts:7604-7615`) and invalidate on model, cwd, project, MCP/tool-contract, prompt-hash, or memory change. Cancellation must clean up the ACP session, and stale-process eviction must close any long-lived per-conversation process; vela is one-session-per-process at `acp_runtime.go:258-260`, so one long-lived process per conversation otherwise risks leaked sessions and cross-conversation state.

## Expected benefit (quantified + confidence)

All figures are the **first upstream call of the turn** (the TTFT-critical, cross-turn call), production-measured from `link.usage_events`:

| First call of… | Current cache hit | Current uncached | Method | Target |
|---|---|---|---|---|
| turn-1 | 9.4% | ~22.9k | (cold start — irreducible) | n/a |
| **turn-2+ (~90% of turns)** | **21.2%** | **~24.5k** | session reuse (preserve structure) → history hits instead of re-paying | hit → ~80% (within-turn level), uncached → just the new delta |

- **Latency**: AMR turn-2+ first call ~12s (measured). Lifting its cache hit from ~21% toward ~80% shrinks the uncached first-byte work → estimate first-call ~12s → ~8-9s. (The earlier "~11s → 6-7s" was over-optimistic; resized down because the recoverable uncached is ~24.5k, not 153k.)
- **Cost/stability**: ~20k fewer uncached tokens per follow-up turn × ~90% of turns → less balance burn → **mitigate insufficient_balance (#4455 largest failure)**. Smaller per-turn than the old "150k" claim, but real and on every follow-up.
- **Cheaper alternative first (Step 1)**: the gap-decay data (first-call hit 55%→21% as gap grows 15s→120s) shows the cross-turn cache is being **evicted by TTL** between turns. Extending cache TTL (the Step-1 gateway lever) would hold the static prefix warm across the human think-time without the full session-reuse project — measure this before committing to Step 2.
- **Confidence**: "turn-2+ first call 21% hit / ~24.5k uncached / ~12s" is production-measured (hard data); the post-fix targets are estimates that **must be verified after implementation**; floor ~3s (network+model, measured) cannot be moved.
- **Scope note**: AMR volume is ~4.4k successful runs/week (< claude 73k), so absolute run reach is smaller, but AMR is the paid hosted layer, per-user experience + cost are sensitive, and it links to stability.

## Risks & mitigations

- **Cross-repo vela**: session/load + persistence are vela changes; user owns vela, non-blocking; requires vela tests + open-design daemon integration.
- **Correctness**: session reuse must not repeat #3380 and lose edit state; model/cwd/agent/cancel changes need session invalidation and fallback.
- **Slow conversations vs TTL**: 1h extended TTL + keepalive mitigates; very slow conversations may still miss (acceptable).
- **Instrumentation status (updated)**: vela now forwards usage on the ACP `session/prompt` result (vela #277 `c424931` + #288 `d176c010`, landed ~2026-06-10), so `cachedReadTokens` flows through to `token_count_source=provider_usage` (`acp_runtime.go:607-613` → daemon `acp.ts:154`). `cache_creation` is still likely empty (Vertex may not report write). **Caveat that changes interpretation — see "within-turn vs cross-turn" below**: the reported cache read is a per-turn aggregate, so a healthy AMR cache rate does NOT imply cross-turn reuse.
- **observability**: Add `cache_efficiency` / follow-up uncached_tokens dashboards to prevent regression.

## Prior art

Claude CLI resume already provides the desired host shape for native continuation. #3380 documents the lost edit-state failure mode from broken session continuity, and #3535 is the ACP session-reuse track. The daemon already centralizes resume detection at `server.ts:7578-7595`, so ACP work should plug into that path rather than adding a parallel resume detector.

## Validation · Acceptance (behavior-level)

- before/after, **measured on the first model call of turn-2+** (not the per-turn aggregate): `time_to_first_token_ms` p50 drops; first-call `uncached_input_tokens` drops from the ~24.5k production baseline; first-call cache hit `cache_read/(cache_read+uncached)` rises from ~21% toward the within-turn ~80%.
- One falsifiable check: send two consecutive turns in the same `conversationId`, assert second-turn `uncached_input_tokens` << first-turn `uncached_input_tokens` (history is no longer repaid after session reuse). **Measure the first model call of turn-2+, not the per-turn aggregate** — the per-turn cache rate is within-turn-loop-dominated and hides the cross-turn miss (see "within-turn vs cross-turn").
- Pure telemetry changes do not need #3545 QA gate. Prefix reordering and session reuse do need state-continuity / quality gates because they change model input: order is part of the input, and the daemon assembles that order at `server.ts:7670-7684`.
- Session lifecycle acceptance: changing model / cwd / project / MCP+tool contract / prompt hash / memory forces a new ACP session; cancel closes the session; stale-process eviction removes long-lived conversation processes; a new conversation cannot observe prior conversation state.

## Regression guard

- Prompt-stack byte-level golden test: cacheable common prefix stays byte-for-byte identical when only volatile inputs change (reuse the section fingerprint from `prompt-telemetry.ts`).
- Enforce STABLE/VOLATILE classification: new prompt sections without classification fail tests, forcing authors to declare placement (self-protecting as features evolve).
- Production cache efficiency + follow-up uncached dashboards + alerting.

## Feasibility review (codex GPT-5.5, ground-checked against vela + provider docs) — corrections and reprioritization

This feasibility was checked premise by premise by codex, with material corrections; **treat this as authoritative**:

1. **Caching is actually already implemented in the Vela Link gateway** (`services/link/internal/bifrostengine/prompt_cache.go`): after converting the OpenAI-compatible body to Bifrost, the gateway **injects cache control into system/developer content** (`:173/340`), strips directives unsupported by clients (`:107`), and uses **a limited number of cache breakpoints** (`markChatContentCacheable(content, remaining)`). → **No need to pass cache_control through ACP**; however, it **only injects `{type: ephemeral}` and no TTL** → default 5min, **1h is not wired**.
2. **Provider table correction**: DeepSeek read discount is **0.5×** — **vela's own billing says deepseek-v3.2 reads at 0.5×** (`services/api/src/billing.ts:178-180`); **AMR actual model preference = DeepSeek/GLM/Gemini**, not Claude/OpenAI (`runtimes/defs/amr.ts:8`). Anthropic numbers are verified. OpenAI/Gemini vary by model/config.
3. **session reuse = architecture change, not a config switch** (single largest risk): opencode `serve` natively supports multi-turn (`/session/{id}/prompt_async`), while "single session/no load" is a vela ACP choice; **but vela creates/deletes an opencode temp home every turn** (`opencode_process.go:336/376`) → session is destroyed with it, and **whether a fresh serve process can reload a persisted session is unverified**. Required work: stop temp deletion + persist + prove opencode reload + one process per conversation in the daemon.
4. **Cross-user shared cache — mechanism verified per provider, but not on AMR's lead model**: provider docs confirm the mechanism is real and org/workspace-scoped (Anthropic: per-workspace/org, not per-key/per-user; OpenAI: org-scoped, −50% for later users; Gemini: project-scoped). It does **not** clearly apply to **DeepSeek (AMR's dominant lead model)**, whose docs define prefix-match mechanics but **no account-isolation boundary**. Vela Link selects upstream credentials from a **server-side catalog, key-weighted, not per user** (`account.go`), so even on the org-scoped providers the turn-1 benefit additionally requires all users to land on the **same key/workspace**. Net: documented-real for Claude/OpenAI/Gemini, unproven on the main DeepSeek path — see the provider table under "Cache scope + TTL".
5. **1h TTL is not wired**: Anthropic supports `ttl:"1h"`, but Vertex/Bedrock automatic caching does not support it and only accepts explicit breakpoints; Vela Link currently defaults to ephemeral without TTL (`prompt_cache.go:340`) → 1h for Vertex-Claude on this path is unverified.

**Therefore, reorder into Step 0/1/2 (after correcting difficulty/feasibility):**
- **Step 0 (measure first)**: Add uncached/cache-field dashboards and confirm the dominant cohort before changing behavior.
- **Step 1 (small, more feasible, first)**: Change Vela Link ephemeral to **1h TTL** where supported + ensure the cacheable prefix is stable. Helps explicit-cache models only (Claude/Gemini); DeepSeek automatic-cache TTL cannot be set — partial benefit.
- **Step 2 (large, conditional project)**: session reuse (stop temp deletion + persist + verify opencode reload + one daemon connection per conversation) **only if first-call uncached remains dominant after Step 1**. This captures the turn-2+ first-call re-pay (~24.5k uncached, ~21% hit), but needs a project.

> Therefore, this optimization is **not low-hanging fruit; it is a vela cross-repo project that needs to be planned**. Step 1 is comparatively small, but its benefit is limited by "AMR's lead models are automatic-cache models (DeepSeek/GLM)".

## Open questions

- After vela session/load, what should the opencode session persistence granularity be (per conversation? invalidation conditions?).
- Does AMR route all users through the same upstream key/workspace, and is the DeepSeek lead model's cache shared per-account? (Provider mechanism is documented for Claude/OpenAI/Gemini; DeepSeek isolation boundary is undocumented — this is the gating unknown for the turn-1 cross-user benefit.)
- Is the opencode direct p50 31s anomaly the same root cause (separate issue).

## Reproduction · Reproduce

PostHog OpenDesign=420348, `POST /api/projects/420348/query/`. HogQL: use `toFloat()` for numbers, `isNull()` for null, `quantile(0.9)` for P90, and `row_number() OVER (PARTITION BY conversation_id ORDER BY timestamp)` for turn ordinal.
- Input composition (turn-1 vs turn-2+): `avg(toFloat(properties.uncached_input_tokens))` / `cache_read_input_tokens` / `cache_creation_input_tokens`, bucketed by `if(turn=1,...)`.
- Hit vs miss TTFT: group by `if(toFloat(properties.cache_read_input_tokens)>0,'HIT','MISS')`.
- **Cross-agent recompose proof (turn-2+ `input_tokens` p50 by provider)** — shows the resent-history balloon across recompose agents vs the native-resume collapse: `WITH o AS (SELECT properties.agent_provider_id AS prov, toFloat(properties.input_tokens) AS inp, row_number() OVER (PARTITION BY properties.conversation_id ORDER BY timestamp) AS turn FROM events WHERE event='run_finished' AND properties.result='success' AND isNotNull(properties.conversation_id) AND isNotNull(properties.input_tokens) AND timestamp >= now()-INTERVAL 7 DAY) SELECT prov, round(quantileIf(0.5)(inp,turn=1)) AS t1, round(quantileIf(0.5)(inp,turn>=2)) AS t2plus, round(quantileIf(0.5)(inp,turn>=5)) AS t5plus FROM o GROUP BY prov ORDER BY t2plus DESC`. Caveat: opencode/pi report usage per upstream call, so their tiny turn-2+ value is a reporting artifact, not native resume; copilot/kimi/qwen report no usage.
- Which adapters skip the resend: `git grep -n 'resumesSessionViaCli: true' apps/daemon/src/runtimes/defs/` (only claude + codebuddy; pi via `streamFormat:'pi-rpc'`).
- vela verification: `git -C <vela checkout> grep -n 'loadSession\|session/load' apps/cli` (re-anchor against `nexu-io/vela@main`; the local `fe8266e` checkout has drifted — see Sources caveat).
