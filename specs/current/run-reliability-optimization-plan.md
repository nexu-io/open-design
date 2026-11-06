# Run Reliability Optimization Plan

## Purpose

Define the post-PR1 reliability optimization plan for issue
[#3408](https://github.com/nexu-io/open-design/issues/3408), grounded in the
source planning document:

https://powerformer.feishu.cn/wiki/KHqiw4QlRiOqBdk5SPAckSWSn0b

This is a spec-only review artifact. It aligns the optimization strategy,
optimization item backlog, telemetry requirements, rollout slices, QA gates,
and anti-regression plan before implementation PRs continue.

## Source Baseline

Measured from PostHog `run_finished`, 2026-05-12 through 2026-05-30,
approximately 179k events:

| Metric | Baseline | Meaning |
|---|---:|---|
| Overall failure rate | 14.75% | Target is to drive this materially down, initially to <=8%. |
| Claude failure rate | 14.8% | Failures are not isolated to one engine. |
| Codex failure rate | 14.3% | Cross-engine fixes are required. |
| OpenCode failure rate | 12% | Lower but still material. |
| Gemini failure rate | 16.8% | Highest among the listed engines. |
| Unattributable failure share | About 92% | Most failures were not root-cause readable before PR1. |
| Dominant coarse codes | `AGENT_EXECUTION_FAILED` + `AGENT_EXIT_1` | About 75% of Claude/Codex/OpenCode failures collapsed here. |
| Successful-task latency | P50 98s / P90 566s / P99 23m | P90 is 9.4 minutes across mixed task types. |
| Successful-task tokens | Avg 360k/run | About 350k input and 9k output; cost is input/context dominated. |

PR [#2453](https://github.com/nexu-io/open-design/pull/2453) already removed
the earlier "missing `error_code`" gap after 2026-05-22. That is not part of
this plan.

## Target Outcomes

- Reduce observed chat run failure rate from about 15% toward <=8%.
- Make failed runs attributable enough to produce a ranked optimization list.
- Reduce successful-task latency by identifying the slow run segment before
  changing runtime behavior.
- Reduce token cost by focusing on input context and cache behavior, not output
  compression.
- Use fixed-task QA and online dashboards as gates so improvements do not trade
  away success rate or quality.
- Keep failure classification, timing, token analysis, retry decisions, and
  final run metrics on one run-terminal path.

## Current State After PR1

PR [#3412](https://github.com/nexu-io/open-design/pull/3412) landed the first
observability slice:

- failed `run_finished` events include structured failure fields:
  `failure_category`, `failure_detail`, `failure_stage`, `retryable`, and
  `user_action`;
- failed runs preserve the non-empty `error_code` invariant;
- `langfuse_trace_id` makes PostHog and Langfuse correlate by
  `run_id == langfuse_trace_id == traceId`;
- Langfuse trace metadata mirrors failure, timing, and token/cache fields;
- `run_finished` emits main-path timing fields for queue, spawn, first token,
  generation, tool aggregate, finalization, and total duration;
- `run_finished` emits token/cache analysis fields, including provider input,
  effective input, cache read/write, uncached input, estimated context tokens,
  and cache source.

PR1 intentionally did not finish automatic retry or downstream ROI-driven fixes.
Those are follow-up implementation slices under this plan.

## Working Loop

The planning document defines this loop:

```text
dashboard signal -> fix/optimize -> fixed-task QA -> release
-> online observation -> new signal -> next fix/optimization
```

Two gates decide readiness:

- Fixed-task QA: representative tasks must show improvement and must not break
  success-rate or quality guardrails.
- Online observation: PostHog dashboards and alerts must confirm that the same
  improvement appears in real traffic.

## Optimization Strategy

### 1. Finish the Immediate Transient-Failure Fix

Use PR1 classification output to automatically retry only failures that are
likely transient and safe to repeat.

Safe first retry scope:

- retry ordinary `rate_limit` cases when they are not hard quota/session limit;
- retry `upstream_unavailable` cases such as 5xx, network disconnects, and
  provider high demand;
- retry early `empty_output` and `timeout` failures only before visible output,
  tool calls, or artifact writes;
- default to one automatic retry attempt; consider a second attempt only after
  dashboard data proves it is worth the extra latency/token cost.

Explicit no-retry scope:

- auth/login failures;
- AMR insufficient balance;
- hard quota/session limit;
- prompt/context too large;
- model unavailable;
- missing CLI / agent unavailable;
- user cancellation;
- any run that has emitted user-visible output;
- any run that has started a tool call in the first implementation;
- any run that has written files, produced artifacts, or registered a live
  artifact.

### 2. Rank Remaining Failures by Measured Volume and Fixability

Use PR1 dashboards to generate a ranked failure backlog by:

- `failure_category`;
- `failure_detail`;
- `failure_stage`;
- `agent_provider_id`;
- `model_id`;
- OS/runtime;
- retry outcome.

The first implementation after safe retry should not guess the highest-ROI
failure. It should select the top real bucket from PostHog and inspect
representative Langfuse traces by `langfuse_trace_id`.

### 3. Rank Latency Work by Slow Segment

Use segment timing to identify where P90 is concentrated:

- queue duration;
- pre-spawn work;
- process spawn;
- first-token wait;
- generation;
- tool aggregate;
- finalization.

Optimize only the segment that dominates P90 for the task cohort under review.
For example, a spawn-heavy cohort points to runtime warmup/caching; a
first-token-heavy cohort points to prompt/context/model/service behavior; a
tool-heavy cohort points to tool orchestration or artifact reconciliation.

### 4. Rank Token Work by Input and Cache Signals

Token optimization should focus on input because the baseline is roughly 350k
input tokens versus 9k output tokens per successful run.

Use PR1 token fields to split:

- provider input tokens;
- effective input tokens;
- estimated context tokens;
- cache read tokens;
- cache creation/write tokens;
- uncached input tokens;
- cache hit ratio;
- cache source.

The first token optimization should target either oversized context construction
or poor cache reuse, whichever is larger in the dashboard.

### 5. Add Regression Gates Before Treating Improvements as Durable

The planning document names the anti-regression ladder:

- PostHog alerts for failure rate, P90, average tokens per task, and unknown
  failure share;
- fixed representative task set as the release gate;
- guardrails that reject speed/token wins if success rate or quality drops;
- unknown/unclassified share alert as the canary for classifier drift;
- one terminal run path for failure classification and timing so new code paths
  cannot bypass observability.

## Optimization Item Backlog

| ID | Priority | Item | Problem Signal | Proposed Optimization | Success Metric | Validation |
|---|---:|---|---|---|---|---|
| O1 | P0 | Safe automatic retry | Retryable 429/5xx/network/empty-output failures currently become final user failures. | Same-run bounded retry for safe transient classes, with suppression after output/tool/artifact side effects. | Retry success rate, reduced final failure rate for transient buckets, no duplicate artifact writes. | Fake CLI fails once then succeeds; hard quota/prompt-too-large suppress; fixed-task QA. |
| O2 | P0 | Retry telemetry | Without retry events, dashboards cannot distinguish no retry, attempted retry, success, failure, or suppression. | Add `run_retry_attempted`, `run_retry_finished`, and `run_finished` aggregate retry fields. | PostHog can split final result by retry outcome and suppression reason. | Contract tests and analytics smoke. |
| O3 | P0 | Unknown bucket monitoring | New engines/stderr shapes can silently fall back to `unknown`, `AGENT_EXIT_*`, or `AGENT_TERMINATED_UNKNOWN`. | Dashboard + alert on `failure_category=unknown` and coarse fallback code share. | Unknown share remains below agreed threshold. | PostHog alert and classifier unit tests for newly observed samples. |
| O4 | P1 | Top failure bucket fixes | Remaining failures after PR1/retry should be fixed by measured volume, not intuition. | Rank by category/detail/stage/provider/model and inspect linked Langfuse traces. | Top bucket volume decreases without increasing adjacent buckets. | Before/after dashboard plus representative traces. |
| O5 | P1 | First-token latency optimization | P90 is high, but the dominant segment must be proven per cohort. | If first-token wait dominates, reduce prompt/context overhead or route known slow model/provider cases. | Lower P90 for selected cohort, unchanged success/quality. | Fixed-task before/after and segment dashboard. |
| O6 | P1 | Spawn/warmup latency optimization | Process spawn may dominate for some CLIs or cold starts. | Cache static preflight work, reduce repeated detection/config work, or introduce safe warmup only if segment data supports it. | Lower spawn/pre-spawn duration for affected providers. | Segment timing tests plus fixed-task QA. |
| O7 | P1 | Tool/finalize latency optimization | Tool aggregate/finalize may dominate artifact-heavy tasks. | Optimize tool sequencing, artifact reconciliation, and manifest/finalization work only for measured slow cohorts. | Lower tool/finalize P90 without artifact-count regressions. | Artifact-producing fixed tasks and run_finished timing. |
| O8 | P1 | Input context reduction | Average successful runs spend about 350k input tokens. | Identify oversized context sources and reduce redundant context while preserving output quality. | Lower `estimated_context_tokens` and `input_tokens_effective`. | Fixed-task quality review plus token dashboard. |
| O9 | P1 | Cache reuse improvement | Token cost reduction may come from better cache read/write behavior. | Improve prompt stability and cacheable prefix reuse where provider data shows low cache hit ratio. | Higher cache hit ratio and lower uncached input tokens. | Provider usage fields and Langfuse trace inspection. |
| O10 | P1 | Fixed-task QA gate | PostHog traffic mix is noisy and consent-biased. | Create a representative task set that records success rate, P90, tokens, artifact output, and quality guardrails. | Release candidates fail when success/quality regresses or metrics exceed thresholds. | Prerelease/release job with baseline comparison. |
| O11 | P2 | Online alerting | Improvements can regress after release. | Configure alerts for failure rate, P90, average tokens, unknown share, and retry failure rate. | Alerts fire on threshold breaches with category/stage context. | Alert dry run and documented thresholds. |
| O12 | P2 | Langfuse coverage follow-up | PR1 makes eligibility visible but does not require final ingestion proof on `run_finished`. | Optional separate delivery-result event or relay-side telemetry if coverage gaps block investigation. | Expected traces without matching Langfuse records become explainable. | Delivery-state dashboard, not blocking retry. |

## PR Slices

### PR2A: Spec

- Land this plan.
- No runtime behavior change.

### PR2B: Safe Retry Policy and Contracts

- Add a pure retry policy helper.
- Add analytics contract types for retry attempt/finished events.
- Add `run_finished` aggregate retry fields.
- Unit test eligibility and suppression.

### PR2C: Same-run Retry Runtime

- Wire retry decision before terminal `design.runs.finish(...)`.
- Track retry attempt count on the in-memory run object.
- Respawn the same submitted turn inside the same run when safe.
- Emit retry event log entries.
- Replay retry event log entries into PostHog from the existing run analytics
  callback.

### PR2D: Retry Smoke and Dashboard

- Add fake-agent smoke where the first attempt fails with transient upstream
  503 and the retry succeeds.
- Add suppression smoke for hard quota and prompt-too-large.
- Add PostHog slices for retry outcome and suppression reason.

### PR3: ROI-ranked Failure Fix

- Pick the top remaining failure bucket from PostHog after PR2.
- Inspect representative Langfuse traces.
- Land one focused fix with a red/fixed validation path.

### PR4: ROI-ranked Latency or Token Optimization

- Pick either the top slow segment or largest token/caching opportunity.
- Land one focused optimization.
- Validate with fixed-task before/after metrics.

### PR5: Regression Gates

- Add or document PostHog alerts.
- Introduce the fixed representative task set as a prerelease/release guard.
- Include success rate, P90, token usage, unknown share, retry outcome, and
  quality/artifact guardrails.

## Retry Event Shape

Suggested analytics additions:

```ts
type AnalyticsEventName =
  | 'run_retry_attempted'
  | 'run_retry_finished';
```

Suggested shared fields:

```ts
type RunRetrySuppressedReason =
  | 'not_failed'
  | 'not_retryable'
  | 'unsupported_category'
  | 'hard_quota'
  | 'attempt_limit_reached'
  | 'cancel_requested'
  | 'user_visible_output_seen'
  | 'tool_call_seen'
  | 'artifact_write_seen'
  | 'live_artifact_seen';

interface RunRetryBaseProps {
  page_name: 'chat_panel' | 'design_system_project';
  area: 'chat_panel' | 'design_system_generation';
  project_id: string;
  conversation_id: string | null;
  run_id: string;
  retry_of_run_id: string;
  retry_attempt_index: number;
  retry_max_attempts: number;
  retry_strategy: 'same_run_transient';
  agent_provider_id: TrackingCliProviderId;
  model_id: string;
  failure_category?: TrackingRunFailureCategory;
  failure_detail?: TrackingRunFailureDetail;
  failure_stage?: TrackingRunFailureStage;
  error_code?: string;
}

interface RunRetryAttemptedProps extends RunRetryBaseProps {
  retry_reason: 'transient_failure';
}

interface RunRetryFinishedProps extends RunRetryBaseProps {
  retry_result: 'success' | 'failed' | 'suppressed';
  retry_suppressed_reason?: RunRetrySuppressedReason;
}
```

Suggested `run_finished` aggregate fields:

```ts
retry_attempt_count?: number;
retry_final_result?: 'not_attempted' | 'success' | 'failed' | 'suppressed';
retry_suppressed_reason?: RunRetrySuppressedReason;
```

`run_finished` remains the source of truth for final result. Retry events explain
what happened before terminal state.

## Fixed-task QA Requirements

The fixed task set should include:

- at least one simple prototype run;
- at least one artifact-heavy run that writes HTML;
- at least one design-system generation or regeneration run;
- at least one connector/tool-heavy run if connector flows are in the release;
- at least one long-context run designed to exercise token pressure;
- at least one representative failure fixture for retry/suppression behavior.

Each run should record:

- final result;
- `failure_category`, `failure_detail`, `failure_stage`, and `error_code` when
  failed;
- retry attempted/finished outcome;
- total duration and segment durations;
- input/effective/cache/output token fields;
- artifact count and expected artifact presence;
- a lightweight human or automated quality verdict where feasible.

## Acceptance Criteria

- The spec lists the optimization strategy and optimization item backlog from
  the source planning document.
- Follow-up implementation starts with safe retry and retry telemetry, not an
  unrelated local optimization.
- Every implementation PR names which optimization item it addresses.
- Fixed-task QA and online observation are required before claiming an
  optimization worked.
- Anti-regression monitoring includes failure rate, P90, average tokens,
  unknown share, retry failure/suppression, and final result.

## Open Questions

- What thresholds should block release in the fixed-task gate?
- Which task set should become the first canonical reliability suite?
- Should retry budget remain a hard-coded product constant for PR2, or should
  an experiment-only config be added later?
- Should intermediate retry-eligible error events be buffered until retry
  exhaustion, or is additive SSE retry telemetry enough for the first runtime
  patch?
- What unknown failure share threshold should page the team versus create a
  lower-priority classifier follow-up?
