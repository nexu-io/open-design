# AMR context compaction visibility and recovery

## Problem

Long AMR conversations can exceed a provider context limit. OpenCode can recover by
summarizing its session and continuing, but Open Design currently presents the first
overflow as a terminal error or waits without explaining what is happening. Clearing
the durable session avoids repeated overflow but loses useful context.

This change is intentionally limited to the AMR path:

```text
Open Design -> Vela ACP bridge -> bundled OpenCode -> model provider
```

Pi, Claude Code, Codex, and direct OpenCode adapters are out of scope and must not
emit a synthetic compaction lifecycle until their native completion contracts have
separate executable validation.

## Goals

- Keep a recoverable OpenCode overflow non-terminal while native compaction runs.
- Show a compact, indeterminate activity row with truthful elapsed time.
- Persist the completed or failed activity across conversation reloads.
- Continue the same run after successful compaction without exposing summary text.
- Bound recovery so a missing native event cannot leave the UI hanging forever.
- Record enough privacy-safe telemetry to diagnose duration, errors, token reduction,
  post-compaction output, and frontend rendering correctness.

## Non-goals

- A percentage or ETA when OpenCode exposes no work denominator.
- An Open Design-owned summarizer or automatic fresh-session reset.
- Compaction visualization for non-AMR agent adapters.
- Persisting prompts, compact summaries, provider bodies, or attachment content.

## Runtime contract

Vela maps the bundled OpenCode event stream to an additive ACP update:

```json
{
  "sessionUpdate": "context_compaction",
  "status": "in_progress | completed | failed",
  "trigger": "context_overflow | proactive | manual | unknown",
  "tokenCountSource": "native | usage_snapshot | estimated | unavailable"
}
```

OpenCode recovery follows this state machine:

```text
idle
  -> overflow_observed
  -> compacting
  -> compacted
  -> resumed
```

Terminal failures are `context_recovery_not_started`,
`context_compaction_timeout`, `context_compaction_overflow`, and
`context_recovery_interrupted`.

Only structured `ContextOverflowError` or exact provider codes
`context_length_exceeded`, `request_too_large`, and `prompt_too_large` enter the
recoverable path. Other provider errors remain terminal. The default bounds are 10
seconds for observing compact start and 180 seconds for native completion.

`session.compacted` is the only success signal. Assistant text does not imply that
compaction committed. Vela does not delete the durable session when recovery fails.

## Open Design lifecycle

OD normalizes the ACP update into a correlated `context_compaction` activity. The
daemon assigns an ID containing run and attempt identity, persists the event on the
assistant message, and enforces first-terminal-wins. If a run or retry ends with an
active activity, the daemon emits one failed terminal rather than inventing success.

The normalization boundary allowlists lifecycle metadata and drops adapter-provided
detail text. The compact summary is never an assistant message and never enters
analytics.

## UI

While active, the assistant turn shows an indeterminate context-compression motif,
the label **Compacting context**, preservation copy, and increasing elapsed time.
There is no progress percentage or ETA.

On completion it becomes a quiet history row, **Context compacted · duration**, and
normal assistant output continues below it. Failure uses the same compact row while
the existing typed run error remains authoritative. Reduced-motion mode disables
continuous transforms without removing status or timing information.

## Observability

Backend lifecycle events:

- `agent_context_compaction_started`
- `agent_context_compaction_completed`
- `agent_context_compaction_failed`

Frontend reconciliation event:

- `context_compaction_ui_result`

Properties include run/conversation/agent/runtime identity, activity ID, trigger,
duration availability, terminal source, normalized failure reason, token-count source,
before/after values when native values exist, and whether output followed completion.
The frontend records live-versus-history render source, expected/rendered phase,
elapsed visibility, reduced-motion state, and time to visible.

No prompt, summary, raw error body, credential, attachment, or model response content
is permitted in these events.

## Acceptance criteria

1. A structured recoverable overflow does not immediately fail the AMR run.
2. Compact start produces a visible active row within the next streamed event.
3. `session.compacted` settles the same activity and the run can continue output.
4. Reload preserves phase and measured duration.
5. Missing start, missing completion, second overflow, and interruption terminate with
   distinct typed failures within configured bounds.
6. Summary text is absent from ACP output, persistence, DOM, accessibility text, and
   analytics.
7. Reduced-motion mode has no continuous animation.
8. Non-AMR adapters retain their existing behavior and emit no new lifecycle.

## Release validation

- Run focused contract, daemon ACP/lifecycle, web component, typecheck, and guard tests.
- Build the Vela release artifact and verify its embedded OpenCode version matches
  `apps/cli/bundles/opencode.lock.json` (`1.15.10` at the time of this spec).
- Against a fresh isolated data root and local fake provider, reject the first main
  request with structured overflow, accept the summary request, then accept the
  continuation. Require start, exactly one terminal, resumed output, and no summary
  leakage.
- Repeat no-start and no-completion watchdog cases against the packaged artifact.
- Never use a teammate's production session for these smokes.

Current packaged evidence: the `OpenCode 1.15.10` smoke completes the structured
overflow, summary, and synthetic continuation sequence; emits compact start and
completion; relays resumed assistant output through Vela; and does not expose the
private summary in ACP output.

## Rollback

Vela event emission and OD rendering are additive and can be reverted independently.
Older clients safely ignore persisted activity events. Keep the existing guarded
fallback until packaged recovery passes end to end.
