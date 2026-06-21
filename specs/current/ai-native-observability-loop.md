# AI Native Observability Loop

## Purpose

Define the target observability loop that lets Open Design improve agent
quality, reliability, latency, and cost from production evidence.

This is a planning spec. It does not implement runtime behavior. It starts from
the existing Langfuse trace forwarding and PostHog run analytics, then defines
the target loop that adds datasets, experiments, annotation, and release gates
around those signals.

Issue: [#3713](https://github.com/nexu-io/open-design/issues/3713)

## Current State

Open Design already reports completed runs to Langfuse and PostHog. The current
implementation captures useful operational facts:

- trace identity: `run_id == langfuse_trace_id == traceId`;
- run status, error code, failure category, failure detail, retryability, and
  user action;
- timing fields for queue, prompt build, spawn, first token, generation, tool
  aggregate, finalize, and total duration;
- token and cache fields for provider input, effective input, cache read/write,
  uncached input, estimated context tokens, and cache source;
- tags and metadata for agent, model, skill, design system, runtime, app
  channel, operating system, and client type;
- user feedback scores such as `user_rating` and `user_rating_reason`.

The current Langfuse tree is still mostly runtime-oriented. A typical trace is
shaped like:

```text
open-design-turn
  agent-run
    llm
    tool:read
    tool:write
    tool:todowrite
```

This answers "what did the subprocess and tools do?" It does not consistently
answer "which product task stage made the run succeed, fail, become slow, become
expensive, or require human judgment?"

The current project also has far more traces than durable evaluation assets.
That means Open Design can inspect individual runs, but the system does not yet
turn production evidence into enough datasets, experiments, annotation queues,
and release gates to drive continuous improvement.

The storage foundation is partly in place but not yet connected to this
observability boundary:

- project files, uploads, pasted content, generated files, and live artifacts
  currently live under the local project filesystem rooted at
  `<dataDir>/projects/<projectId>`;
- saved standalone HTML artifacts live under `<dataDir>/artifacts` and are
  served through the daemon's static `/artifacts/*` route;
- media generation writes its output into the same project file directory;
- `ProjectStorage`, `LocalProjectStorage`, and `S3ProjectStorage` already define
  a read/write/list/delete/stat adapter contract for S3-compatible stores, but
  the current project file and artifact routes still call the local filesystem
  helpers directly;
- Cloudflare R2 / S3-compatible storage is already used for release artifacts,
  visual-regression assets, landing-page static assets, and mock recordings, so
  the repository has S3-compatible operational precedent outside the product
  runtime.

The gap is therefore not "does Open Design know how to talk to object storage?"
The gap is productizing that substrate for user attachments, generated
artifacts, access control, manifest indexing, retention, signed inspection URLs,
and Langfuse-safe observability payloads.

## Target Model

Open Design should treat observability as a closed loop:

```text
production trace
  -> semantic task observations
  -> automatic scores
  -> agent triage and clustering
  -> dataset or annotation candidate
  -> experiment and regression gate
  -> optimization proposal
  -> human approval when risk is high
  -> release
  -> online observation
```

Langfuse is the trace, score, dataset, experiment, and annotation surface. It is
the observability index, not the durable storage layer for user attachments or
generated artifacts. PostHog remains the aggregate product analytics and
alerting surface. Open Design owns the domain model that maps a design-agent run
onto task stages, quality signals, storage references, and release decisions.

### Semantic Trace Shape

The target trace tree should expose product stages in addition to low-level
runtime spans:

```text
open-design-turn
  brief-intake
    attachment-manifest
  route-task-kind
  resolve-context
    resolve-skill
    resolve-design-system
    resolve-memory
    resolve-plugin
  build-prompt-stack
  spawn-agent
  agent-work
    plan
    generate-artifact
    edit-artifact
    tool-call
  verify-artifact
    preview-render
    artifact-manifest
    export-check
  critique
  repair
  evaluator
  finalize
```

The exact implementation can preserve the existing `agent-run`, `llm`, and
`tool:*` observations, but those observations should sit inside or alongside
semantic task stages so humans and agents can diagnose by product intent.

### Heavy Input and Artifact Boundary

Open Design is a design product, so the input and output surface is heavier than
a short chat prompt. A run can include long briefs, reference images, PDFs,
brand files, prior project files, generated HTML, images, decks, documents,
preview screenshots, export bundles, and reproducibility materials. These
objects should not be copied wholesale into Langfuse input/output fields.

The target boundary is:

| Layer | Responsibility |
| --- | --- |
| Open Design object storage | Stores original user attachments, parsed text, thumbnails, OCR or embedding outputs, generated artifacts, preview screenshots, export bundles, and reproducibility files. |
| Langfuse | Stores trace-safe manifests, summaries, hashes, stage status, storage references, evaluator scores, usage, latency, and cost fields. |
| PostHog | Stores aggregate product analytics and user/workspace-level trend metrics derived from trace-safe fields. |

Langfuse should retain enough information for analysis, triage, and replay
without becoming the source of truth for sensitive or large user data. The
default policy is:

- do not upload original attachments or artifact packages to Langfuse by
  default;
- always emit an `attachment_manifest` and `artifact_manifest` with stable ids,
  MIME type, byte size, SHA-256 hash, parse/build status, truncation status,
  redaction status, and Open Design storage references;
- include short summaries and product-analysis fields that are safe to index in
  Langfuse;
- use short-lived signed URLs only for interactive inspection, not as the
  durable reference stored in Langfuse;
- store durable `od://`-style references, object ids, or artifact ids that Open
  Design can resolve after authorization;
- only upload a raw attachment to Langfuse Media when the file type is supported,
  the data is low sensitivity or explicitly allowed, and replaying the trace
  requires Langfuse-native media resolution;
- run masking/redaction before any input, output, or metadata leaves Open
  Design.

The minimum manifest shape should be stable across traces:

```json
{
  "attachment_manifest": [
    {
      "attachment_id": "att_123",
      "role": "reference_image",
      "mime_type": "image/png",
      "size_bytes": 2481032,
      "sha256": "sha256:...",
      "parse_status": "ok",
      "summary": "Brand reference image with dark UI styling.",
      "redacted": false,
      "truncated": false,
      "stored_in_open_design": true,
      "langfuse_media_id": null,
      "storage_ref": "od://objects/workspaces/ws_1/projects/proj_1/runs/run_1/attachment/att_123"
    }
  ],
  "artifact_manifest": [
    {
      "artifact_id": "art_456",
      "type": "html_prototype",
      "mime_type": "text/html",
      "size_bytes": 482193,
      "sha256": "sha256:...",
      "build_status": "ok",
      "preview_status": "ok",
      "export_status": "ok",
      "summary": "Generated HTML prototype for the requested dashboard flow.",
      "redacted": false,
      "truncated": false,
      "storage_ref": "od://objects/workspaces/ws_1/projects/proj_1/runs/run_1/artifact/art_456",
      "thumbnail_ref": "od://objects/workspaces/ws_1/projects/proj_1/runs/run_1/preview/prev_thumb_789"
    }
  ]
}
```

This boundary resolves the conflict between Langfuse truncation and incomplete
product analytics: Langfuse gets complete trace-safe semantics, while Open
Design keeps complete raw data behind product authorization and retention
policies.

### Attachment and Artifact Registry

Open Design should add a registry layer above `ProjectStorage` instead of
letting traces, filesystem paths, and UI URLs each invent their own storage
semantics. The registry is the product source of truth for durable input and
output objects; Langfuse stores only registry-derived manifest fields.

Recommended object classes:

| Object class | Examples | Registry owner |
| --- | --- | --- |
| `attachment` | Uploaded images, PDFs, brand files, reference assets, pasted files. | User/project input pipeline. |
| `parsed_attachment` | OCR text, extracted PDF text, thumbnails, embeddings, image descriptors. | Attachment ingest worker. |
| `artifact` | HTML prototypes, images, decks, documents, audio/video, code packages. | Agent/tool output pipeline. |
| `preview` | Rendered preview HTML, screenshots, thumbnails, validation captures. | Preview/verification pipeline. |
| `export` | Downloadable bundles, handoff packages, deployment artifacts. | Export/finalize pipeline. |
| `replay` | Minimal reproduction bundle, prompt stack snapshot, selected logs. | Observability/evaluation pipeline. |

Each registry record should have a stable id, object class, workspace/project/run
scope, storage backend, storage key, content hash, MIME type, byte size, origin,
retention policy, sensitivity class, redaction state, parse/build status,
preview/export status when applicable, and provenance back to the source trace
or run.

The storage reference in Langfuse should be durable and non-secret:

```text
od://objects/workspaces/<workspaceId>/projects/<projectId>/runs/<runId>/<objectClass>/<objectId>
```

The daemon should resolve that reference through product authorization and then,
only for interactive viewing or replay, issue a short-lived signed URL or stream
the object through a guarded daemon endpoint. Long-lived signed URLs should not
be written to Langfuse, PostHog, datasets, or PR comments.

The registry should use the existing `ProjectStorage` contract as the first
storage backend boundary, but the product routes need one more layer:

```text
HTTP / CLI / tool route
  -> AttachmentRegistry or ArtifactRegistry
  -> ProjectStorage backend (local by default, s3 when configured)
  -> object manifest event
  -> Langfuse trace-safe metadata
```

This keeps local-first desktop usage intact while making cloud-backed storage an
environment choice rather than a product model fork.

### Score Model

A score-eligible run is a terminal production agent run or accepted-dataset
experiment/evaluation run with enough trace metadata to identify trace id,
dataset item id when applicable, task kind, agent, model, final status, and
timing/token baselines. Local smoke tests and harness-only runs are excluded
unless they are recorded as accepted-dataset evaluation runs. Each eligible run
should receive automatic scores where the signal can be computed safely:

| Score | Meaning |
| --- | --- |
| `task_success` | The run produced a useful terminal result for the requested task. |
| `artifact_valid` | Required artifact files and manifest entries exist and are readable. |
| `preview_ok` | The primary preview renders without fatal runtime errors. |
| `user_request_covered` | The output appears to address the explicit user request. |
| `design_quality` | Automated or rubric-based critique result for visual/product quality. |
| `stability_risk` | Failure, retry, timeout, or brittle-runtime risk bucket. |
| `cost_bucket` | Cost/token use relative to task kind and model baseline. |
| `latency_bucket` | Latency relative to task kind and agent/model baseline. |
| `user_rating` | Human end-user feedback, already reported from the UI. |

Score applicability must be explicit so dashboards and datasets do not confuse
not-applicable scores with failures or evaluator gaps. When a score does not
apply, Open Design should not write a score value; it should record
`score_applicability.<score> = "not_applicable"`. When a score applies but cannot
be computed because required trace fields or evaluator inputs are missing, it
should record `score_applicability.<score> = "insufficient_signal"` and treat the
missing score as an observability gap, not as a failed run.

Accepted-dataset experiment and evaluation runs must reuse the same score fields,
score applicability values, and latency/cost bucket definitions as production
runs. Fixed datasets are the release-gate baseline; other accepted datasets use
the same fields for candidate improvement analysis instead of a separate QA-only
scoring schema.

| Score | Applies to |
| --- | --- |
| `task_success` | All score-eligible production and accepted-dataset experiment/evaluation runs with a terminal result. |
| `artifact_valid` | Artifact-producing score-eligible production and accepted-dataset experiment/evaluation tasks that create, edit, export, or inspect project files with a required manifest or file contract. |
| `preview_ok` | Artifact-producing score-eligible production and accepted-dataset experiment/evaluation tasks whose primary output has a supported preview renderer. |
| `user_request_covered` | Production and accepted-dataset experiment/evaluation tasks with a natural-language request or expected outcome and terminal output to compare. |
| `design_quality` | Score-eligible production and accepted-dataset experiment/evaluation outputs for visual, product, deck, prototype, image, video, audio, or document tasks with an applicable rubric. |
| `stability_risk` | All eligible runs. |
| `cost_bucket` | All score-eligible runs with model and token metadata. |
| `latency_bucket` | All score-eligible runs with timing metadata. |
| `user_rating` | Runs where the user submitted explicit feedback. |

Automatic scores should start conservative. Deterministic evaluators are
preferred before LLM-as-judge. Human feedback and annotation can later calibrate
or replace weak automatic scores.

### Dataset and Experiment Model

Production traces should become evaluation assets through an explicit promotion
path:

- failed traces with clear root cause become regression dataset candidates;
- low-score traces become quality dataset candidates;
- high-cost or high-latency traces become efficiency dataset candidates;
- ambiguous traces enter annotation queues before promotion;
- accepted dataset items retain source trace id, task kind, agent, model, skill,
  design system, prompt stack fingerprint, trace-safe attachment/artifact
  manifests, and expected outcome.

Experiments should run the same dataset against candidate changes such as:

- prompt stack edits;
- skill or design-system changes;
- agent/model routing changes;
- retry and runtime policy changes;
- context compression or cacheability changes;
- evaluator or guardrail changes.

An experiment is successful only when quality, reliability, latency, and cost
are considered together. A lower-cost run that fails the task is not an
improvement.

### Fixed Dataset Trust Contract

Fixed datasets are the trust anchor for human-agent collaboration. Agents can
discover issues, propose prompt/skill/model/runtime changes, and run the
experiments, but humans should not have to accept those proposals on narrative
confidence alone. A fixed dataset gives the team a shared, repeatable evidence
surface before a change reaches production.

For every optimization proposal, the agent should report:

- which fixed dataset or approved provisional baseline was used;
- which candidate changed, including git sha, agent/model routing, prompt stack
  fingerprint, skill/design-system versions, and evaluator version;
- pass/fail status for each blocking quality, reliability, latency, and cost
  metric;
- the concrete traces, dataset items, artifacts, and annotations behind any
  failure or tradeoff;
- whether any sensitive attachment or generated artifact entered the evaluation
  fixture set, and who approved that promotion.

The default trust rule is conservative:

- quality must not regress on fixed task datasets;
- stability must not regress;
- latency and cost must improve or stay flat, unless a human explicitly accepts
  a quality tradeoff;
- sensitive artifact or attachment cases cannot become long-lived fixtures
  without human approval.

This contract turns observability into a collaboration mechanism. The agent does
the repetitive measurement work; the human reviews evidence, calibrates
judgment-heavy evaluators, and approves only the risk that cannot be reduced to
data.

## Human and Agent Responsibilities

The loop is AI Native because agents should operate the routine diagnosis and
validation work, while humans intervene at high-leverage judgment points.

Agent-owned work:

- scan recent traces and dashboards on a schedule;
- rank failures by category, detail, stage, agent, model, OS, and task kind;
- cluster low-score or high-cost traces into failure modes;
- propose dataset and annotation candidates;
- run experiments for candidate prompt, skill, model, or runtime changes;
- summarize pass/fail evidence and tradeoffs across quality, reliability,
  latency, and cost;
- draft optimization PRs or prompt/skill changes when the risk is low.

Human-owned work:

- approve production releases and high-risk behavior changes;
- approve provisional baselines and sensitive fixture promotion;
- label ambiguous or subjective quality cases;
- approve major system prompt, skill, or design-system changes;
- decide quality versus cost tradeoffs when metrics conflict;
- review annotation queues and calibrate evaluators.

The intended working loop is:

```text
agent finds a signal
  -> agent explains the likely cause
  -> agent proposes data/evaluator/prompt/runtime changes
  -> fixed-dataset experiment proves or rejects the proposal
  -> human reviews the pass/fail evidence and approves only the meaningful risk
```

## Metrics

The loop should report progress through a small set of durable metrics.

Quality:

- `task_success` by task kind, agent, model, skill, and design system;
- `preview_ok` and `artifact_valid` for artifact-producing tasks;
- user rating rate and negative-reason distribution;
- annotation agreement or evaluator drift where available.

Reliability:

- terminal failure rate;
- unknown or unattributable failure share;
- retryable failure share and retry success rate;
- failure category/detail/stage distribution.

Latency:

- P50/P90/P99 total duration by task kind;
- slowest segment by queue, prompt build, spawn, first token, generation, tool
  aggregate, verify, and finalize;
- preview and artifact verification duration once those stages are observable.

Cost:

- provider input tokens, effective input tokens, output tokens, and total tokens;
- estimated context tokens and uncached input tokens;
- cache hit ratio and cache source;
- calculated cost when Langfuse pricing supports the model;
- fallback cost bucket when a model has no pricing mapping.

Loop health:

- dataset item count by source and task kind;
- experiment count and pass/fail trend;
- annotation queue throughput and aging;
- number of shipped changes linked to observed trace evidence.

Data completeness:

- share of artifact-producing runs with a valid `artifact_manifest`;
- share of attachment-bearing runs with a valid `attachment_manifest`;
- share of traces with truncated input/output and no compensating summary;
- share of manifests with missing storage references, hashes, or parse/build
  status;
- masked or redacted attachment share by task kind and data class.

## Rollout Slices

### Slice 1: Spec and Baseline

- Land this spec.
- Keep runtime behavior unchanged.
- Document current trace coverage, score coverage, dataset count, and known gaps
  from Langfuse/PostHog.

### Slice 2: Semantic Stage Observations

- Add task-stage observations around existing run lifecycle boundaries.
- Preserve existing trace ids, tags, and low-level observations.
- Emit stage status, duration, and failure metadata so failed traces can be
  grouped by product stage.
- Emit trace-safe attachment and artifact manifests during `brief-intake` and
  `verify-artifact`.

### Slice 3: Object Storage and Manifest Contract

- Define the Open Design object storage contract for attachments, parsed
  derivatives, generated artifacts, preview screenshots, export bundles, and
  reproducibility files.
- Define the registry schema and `od://` reference format for `attachment`,
  `parsed_attachment`, `artifact`, `preview`, `export`, and `replay` objects.
- Store original heavy inputs and outputs in Open Design controlled storage,
  not in Langfuse by default.
- Store durable object references, hashes, summaries, redaction state,
  truncation state, and parse/build status in Langfuse.
- Wire user upload, project files, standalone artifact save, live artifact,
  media generation, preview verification, and export/finalize flows through the
  registry instead of writing unindexed files only.
- Reuse `ProjectStorage` as the backend adapter boundary: local remains the
  default, while S3-compatible storage is enabled by environment configuration
  once product authorization, retention, and signed inspection URLs are in
  place.
- Add masking before Langfuse ingestion so raw sensitive content cannot leak
  through input, output, or metadata fields.

### Slice 4: Automatic Evaluators

- Add deterministic scores for artifact validity, preview success, task success
  proxy, latency bucket, and cost bucket.
- Keep evaluator failures non-blocking.
- Write scores back to Langfuse and mirror aggregate fields to PostHog where
  dashboarding needs them.

### Slice 5: Dataset and Annotation Promotion

- Add an agent-operable workflow that proposes dataset items from failed,
  low-score, high-cost, and high-latency traces.
- Route ambiguous quality cases to Langfuse annotation queues.
- Preserve provenance from dataset item back to source trace and accepted human
  annotation.
- Preserve trace-safe manifest references for attachments and artifacts; require
  human approval before promoting sensitive raw attachments or artifacts into
  durable evaluation fixtures.

### Slice 6: Experiment and Release Gates

- Define fixed task datasets for core task kinds.
- Run experiments before prompt, skill, model-routing, retry, or context changes
  are treated as durable wins.
- Gate releases on quality not regressing while reliability, latency, or cost
  improves.
- Treat fixed-dataset pass/fail evidence as the default trust artifact for
  product and engineering review.

The release gate should use a fixed comparator so the same experiment result
produces the same pass/fail decision across implementations:

| Gate field | Rule |
| --- | --- |
| Baseline comparator | Compare the candidate against the latest approved release on the fixed dataset for each affected task kind. If no fixed dataset exists yet, compare against the last 14 days of production traces promoted into the baseline window and block shipping until a maintainer approves that provisional baseline. |
| Blocking quality metrics | `task_success`, `user_request_covered`, and applicable `artifact_valid` / `preview_ok` / `design_quality`. Any blocking quality metric regressing by more than 1 percentage point, or producing one additional critical artifact failure in a fixed regression dataset, blocks the release. |
| Blocking reliability metrics | Terminal failure rate, unknown failure share, retryable failure share, and retry success rate. A candidate fails if terminal or unknown failures increase by more than 1 percentage point, or if retry success drops by more than 2 percentage points. |
| Blocking latency and cost metrics | P90 total duration and total token or calculated cost by task kind. A candidate fails if either P90 latency or cost increases by more than 5% without an explicit human-approved quality tradeoff. |
| Advisory metrics | P50 latency, P99 latency, cache hit ratio, annotation throughput, dataset growth, and user rating volume. These must be reported with the gate result but do not block by themselves. |
| Improvement threshold | A candidate qualifies as an improvement only when all blocking metrics pass and at least one blocking reliability, latency, or cost metric improves by 5% or more, or one documented failure category is eliminated on the fixed regression dataset. |

### Slice 7: Agent-Operated Optimization Loop

- Schedule an agent report that ranks the most important quality, reliability,
  latency, and cost opportunities.
- Let agents draft low-risk improvement PRs with linked trace, dataset, and
  experiment evidence.
- Require human approval for high-risk prompts, guardrails, model-routing, and
  product-quality decisions.

## Relationship to Existing Plans

`specs/current/run-reliability-optimization-plan.md` remains the concrete plan
for reducing failures and optimizing latency/token cost after the first
observability slice. This spec is the higher-level loop that makes that work
repeatable and connects it to quality evaluation, datasets, experiments,
annotation, and human-agent collaboration.

`specs/current/automation-self-evolution.md` describes how successful runs and
sources can promote durable memory, skills, design systems, and automation
templates. This observability loop provides the evidence and gates for deciding
which proposed evolutions are trustworthy.

## Non-goals

- This spec does not replace Langfuse or PostHog.
- This spec does not make Langfuse the storage layer for original user
  attachments or generated artifact packages.
- This spec does not add a new model router.
- This spec does not require all evaluators to be LLM judges.
- This spec does not implement runtime changes in the spec-only PR.
- This spec does not make agents auto-ship high-risk changes without human
  approval.

## Acceptance Criteria for Follow-up Implementation

The loop is working when a representative production regression can be handled
end to end:

1. A bad run produces a trace with a clear failing task stage.
2. Attachment and artifact manifests include trace-safe summaries, hashes,
   storage references, truncation state, and redaction state when applicable.
3. Automatic or human scores identify the quality, stability, latency, or cost
   problem.
4. The trace is promoted to a dataset item or annotation queue with provenance.
5. An experiment compares a proposed fix against the accepted dataset.
6. The result summarizes quality, reliability, latency, cost, and data
   completeness tradeoffs.
7. A human approves high-risk changes or the agent proceeds with a low-risk
   improvement.
8. Online dashboards confirm the improvement after release.
