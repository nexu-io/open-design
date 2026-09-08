# OD Next adaptive execution

## Approved behavior

New OD Next tasks use `od-next-adaptive-v1`. The main Agent decides whether an
explicit plan is useful and how detailed it should be, then executes immediately
within the same physical Run. Simple requests execute directly. Plans and
progress reuse existing native todo rendering. Explicit plan-only, discussion-only,
and approval-before-execution requests remain binding.

Only decisions that affect the user's goal, scope, or authorization require user
input. Each necessary answer resumes the same task and native session; another
necessary question is allowed. No automatic production or contract-repair Run is
created. The Agent may reorganize work or use available native children without
changing the requested scope or selected runtime. Ship-on-write remains in force:
this change does not add Agent post-generation review or repair loops.

## Implementation and compatibility

1. Freeze the execution recipe in each applied snapshot. Existing plan/build V2
   task snapshots, prompts, and transitions retain their original semantics.
2. Give adaptive tasks request/clarification states with completion, waiting, or
   blocked outcomes; no route, execution mode, or full Plan Contract is required.
   Keep the old V2 validation strict and migrate storage without rewriting history.
3. Route new prompts and streamed status through the adaptive policy. Finalize
   directly from delivery evidence or a renderable question. Physical process exit
   alone does not prove completion; answer/plan delivery must be explicit.
4. Reuse the existing HTTP, Web form/progress, and CLI task continuation surfaces.
   Preserve idempotency, cancellation, frozen input identity, and run lineage.
   Adaptive user-question rounds retain their own assistant message identities
   through streaming, reload, and conversation forks; legacy automatic Runs
   retain their existing folded presentation.

## Verification

- Unit coverage: policy isolation, streamed status boundaries, request completion,
  plan-only completion, repeated questions, invalid completion, and storage migration.
- Real daemon/browser canaries: one Run delivers an artifact; two question answers
  resume the same task without automatic production; plan-only delivers no HTML.
- Existing frozen V2 tests retain the two-stage contract and clarification limit.
- Run guard, typecheck, and affected package checks against the final diff.

These checks establish functional behavior and compatibility. Representative model
quality, completion, cost, and latency comparisons remain required before wider
rollout; a mocked provider or a single successful real generation is not evidence
of model-quality improvement.

## Initial acceptance (2026-09-08)

Implemented from main `21fffb86007efe4350a837390c8f46fe791d21ed`.
Repository guard and typecheck passed. The daemon's policy, protocol, persistence,
resource-freezing, and runtime-capability checks passed, including a full-schema
legacy database reopen and continued execution against its original frozen recipe.

The real daemon/Chromium canaries in
`e2e/ui/real-daemon-run.test.ts` passed with a simulated OpenCode CLI:

- A visible plan and delivered artifact use exactly one physical Run.
- A requested plan finishes in one Run without generating HTML.
- Two necessary user decisions preserve the same task and native session across
  three physical Runs. Reload restores two confirmed answer summaries and no
  unanswered form. No automatic production Run is created.

These are deterministic orchestration and interface checks. No real-provider
quality, cost, or latency comparison was performed for this implementation.

## Target-branch integration

The PR targets `mason/od-next-strategy-v2` at
`131ee3e7289f0d56a1342789f0a992499d288a9c`, not main. It preserves that branch's
active rollout default, Image task routing and optional Image rule card, tool
batching/input reuse, and on-demand media-input Skill guidance. The latter's
legacy planning-stage restrictions are replaced by the current user authorization
and ship-on-write boundaries.

This base predates main's keyed chat completion and newer chat UI. Completed
plan/answer delivery therefore requires the strict adaptive completed outcome,
a successful physical Run, and non-empty visible delivery text, using the target's
existing chat surface. No unrelated chat redesign or Deck Protocol migration is
backported. The target already forks at the clicked assistant message; adaptive
question rounds retain that behavior without introducing main's fork helper.

The initial acceptance above describes the main-based implementation. Target-branch
checks and browser evidence are reported separately in the PR so results from the
two code lines are not conflated.
