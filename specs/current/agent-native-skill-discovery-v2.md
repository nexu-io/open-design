# Agent-native Skill Discovery — V2 execution and evaluation

## Scope

This branch supersedes the ordinary-turn v1 adapter design. Discovery is an
instruction Skill supplied on every task's first turn while the feature is
enabled. The Agent selects from the complete official metadata catalog and
reads only relevant bodies. No Host keyword classifier, extra routing-model
turn, mandatory per-turn discovery call, or stop-after-first-load is introduced.
Explicit client choices remain constraints. Explicit Chat/Plan modes retain
their own execution boundaries; a Skill load never changes the Host protocol.

## Real V2 admission

Design tasks enter V2 before the first Agent process starts. They retain the
canonical XML Bundle with Markdown leaves, Core Strategy, general orchestration,
frozen input snapshot, capability preflight and existing native continuation.
The user sees one conversation; request and production are internal stages.

Typed bindings keep their selected profile and exact identity checks. An unbound
binding instead declares `selectionMode: agent-discovery`, a null selected
profile, all four verified available profiles, the generic profile version and
catalog revision. Its package and input snapshot are frozen before execution;
loading a Skill does not rewrite either identity mid-turn.

The request Bundle includes `session_skills/discovery_skill` with policy and
official metadata. An unbound Bundle omits `task_type_skill`; it does not insert
an empty or invented generic Skill. The primary bodies come from the real V2
profiles, not separate ordinary adapters. The 60 imported templates remain
byte-identical to their pinned source commit.

## Agent decisions and terminal outcomes

- Primary artifact task: load the suitable profile, optionally load auxiliaries,
  write a Plan with `skillDecision`, then emit `plan_ready`. The Host checks
  catalog revision, same-task ledger receipts, IDs, roles and digests before
  freezing the Plan and continuing production in the same native session.
- Existing Direct Edit eligibility remains available, but Discovery-enabled
  Direct Edit also requires a same-task committed primary receipt matching the
  frozen profile and explicit client choice. It has no Plan Contract.
- No primary, artifact needed: load any suitable auxiliaries, resolve primary
  `none`, and use generic V2 Plan → Production with the existing real-file
  deliverable checks, not Direct Edit. Generic is an internal execution contract,
  not a candidate.
- Answer only: the Agent resolves primary `none`, provides a visible answer,
  emits `answered` on a Full Plan request with null execution mode and no Plan.
  The Host validates this explicit terminal state and successful physical exit;
  it does not infer completion from exit 0. Auxiliary reads are allowed.
- Material ambiguity: ask through the question form and emit
  `clarification_required`. A `resolve --clarify` tool call alone does not prove
  that a relevant question was asked or that execution stopped for an answer.

The accepted Plan freezes the primary route and the planning-time selection.
Production may still discover or deactivate auxiliaries. Historical reads stay
in the ledger; deactivating a wrongly read Skill does not erase its evaluation
impact. Normal typed completion, cancellation, stage locks and post-Build
boundaries are not relaxed by generic or answered support.

## ODEval integration boundary

ODEval opts in per Run configuration with `entryMode: agent-skill-discovery`.
Phase one uses one original text query, AMR, an explicit model and a branch
pinned to an exact commit. No task type, primary Skill, template, forced strategy,
automatic form answer or ground-truth instruction is submitted to the Agent.
Nodes must advertise verified collector support and receive platform AMR
credentials. Existing evaluation configurations remain unchanged when the field
is absent.

The read-only local diagnostic surface is
`GET /api/diagnostics/skill-discovery-catalog`, mirrored by
`od skill discovery-catalog --json`. It exposes the product-owned metadata,
policy, revision, transport/recipe identity and orchestration digests. It does
not load Skills or create run receipts. Runtime data derives from the root
[AGENTS.md daemon data directory contract](../../AGENTS.md#daemon-data-directory-contract).

The evaluator observes the whole natural logical task. A successful read needs
the official catalog/body digests, a same-task committed ledger event, the full
body in native completed tool output, and subsequent model execution. This proves
availability and continuation, not comprehension. All physical continuations
are included through exact captured native-session hashes and their child
sessions, never merely a shared working directory; native message usage is
deduplicated. Missing evidence, wrong
commit/model, runtime failures and protection-triggered stops are incomplete,
not successful routing. Existing inactivity/physical-run protections remain;
there is no added token budget or select-only prompt.
An observation failure exports the scoped evidence already collected and marks
the case interrupted/incomplete. The normal owner may then tear down the runtime;
this state does not promise automatic recovery or a naturally completed task.

## Statistics and release evidence

Discovery Run details link to an independent statistics page with Precision,
Recall, F1, primary and determinate auxiliary slices, per-query expected/actual
Skills, missed/extra/optional/unknown reads, coverage and execution failures.
Terminal Runs initialize their first statistics snapshot idempotently on first
open. Reviews and rescoring append immutable snapshots; old scores, original
ground truth and artifact-quality evaluations are not overwritten.

The original 100-query gold set is versioned against its original catalog. A
changed V2 policy/profile catalog requires a new reviewed manifest before a real
batch is scored. The first set covers only three mandatory auxiliary Skills,
so its metrics cannot establish recall for all 60 templates. Synthetic local
tests validate integration and arithmetic, not real-model routing accuracy.
