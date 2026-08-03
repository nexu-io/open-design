---
name: critique-theater
description: Five-role Design Jury review that streams scored rounds, persists a replayable transcript, and ships through the daemon's Critique Theater protocol.
od:
  scenario: general
  mode: critique
---

# Critique Theater

**Design Jury** is the user-facing name for Critique Theater. When the daemon
enables it for an artifact-generating run, it appends the active protocol,
brand source, thresholds, and weights to the agent prompt. The agent then plays
the fixed v1 cast — Designer, Critic, Brand, Accessibility, and Copy — as turns
inside the same CLI session.

## Runtime contract

- Follow the daemon-injected tagged protocol exactly: one
  `<CRITIQUE_RUN>` envelope containing `<ROUND>`, `<PANELIST>`,
  and `<ROUND_END>` blocks and, only after a ship decision, one final
  `<SHIP>` block. Do not emit prose outside the envelope.
- Designer drafts the artifact. Critic, Brand, Accessibility, and Copy score
  their own scopes and record actionable `<MUST_FIX>` items. The cast is fixed
  in v1; a plugin does not replace it with a custom list of axes.
- The daemon parses the stream incrementally into typed `PanelEvent` variants
  and publishes them on `critique.*` SSE channels. It recomputes the composite
  from the scoring panelists, so an agent-supplied composite is advisory.
- Do not write `critique.json` in the project cwd or emit a
  `kind: "critique-panel"` object. Those were the pre-orchestrator shape and
  are not inputs to the current runtime.

## Convergence and persistence

The default review uses a 0–10 scale, an 8.0 ship threshold, and at most three
rounds. A round ships only when its daemon-computed composite reaches the
configured threshold **and** no open must-fix items remain. The active values
come from `OD_CRITIQUE_*` configuration, including
`OD_CRITIQUE_MAX_ROUNDS`, `OD_CRITIQUE_SCORE_THRESHOLD`, and the fallback
policy.

`OD_MAX_DEVLOOP_ITERATIONS` still caps an outer plugin pipeline stage; it is
not the Design Jury round limit or ship rule. Likewise, a pipeline's
`critique.score` signal is a scheduler-facing projection, not the wire output
the agent should manufacture.

The daemon stores the terminal run and per-round summaries in SQLite and
writes the ordered `PanelEvent` stream as a replayable NDJSON transcript
(gzip-compressed when large). Final artifact bytes are stored separately; the
`ship` event carries only an `artifactRef`.

## Interrupting a run

The web Design Jury surface exposes **Interrupt** and an Esc shortcut. After
the user triggers either, the web app posts to
`/api/projects/:projectId/critique/:runId/interrupt`; the daemon aborts the
registered run, persists the partial best-so-far state, and emits
`critique.interrupted`. `od ui respond` handles GenUI surfaces and does not
provide a `break-loop` action for Critique Theater.
