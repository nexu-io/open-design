# AI Native Observability Trace Analysis Guide

This document records how to read the new Open Design Langfuse trace shape for
AI Native observability. It is intended for product, engineering, and Agent
reviewers who need to decide whether an Agent candidate improves quality,
stability, latency, and cost without weakening user trust.

Related links:

- PR: https://github.com/nexu-io/open-design/pull/3714
- Issue: https://github.com/nexu-io/open-design/issues/3733
- Full UI validation, alignment turn: https://us.cloud.langfuse.com/project/cmov9fhj905kaad06h8to8rqu/traces/f486abe4-f45d-4af2-b0c2-8b8675140c78
- Full UI validation, artifact turn: https://us.cloud.langfuse.com/project/cmov9fhj905kaad06h8to8rqu/traces/e0614ca6-bbe8-41a4-8022-ccab09a66efa

## Review Goal

The trace should help a human reviewer answer four questions:

1. Did the Agent produce the expected artifact and complete the task?
2. Did quality and stability pass the fixed dataset and evaluator gates?
3. Did latency and cost improve or at least not regress?
4. Are attachments and artifacts handled in a way that preserves user trust?

The intended decision rule is:

```text
PASS only when:
- quality does not regress on the fixed dataset,
- stability does not regress,
- cost and latency improve or remain within the agreed threshold,
- sensitive attachments/artifacts are only promoted to long-term fixtures after human approval.
```

## Trace Reading Order

Start at the root trace metadata, then drill into these observations:

1. `prompt-build`
2. `agent-call`
3. `tool:*`
4. `artifact-summary` when present, otherwise root `performance_diagnostics.artifact_write`
5. `agent-usage`
6. `finalize`

This order follows the human review flow: understand what prompt was sent,
inspect the Agent call, attribute tool and artifact cost/performance, then
confirm final status.

## Root Trace Metadata

Use root metadata for the release summary:

- `status` / `success`: final run result.
- `cost_usd`: provider-reported total cost when available.
- `currency`: expected `USD`.
- `pricing_version`: currently `provider_reported` when the runtime emits cost.
- `cost_source`: currently `agent_usage_event`.
- `cost_breakdown`: cost split by review phase.
- `performance_diagnostics`: consolidated performance and instrumentation view.
- `attachment_manifest`: trace-safe attachment references.
- `artifact_manifest`: trace-safe generated artifact references.

The root trace is the right place for dashboards and pass/fail summaries because
it stays available even when a reviewer does not expand individual observations.

## Prompt Build

`prompt-build.input` records the construction materials:

- `phase`: `prompt-build`.
- `ingredients.agent`
- `ingredients.model`
- `ingredients.skill_id`
- `ingredients.design_system_id`
- `ingredients.user_request_available`
- `ingredients.attachment_refs`

`prompt-build.output` records the resulting prompt stack:

- `status`: expected `prompt_stack_ready`.
- `content_policy`: expected `redacted_prompt_stack_inline_with_object_refs`.
- `section_count`
- `stack_fingerprint`
- `prompt_fingerprint`
- `raw_bytes`
- `redacted_bytes`
- `redacted_content_bytes`
- `prompt_stack.sections`

The section list is enough to analyze prompt composition, size, truncation, and
fingerprint changes. It is not a full raw prompt archive. Heavy or sensitive
content should remain in Open Design object storage and be referenced by
`storage_ref`, hash, and retention policy rather than inlining full raw prompt
text into Langfuse.

Current validation showed 7 sections. That is expected for the full UI path:

- first-turn trace: system, runtime tools, echo guard, user request, plugin
  stage prompt, cwd hint, attachments.
- follow-up trace: form override, system, runtime tools, echo guard, answered
  user request, plugin stage prompt, cwd hint.

## Agent Call

`agent-call` is the runtime phase that contains the provider call and streamed
Agent execution. Use:

- `agent-call.input.model`
- `agent-call.input.agent`
- `agent-call.input.tool_call_count`
- `agent-call.output.duration_ms`
- `agent-call.output.status`
- `agent-call.output.token_usage`
- `agent-call.output.cost`

`agent-call.output.cost` is currently the best source for provider cost at run
granularity. It is not yet a precise internal split across tool execution,
artifact generation, and verification. The trace makes this explicit in
`cost_breakdown.phase_costs`.

## Cost Governance

Use `cost_breakdown.phase_costs` to read cost status:

- `prompt_build`: `not_metered`; local prompt assembly.
- `agent_call`: provider-reported cost when available.
- `tool_execution`: included in agent call or local process time; not split.
- `artifact_generation`: included in agent call; not separately priced.
- `verification`: currently `not_instrumented`.

This structure is intentionally explicit. It avoids pretending we have precise
phase cost attribution before the runtime can emit it.

For long-term governance, dashboards should aggregate:

- total `cost_usd` by model, task type, skill, and design system;
- cache hit ratio from `token_usage`;
- cost per successful artifact;
- cost per approved dataset case;
- cost deltas between experiment candidate and baseline.

## Tool Performance

Use `performance_diagnostics.tool_performance` and each `tool:*` observation.

Root aggregate fields:

- `tool_call_count`
- `total_tool_duration_ms`
- `by_tool[].tool_name`
- `by_tool[].call_count`
- `by_tool[].error_count`
- `by_tool[].avg_duration_ms`
- `by_tool[].max_duration_ms`
- `by_tool[].min_duration_ms`
- `by_tool[].failure_types`
- `retry_detection`

Per tool observation metadata:

- `toolName`
- `durationMs`
- `hasInput`
- `hasOutput`
- `isError`
- `failureType`
- `retryCount`
- `retryDetection`

Current limitation: retry count is marked `not_instrumented` because tool spans
do not yet carry retry group or attempt indexes. This is a known follow-up for
stable retry governance.

## Artifact Analysis

Use `artifact-summary` when present. If the observation is absent, use root
`performance_diagnostics.artifact_write`.

Important fields:

- `artifact_count`
- `total_artifact_size_bytes`
- `write_tool_count`
- `write_tool_duration_ms`
- `bytes_per_write_ms`
- `correlation_status`
- `artifacts[].slug`
- `artifacts[].type`
- `artifacts[].size_bytes`

The current correlation is heuristic: artifact files are linked to total Write
tool duration, not individual file-level write spans. This is useful for
spotting large write outputs but not enough for per-file performance attribution.

Current validation note: the artifact turn reported artifact write diagnostics
on the root trace, but Langfuse did not show a separate `artifact-summary`
observation in the observations API response. Product reviewers can still read
artifact size and write-duration correlation from root metadata, but the trace
tree should be improved so `artifact-summary` is reliably visible.

## Preview Verification

Use `performance_diagnostics.preview_verify`.

Current expected values:

- `status`: `not_instrumented`
- `screenshot_check`: `not_reported`
- `responsive_check`: `not_reported`
- `html_parse_check`: `not_reported`

This is a deliberate honesty field. If preview, screenshot, responsive, or
console-error checks are not emitted as structured observations, the trace must
not imply that visual verification has passed.

Release gate implication: visual artifacts should not be marked fully trusted
until preview verification emits structured pass/fail evidence.

## Semantic Phase Timing

Use `performance_diagnostics.semantic_phases`.

Measured today:

- `prompt-build`
- `agent-call`
- `stream-output`
- `finalize`

Known missing semantic phases:

- `brief-intake`
- `route-task-kind`
- `resolve-skill`
- `resolve-design-system`
- `plan`
- `generate-artifact`
- `critique`
- `repair`
- `preview-verify`
- `export-finalize`
- `evaluator`

This means the trace can explain runtime performance, but not yet every product
semantic phase. For AI Native observability, these semantic phases should become
first-class observations so product and engineering can identify where latency
or quality regressions originate.

## Dataset, Evaluator, And Experiment Gates

Trace data alone should not be the final release gate. The trust loop requires
fixed datasets, evaluators, and experiments:

- Datasets define stable fixture cases.
- Evaluators compute pass/fail and score evidence.
- Experiments compare candidate and baseline versions on the same dataset.

Minimum pass/fail rule:

```text
Candidate may ship only if:
- fixed dataset quality is not worse than baseline,
- stability is not worse than baseline,
- cost and latency improve or remain within threshold,
- sensitive attachment/artifact cases have human approval before long-term fixture promotion.
```

Trace should link to dataset item ids, evaluator ids, experiment ids, baseline
run ids, and candidate run ids when those features are wired.

## Attachment And Artifact Trust

For user attachments and generated artifacts, Langfuse should contain trace-safe
references:

- `storage_ref`
- `size_bytes`
- `sha256` when available
- `summary` when available
- `retention_policy`
- `access_scope`
- `sensitivity`
- `approved_by`

Raw sensitive content belongs in Open Design object storage with access control,
retention policy, and deletion semantics. Langfuse should remain the
observability surface, not the source-of-truth storage surface for private
customer materials.

## Issue #3733 Compatibility Check

Issue #3733 targets the first durable bridge between Open Design-owned object
references and Langfuse. Its current implementation boundary is intentionally
narrow: add trace-safe attachment/artifact manifests that can resolve back to
Open Design-owned project storage today and to a ProjectStorage or
S3-compatible backend later. It does not require full object-storage
productization, ACL enforcement, quota enforcement, signed download URLs, or
lifecycle cleanup in the same slice.

This branch is compatible with that goal. The current implementation already
uses Langfuse-safe manifest fields and `od://objects/...` references rather than
raw attachment bodies, generated artifact bodies, local absolute paths, or
client-usable URLs. That means Langfuse can show which private inputs and
outputs were involved in a run without becoming the raw content store.

The important scope boundary is:

| Area | Current branch | Issue #3733 target | Conflict check |
| --- | --- | --- | --- |
| Langfuse trace metadata | Adds attachment/artifact manifests, cost diagnostics, tool diagnostics, and prompt stack metadata. | Requires trace-safe manifest metadata behind telemetry gates. | No conflict; current branch implements part of the target. |
| Storage reference | Emits stable `od://objects/...` references. | Treats `storage_ref` as an Open Design registry reference, future-compatible with ProjectStorage/S3 backends. | No conflict; current refs should remain non-dereferenceable from Langfuse. |
| Raw content handling | Keeps attachments and artifact bodies out of Langfuse. | Requires privacy tests proving raw bodies, local paths, signed URLs, and credentials are absent. | No conflict; this is the intended privacy boundary. |
| Actual object storage backend | Not implemented here. Existing project storage remains the source used by the manifest builder. | Full object storage productization is out of scope for #3733, but future-compatible schema is required. | No conflict; this is a remaining backend follow-up, not a blocker. |
| Governance/accounting fields | Adds retention, access, sensitivity, source, run/project/workspace attribution where available. | Requires defaults for governance and future quota/cost attribution. | No conflict; current branch aligns with the schema direction. |
| Dataset promotion | Documents that sensitive cases require human approval before long-term fixture promotion. | Needs manifest data reusable by future fixed-dataset trust gates. | No conflict; implementation still needs dataset/evaluator/experiment links later. |

Remaining work for #3733 after this branch:

1. Make the manifest builder resolve through a concrete Open Design object
   registry boundary instead of only best-effort project/run surfaces.
2. Fill `workspace_id` and `sha256` consistently for every attachment and
   artifact when the backing storage can provide them.
3. Add explicit tests that generated Langfuse batches do not contain raw
   attachment text, artifact body content, local absolute paths, credentials,
   signed URLs, or client-usable upload/download URLs.
4. Preserve `storage_ref` as a stable, non-secret reference and require any
   future download or preview access to go through Open Design-controlled
   authorization.
5. Decide the first real backend path: local ProjectStorage-compatible registry
   first, then optional S3-compatible object storage once quota, retention, and
   deletion semantics are designed.

## Validation Result

Validation was performed after merging the latest `origin/main` into the branch.

Branch state:

- current branch: `codex/ai-native-observability-loop-spec`
- `origin/main` is an ancestor of the current branch
- ahead/behind against `origin/main`: `10/0` before committing this document

Local checks:

- `pnpm install`
- `pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/langfuse-trace.test.ts tests/langfuse-bridge.test.ts tests/claude-stream-thinking.test.ts`
- `pnpm --filter @open-design/daemon typecheck`
- `pnpm guard`

End-to-end validation:

- UI onboarding completed on an isolated data directory.
- Real Claude Code runtime selected.
- User attachment uploaded through the UI.
- First turn emitted an alignment form.
- Human answers were submitted through the UI.
- Second turn generated a live HTML artifact.
- Langfuse traces were queried through the public API.

Validated trace results:

- first alignment trace succeeded with cost and prompt-build metadata;
- artifact trace succeeded with provider cost, prompt stack, tool diagnostics,
  artifact write diagnostics, and explicit preview/semantic instrumentation gaps;
- no `tool:*` observation had undefined input or output;
- attachment references were object refs, not raw attachment content.

## Current Gaps To Track

1. Store complete raw/redacted prompt payloads in Open Design object storage and
   add `full_prompt_ref`, `full_prompt_sha256`, `full_prompt_bytes`, and
   `full_prompt_content_policy` to `prompt-build.output`.
2. Emit retry group and attempt indexes for tool calls.
3. Link individual artifact files to individual write spans.
4. Emit structured preview verification observations for screenshot,
   responsive, console-error, and HTML-parse checks.
5. Promote product semantic phases to first-class observations.
6. Link traces to Langfuse dataset item, evaluator, and experiment ids.
7. Make `artifact-summary` reliably visible as a Langfuse observation whenever
   artifacts are present.
