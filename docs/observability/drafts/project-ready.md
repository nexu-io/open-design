> Historical draft. The integrated definitions, wiring, and current limitations
> are in [stability-metrics.md](../../telemetry/stability-metrics.md); that document supersedes this draft.

# Project entry → Ready (historical draft, not reviewed / not published)

This file records a candidate measurement definition for this branch. It is not a
public contract, QA gate, or production acceptance criteria.

## Measurement boundary and Ready

- Path: shared project open handler → workspace/project reads before navigation →
  route commit → ProjectView business data and authority ready → next foreground
  animation frame while still actionable → Ready.
- Start: synchronous enter of the project-open handler, before the first `await`,
  using `performance.now()` — not component mount and not URL update.
- Ready: project detail and scope loaded; conversation and current-authority
  messages loaded successfully; messages belong to the current conversation;
  existing send / new-conversation gates allow action. Background tabs do not
  report Ready; re-check after returning to the foreground. The animation frame
  is a post-commit actionable check; it does not claim pixels painted or iframe
  preview completion.
- Explicit errors (open, detail/scope, conversation/message reads) report
  `failed`. Read-only, materialization waits, and billing-identity-not-ready
  states must not be reported as Ready. There is no fixed timeout; unfinished
  `started` attempts must be counted as missing measurements, not dropped or
  treated as success.
- Read-only access does not meet this “actionable” definition and is excluded
  from Ready quantiles unless a separate readable-Ready group is approved later;
  do not fill with 0 ms.
- Cancel: a newer click supersedes an older one (including the same project),
  leaving the source page / loading project, or page exit. Late requests, late
  frames, and duplicate effects must not emit Ready for a stale attempt.
- Same-project conversation selection is tagged `conversation_switch`. Programmatic
  conversation restore must not invent a user choice. Ordinary file-tab URL sync
  does not create a project-entry attempt. First direct load / refresh has no
  proven click start and does not emit project entry; launch Ready is defined
  separately in the launch metrics.

## Local candidate event (needs shared schema alignment)

Event `client_navigation_result`: one `started` and at most one terminal
`ready` / `cancelled` / `failed`, sharing `navigation_id`. `duration_ms` uses the
same monotonic origin; `started` is 0.

| Field | Local meaning |
| --- | --- |
| navigation_id | New per real intent; terminal association / dedupe key |
| navigation_type | `project_entry` / `conversation_switch` (query separately) |
| source_type / target_type | Fixed page kinds (home subpages fold into source_type); target project / conversation |
| status | started / ready / cancelled / failed |
| duration_ms | Intent to this status, ms; never treat cancelled as a fast success |
| reason | Fixed reason enum; no exception text / paths / prompts |

Target project/conversation IDs are process-local matching only; do not add new
identity fields to the report. Shared identity, version, env, schema, sampling,
and launch attempt linkage come from the shared telemetry envelope work — this
branch does not hand-copy those public fields.

## Statistics sketch

- Unit: observable navigation attempts; dedupe `(navigation_id, status)`; at most
  one terminal per id. Keep project entry and conversation switch separate.
- Success latency: only terminal `ready` `duration_ms` (P50/P90 and success N);
  also report distinct started N, failed N, cancelled N, unterminated N, and coverage.
- Success-rate denominator should list all `started`; optionally also report
  success excluding explicit user cancel, always with cancel rate. Bucket by
  `started` time across windows and leave a settle window so terminal-only queries
  do not drop hanging attempts.
- Account / install / version / platform / channel splits depend on shared public
  fields; do not invent SQL or claim live values before alignment.
- Live values, published builds, and warehouse evidence: not measured here. Local
  mock unit tests do not prove production wiring.

## Validation and remaining integration

Write `navigation-timing.test.ts` (module-missing red) before implementation.
Focused wiring tests cover cancel, navigate-away, re-entry, late async completion,
message load/fail, materialization block, conversation select, background→foreground,
StrictMode replay, and Ready dedupe. Full web/daemon suites and publication are
out of scope for this draft.

Needs separate owners for: shared event union / field names / schema / env identity /
dedupe; launch attempt correlation and independent launch business Ready; router
guard cancel callback when a navigation is rejected or superseded (unterminated
`started` must not count as success until wired). Ordinary page switches, first
create/import/duplicate, and external deep links that do not use this click entry
are not claimed as covered.

Open product questions (for maintainer review, not assumed decided): whether
strict actionable Ready is the final business definition; whether read-only or
intentionally restricted “running but cannot create” states get a separate group
or a readable-Ready metric. Packaged macOS/Windows QA on slow networks, failures,
and cancels, plus post-publish warehouse evidence, remain future work.
