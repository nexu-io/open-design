# Stability & Performance: Current State and Fix/Optimization Plan

Design doc (human/reviewer-facing). Implementation runbooks per slice are written separately at build time.

Status: living doc · Parent: #3408 · This is the **background + plan overview** for reviewers; each fix/optimization has, or will have, its own deeper spec.

---

# Part 1 · Current state (reviewer background)

After taking over #3408, I audited stability/performance end to end with PostHog (production telemetry), Langfuse, a real local daemon, and source reading (including the local vela repo). Conclusion: **most "issues" are either not fixable by us, already fixed, or caused by measuring the wrong thing. The set that deserves engineering investment is smaller than it first appears, but each item is now clearly located.**

## 1.1 How we measure (metric definitions)
Failures are split into two views, aligned with the official "0.10.0 Release Health" definition and now promoted to the main rolling all-versions dashboard:
- **Product-view failure rate ≈ 13.5%**: user-facing failures (auth / balance / user_cancel / prompt too large / model unavailable / config…). This is the user experience/retention signal.
- **Engineering-view failure rate ≈ 7%**: engine-fixable failures (process_exit / timeout / upstream / empty_output / tool_error / rate_limit / unknown). **This is the "product reliability we can fix" and the engineering focus.**
- The old "overall failure rate ≈ 22%" counted "user self-recovery + old-version noise" together → inflated by ~3 times and misleading.

> Measured: among ~41k failures over 7d, user-action(login/recharge…)= 43%, old version (null) = 19%, and real product/upstream failures are only 38%.

## 1.2 Failure map (who owns it)
| Category | Share | Nature |
|---|---|---|
| user-action(login/recharge) | ~40% | **Not our fault**: external CLI credentials expire; users can resolve by logging in/recharging. Confirmed `spawnEnvForAgent` does not isolate HOME or break token refresh. |
| Old version (null classification) | ~19% | Classifier (#3412) only shipped in 0.10.0; this self-heals as users upgrade. |
| **Our bugs hidden behind the user_action label** | — | fix_config(codex config), reduce_context(no total budget), switch_model(stale model catalog)= **our bugs; they should be fixed, not excluded**. |
| **Real engine failures** | ~38% of fails | process_exit / execution_failed(#4502 is splitting this), timeout, upstream, empty_output. |

## 1.3 Performance map (TTFT)
- The main TTFT contributor is **model first byte** (claude self-reports `[API:timing] 3140ms`, provider side, outside our control); inside setup (claude ~1.7s / opencode ~2.3s), MCP connection is the only variable component, but it depends on the user's configured MCP count.
- **Phantoms ruled out**: bun install (shipped opencode is self-contained), process cold start, claude session (main already uses `--resume`). Prompt-prefix stability is **partly** done: #4203 (`perf(prompts): system-prompt dedup + on-demand injection`) deduped instructions and gated big blocks on session-stable signals explicitly "so the stable-prompt fingerprint stays cacheable" — but it did NOT physically move the remaining volatile blocks (file list / MCP list / personal memory / run context) after the stable transcript; that residual move is startup-spec Phase 3a, not yet done.
- **Misleading instrumentation**: opencode/codex/gemini "slow TTFT" (31s/20s/78s) is mostly because `time_to_first_token` measures "first visible text", while agentic CLIs plan and call tools before emitting text (measured: opencode with tools is +12s vs without tools) → users can see progress; it is not frozen.
- **Real large item (but a project)**: AMR's turn-2+ **first** upstream call is cache-cold (production `link.usage_events`: ~21% hit, ~24.5k uncached, ~12s) because the flattened history no longer matches what was cached + DeepSeek's auto-cache decays with the inter-turn gap → latency + balance burn on the TTFT path. (The per-turn aggregate looks ~80% cached, but that is within-turn-loop-inflated.) The optimization sits in the vela/opencode stack and is a cross-repo project.

## 1.4 User reach (key prioritization axis)
Across platforms, 20,016 users/7d: claude_code 36% · **AMR 31%(6,217 users, fewer runs does not mean smaller impact)** · codex 23% · opencode 16% · gemini 7%. **Prioritize by user count, not only run count.**

---

# Part 2 · Fix/optimization plan (write the full map first, then drill down)

Ordered by `our-fault × user reach × run count × balance/cost impact × engineering cost`; do not rank by run volume alone. Each item notes: type / our fault / expected benefit / status / cost / deeper spec.

### P0-a · Reliability metric calibration ✅ Done
- **Type** Observability · **Our fault** N/A · **Benefit** Makes the "engineering view ~7%" visible instead of buried in noise · **Cost** Very small
- **Status** ✅ Added a tile to the main dashboard, aligned with the Release Health definition; reviewed other dashboards and most (frontend health / success rate / failure attribution) do not need calibration.
- Drill-down: none (complete)

### P0-b · fix_config: fill the codex service_tier normalizer gap ⭐ Next to implement
- **Type** Engine bug · **Our fault** 100% · **Benefit** Directly reduces engineering-view failure rate a bit (~380/week, current versions) · **Cost** Small (one file)
- **Current state** `codex-config-normalize.ts` only catches `service_tier="priority"→"fast"`; other invalid values slip through (the comment explicitly says unknown values are not handled). All 380/week are on 0.10.x/0.11 (real bug, not noise).
- **Fix** Change this to "**remove any `service_tier` value not in {fast,flex}**" (drop the line so the CLI uses its built-in default) to avoid whack-a-mole and future renames; red spec uses injectable `CodexConfigIO` and replaces the existing "unknown values untouched" tests. First sample real invalid values from Langfuse.
- **Priority framing** This is the lowest-cost **confirmed** bug and should ship first for fast reliability cleanup; it is **not** the highest-ROI bucket. `execution_failed` is roughly 10x larger by volume and its sampling runs in parallel under P1.
- Drill-down: pending

### P1 · process_exit / execution_failed deep dive (#4502 follow-up)
- **Type** Engine bug · **Our fault** High · **Benefit** Largest single engineering-view bucket (execution_failed ~4,500/week) · **Cost** Medium (needs Langfuse digging)
- **Current state** #4502 has split execution_failed by close reason into stream_error/exit_nonzero/fatal_rpc_error (in review). Next, dig into the real stream_error messages (opencode often swallows the actual cause, requiring Langfuse + possibly added logging on the opencode side).
- Drill-down: #4502 + follow-up

### P1 · reduce_context: total-budget truncation
- **Type** Engine bug · **Our fault** High · **Benefit** ~787/week prompt_too_large · **Cost** Medium
- **Current state** Only per-message 12k truncation (`MAX_TRANSCRIPT_MESSAGE_CHARS`); **no total budget cap** → long conversations blow the window. Same root family as AMR history slimming.
- **Fix** Total-budget-aware truncation/summarization, or automatic switch to a larger-context model.
- Drill-down: pending

### P2 · switch_model: model catalog hygiene
- **Type** Engine bug · **Our fault** High · **Benefit** ~300/week · **Cost** Medium
- **Current state** We list models users cannot actually use (codex cli_version_incompatible / model_not_found).
- **Fix** Only list usable models + fallback when unavailable.
- Drill-down: pending

### P2 · TTFT metric definition correction
- **Type** Observability · **Our fault** N/A · **Benefit** Make agentic CLI "slow TTFT" reflect actual perceived behavior (model first token rather than first visible text) · **Cost** Medium
- **Current state** TTFT counts planning + tool loop before first visible text, which misleads (for example opencode 31s).
- **Fix** Add/change instrumentation to measure "model first token".
- Drill-down: pending

### P2 · Cacheable-prefix stabilization (cheap, helps every agent incl. AMR)
- **Type** Perf/engine · **Our fault** Yes · **Benefit** Raises the cross-turn first-call cache floor (production: AMR turn-2+ first call hits only ~21%, carried entirely by the static `[system+tools]` prefix) · **Cost** Small
- **Cross-cutting, with data** This is not an AMR-only problem: only `claude`/`codebuddy`/`pi` resume natively; the other ~21 adapters resend the flattened transcript every turn (`resumesSessionViaCli` enumeration). Production proof — turn-2+ `input_tokens` p50: codex 884k · gemini 326k · hermes 424k · amr 64k (all recompose, balloon with history) vs claude **3.0k** (native resume). Severity splits by upstream: OpenAI/Gemini auto-prefix-cache absorbs most of it so P2 alone helps them with no vela change; DeepSeek (AMR) auto-cache decays with the gap → also needs P3. See `amr-latency-session-reuse-prompt-cache.md` Root cause §"not AMR-specific".
- **Current state** Volatile blocks (file list / MCP / personal memory / run context) are interleaved at the FRONT of the prefix; any change shifts bytes and breaks even the static-prefix hit. #4203 did dedup + on-demand gating but did NOT move the residual volatile blocks after the stable transcript.
- **Fix** Move volatile blocks after the stable prefix (startup-spec Phase 3a) + add the "prefix-fingerprint invariant" red-line test so future features can't silently re-break it.
- Drill-down: `agent-startup-latency-profiling.md` (Phase 3a + guardrail)

### P3 (project) · AMR latency: cross-turn cache reuse
- **Type** Performance project (cross-repo vela) · **Our fault** Yes (architecture) · **Benefit** AMR turn-2+ **first** call (TTFT-critical) is cache-cold — production `link.usage_events`: ~21% hit, ~24.5k uncached, ~12s, while within-turn loop calls hit ~79%; lift first-call toward ~80% → lower TTFT + balance burn; **reach 31% of users** · **Cost** Large (project)
- **Current state (production-measured, corrects earlier draft)** The old "153k uncached every turn" was wrong — 153k is the context SIZE, mostly cached; real per-turn-first-call uncached is ~24.5k. The history doesn't reuse because we flatten opencode's structured turn into text + feed a fresh session (structured cache no longer byte-matches), and DeepSeek's auto-cache decays with the inter-turn gap (first-call hit 55%@15s → 21%@120s). Step 1 = cheap gateway 1h TTL + the P2 prefix move (hold the static prefix warm); Step 2 = vela session reuse (large) only if first-call uncached remains dominant after Step 1.
- Drill-down: `amr-latency-session-reuse-prompt-cache.md`

---

## Not doing (ruled out, with reasons)
- ❌ Non-AMR auth precheck: not our fault + user self-heals = vanity metrics.
- ❌ bun install / process cold start / claude session reuse: already done or not real. (Prefix stability is only *partly* done — #4203 kept the fingerprint cacheable via dedup + on-demand gating; the residual volatile-block move is still open as startup-spec Phase 3a.)
- ❌ Treating opencode 31s as a "performance bug": mostly a metric-definition issue (see P2).

## Suggested execution order
**P0-b(fix_config)→ P1(process_exit follow-up + reduce_context)→ P2(switch_model + TTFT definition + cacheable-prefix stabilization)→ P3(AMR cross-turn cache project).** P0-a is complete.
