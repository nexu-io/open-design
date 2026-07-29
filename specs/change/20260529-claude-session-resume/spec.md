---
id: 20260529-claude-session-resume
name: Claude CLI Session Resume
status: proposed
created: '2026-05-29'
---

## Overview

Every chat turn in a conversation spawns a fresh, context-free `claude -p`
process and re-sends the entire conversation as a recomposed transcript. The
process never resumes the prior turn's Claude Code session, so each turn pays
to re-read project files, re-process the full history, and forfeits any
cross-turn prompt-cache hits. On long conversations the per-turn payload grows
O(N) in turns. (Reported externally: "every message starts a new Claude Code
session, re-sends prompt/history, re-reads project files → token waste.")

This is a deliberate trade-off, not a defect — the recompose-transcript model
buys uniform behavior across ~15 heterogeneous adapters, full daemon control of
per-turn prompt composition, and a single daemon-owned source of truth. But the
project's cited architectural inspiration, [multica](https://github.com/multica-ai/multica),
runs the *same* `claude -p --output-format stream-json` base invocation and yet
resumes the CLI's own session via `--resume <session_id>` with a small set of
guards. multica demonstrates that session resume is compatible with this daemon
architecture when the invalidation edges are handled explicitly.

Goal: add an **opt-in, Claude-first, best-effort** session-resume path that, on
a qualifying follow-up turn, passes `--resume <session_id>` and sends only the
latest user message instead of the full transcript — while never removing the
transcript path that remains the correct behavior for every other adapter and
for any turn that fails the resume guards.

Constraints:
- Do not regress any existing behavior. Resume is best-effort: when a guard
  fails, the capability is absent, or `--resume` is rejected at runtime, the
  daemon falls back to today's full-transcript spawn for that turn.
- Do not break the interactive `stream-json` / `AskUserQuestion` machinery
  (`pendingHostAnswers`, `POST /api/runs/:id/tool-result`).
- Keep the daemon the source of truth: the stored session pointer is a cache
  keyed on daemon-owned conversation state, never the authoritative history.
- Claude-only in v1. Other adapters keep `resumesSessionViaCli` unset and the
  transcript path unchanged.
- Honor the UI/CLI dual-track rule: a force-fresh control must exist on both
  the web composer and the `od` run path.

Open questions:
- Should resume default on for Claude, or ship behind a per-project opt-in for
  one release while we gather token-savings telemetry? (Leaning: default on,
  with a force-fresh escape hatch — see Design Decisions.)
- Should a resumed turn show a small "continuing session" affordance in the
  chat UI, or stay invisible? (Leaning: telemetry only in v1, no UI badge.)
- Do we extend the same machinery to other resumable CLIs (codex, cursor-agent)
  in a follow-up, gated per-adapter? (Out of scope here.)

## Research

### Existing System

- Claude's `buildArgs` emits no session flag; every spawn is a cold start.
  Source: `apps/daemon/src/runtimes/defs/claude.ts:45-74`
- The daemon already parses `session_id` from Claude's `system/init` line and
  emits it as a `status` event, but it is only streamed to the client.
  Source: `apps/daemon/src/claude-stream.ts:91`
- `session_id` is never persisted: the persisted-event mapper drops it, and the
  `messages` table has no session column.
  Source: `apps/daemon/src/db.ts:86-103` (schema), the status-event branch of
  `daemonAgentPayloadToPersistedAgentEvent` in `apps/daemon/src/server.ts`
- Per-turn context is recomposed client-side into a markdown transcript and
  sent as `message`; `currentPrompt` carries only the latest user turn.
  Source: `apps/web/src/providers/daemon.ts:171-185` (`buildDaemonTranscript`),
  `:326-330` (call site)
- The daemon already has the seam to send only the latest turn: when
  `def.resumesSessionViaCli === true`, `composeChatUserRequestForAgent` skips
  the transcript and sends `currentPrompt`.
  Source: `apps/daemon/src/server.ts:2542-2571`, `:10985-10989`
- `RuntimeContext.hasPriorAssistantTurn` is already computed per run and passed
  into `buildArgs` — the hook a resume flag would read.
  Source: `apps/daemon/src/runtimes/types.ts:19-29`, `apps/daemon/src/server.ts:11322,11376`
- The transcript is already scoped to the active agent and sanitized for prior
  `<question-form>` markup — work that only applies to the daemon-owned
  transcript, not to a CLI-held session.
  Source: `apps/web/src/providers/daemon.ts:127-136` (`scopeHistoryToAgent`),
  `:150-169` (`sanitizePriorAssistantTurnForTranscript`)
- The capability-probe pattern (probe `claude -p --help`, set a capability flag,
  gate the arg) already exists for `--include-partial-messages` / `--add-dir`.
  Source: `apps/daemon/src/runtimes/defs/claude.ts:16-24,58-71`

### Reference Implementation (multica)

multica runs the same base invocation and resumes via `--resume`, persisting
and re-injecting a per-(agent, issue) session id with guards that map directly
onto OD's edges:

- Same base argv, plus conditional `--resume`.
  Source: `multica/server/pkg/agent/claude.go:483-519` (`--resume` at `:513-514`)
- Resume only when not a forced rerun, and only when the prior session ran on
  the **same runtime** as the claiming task; excludes poisoned sessions; falls
  back to the last task that recorded a session id.
  Source: `multica/server/internal/handler/daemon.go:1306-1360`
- session id captured from the `system` message and pinned mid-flight to the
  task row.
  Source: `multica/server/internal/daemon/client.go:248` (`PinTaskSession`)
- A "Focus on THIS comment" prompt guard defends against the resumed session
  inheriting the prior turn's completion marker.
  Source: `multica/server/internal/daemon/prompt.go`

### Why OD diverged (product characteristics that shape this design)

OD is a synchronous, interactive design-chat, not an async issue/task runner.
These traits are why resume must be guarded rather than unconditional, and why
it stays Claude-first and opt-out-able:

1. **Interactive mid-turn tools.** OD keeps `stream-json` stdin open to answer
   `AskUserQuestion` with a real `tool_result`. multica disables it
   (`--disallowedTools AskUserQuestion`). Resume must not disturb this path.
2. **Per-turn prompt rewriting.** OD recomposes the system prompt + skills +
   memory + design system into the `# Instructions` block of the stdin user
   message every turn. Because the instructions ride the stdin message (not a
   one-time `--append-system-prompt`), they still reach the model on a resumed
   turn — so OD keeps prompt control *and* gets resume. This is the key reason
   OD can adopt resume where the antigravity `-c` path could not: `agy -c`
   activated an internal agentic loop OD could not steer
   (`apps/daemon/src/runtimes/defs/antigravity.ts:189-204`); `claude --resume`
   still consumes the fresh stdin turn.
3. **Mid-conversation agent switching.** OD lets a user switch active agent per
   conversation; a Claude session id is meaningless to Codex. Mirror multica's
   runtime-match guard.
4. **User-editable history.** OD supports retry-from-message and editing prior
   turns. Claude's session is an immutable replay; once OD's history diverges
   from what produced the session, the session is stale. multica has no direct
   analog, so OD needs an extra epoch guard.
5. **Heterogeneous fleet.** Most adapters have no compatible resume. Resume is a
   per-adapter opt-in; the transcript path stays the default everywhere else.

### Constraints & Dependencies

- Contracts-first: any new request/response field lands in
  `packages/contracts` before web/daemon wiring (`AGENTS.md` contract rule).
- SQLite migration discipline: additive, backward-compatible schema only.
- Capability probe must gate `--resume` so forks lacking it (e.g. openclaude)
  never receive it (`fallbackBins` includes `openclaude`).

### Key References

- `apps/daemon/src/runtimes/defs/claude.ts`
- `apps/daemon/src/claude-stream.ts:91`
- `apps/daemon/src/server.ts:2542-2571,10985-10989,11322,11376`
- `apps/daemon/src/runtimes/types.ts:19-29,45-54,149-155`
- `apps/web/src/providers/daemon.ts:127-185,326-330`
- `apps/daemon/src/db.ts:86-103,888-908,1031-1050`
- multica: `server/pkg/agent/claude.go`, `server/internal/handler/daemon.go:1306-1360`

## Design

### Architecture Overview

Three additions, all behind a Claude-only capability gate:

1. **Capture + persist** the Claude `session_id` (already parsed) keyed on
   `(conversationId, agentId)`, plus a `historyEpoch` snapshot, the run's
   `workDir`, and a `runtimeId` runtime-identity fingerprint. Update on run
   success. Two distinct guards ride these fields:
   - `workDir` is a **cwd-scope guard**, not just the spawn cwd: Claude Code
     sessions live under a per-cwd path, so `claude --resume <id>` is only
     meaningful from the same working directory that produced the session —
     `resolveResumeDecision()` rejects a pinned row whose `workDir` differs from
     the current run's.
   - `runtimeId` is the OD analog of multica's **"same runtime" guard** (multica's
     guard is about the *producing runtime*, not just the cwd). The Claude adapter
     can resolve through different binaries/forks (`fallbackBins` includes
     `openclaude`, Research lines 140-141), and a session created by one
     executable is not guaranteed resumable by another. `runtimeId` is a small,
     stable fingerprint of the resolved runtime (e.g. the resolved bin path plus
     its `--resume` capability probe result); `resolveResumeDecision()` rejects a
     pinned row whose `runtimeId` differs from the current run's resolved runtime,
     so a mid-conversation binary/fork swap falls back to a transcript spawn
     rather than attempting `--resume` against a foreign session.
2. **Decide** at run start whether to resume: a pure `resolveResumeDecision()`
   helper that returns a `sessionId` only when every guard passes.
3. **Apply**: when resuming, `buildArgs` appends `--resume <id>` and the prompt
   composer sends only `currentPrompt` (existing `skipTranscript` seam) plus an
   anti-echo guard line. On runtime rejection, fall back to a transcript spawn.

```
turn N:   claude system/init → session_id  ──pin──▶ conversation_agent_session
                                                     (conv, agent, sid, epoch, wd, rt)
turn N+1: resolveResumeDecision(conv, agent, epoch, forceFresh, caps)
            │ pass → buildArgs(+--resume sid) + skipTranscript + anti-echo guard
            │ fail → today's full-transcript cold spawn
          claude --resume rejects sid? → one retry: transcript cold spawn
```

### Change Scope

- `packages/contracts`: add `forceFreshSession?: boolean` to the chat/run
  request DTO; add `sessionResumed?: boolean` to run status/telemetry shape.
- `apps/daemon/src/db.ts`: add a `conversation_agent_epoch` table keyed on
  `(conversation_id, agent_id)` with `history_epoch INTEGER NOT NULL DEFAULT 0`
  (the live **agent-scoped** epoch, bumped only when a mutation affects *that
  agent's* scoped history — edit / truncate / retry of a turn inside
  `scopeHistoryToAgent`'s slice for that agent); new `conversation_agent_session`
  table + queries (its `historyEpoch` column records the epoch a session was
  *pinned under*, distinct from the live `conversation_agent_epoch.history_epoch`;
  its `runtimeId` column records the runtime fingerprint a session was *produced
  by*); stop stripping `session_id` so it reaches the pin path.
- `apps/daemon/src/runtimes/types.ts`: extend `RuntimeContext` with
  `resumeSessionId?: string`; add `supportsSessionResume` capability key.
- `apps/daemon/src/runtimes/defs/claude.ts`: probe `--resume`; emit it when
  `runtimeContext.resumeSessionId` is set.
- `apps/daemon/src/server.ts`: `resolveResumeDecision()`, pin-on-success,
  resume-aware `skipTranscript`, anti-echo guard line, runtime-rejection
  fallback.
- `apps/web/src/`: force-fresh control in the composer; on a history
  edit/truncate/retry, bump the live epoch of **every agent whose
  `scopeHistoryToAgent` output changes** as a result of the mutation — defined by
  diffing each agent's scoped slice before vs after, not by which agent's slice
  literally contains the mutated turn. This matters because `scopeHistoryToAgent`
  cuts each agent's slice at the most recent assistant turn from a *different*
  agent (`apps/web/src/providers/daemon.ts:127-135`), so truncating or retrying
  that foreign-agent boundary turn (or any of its descendants) shifts or removes
  the active agent's resumed suffix even though the mutated turn is not inside the
  active agent's slice — that case must bump the active agent's epoch too. The
  diff-the-scoped-output rule still prevents a Codex-only edit that does not change
  Claude's scoped slice (e.g. editing the *content* of a Codex turn that stays the
  boundary) from invalidating Claude's pinned session.
- `apps/daemon/src/cli.ts`: `--fresh-session` flag on the run path (dual-track).

### Design Decisions

1. **Claude-only, capability-gated, opt-in per adapter.** Other adapters are
   untouched. Note the existing `resumesSessionViaCli` flag is a *static,
   per-adapter* skip-transcript switch (agy resumes on every follow-up or never).
   Claude resumes *conditionally per turn*, so it must NOT reuse that static flag
   to gate transcript-skipping — see Design Decision #1a.
   1a. **Transcript-skip is keyed to the per-run resume decision, never a static
   flag.** Both `--resume` and skip-transcript derive from the single per-run
   `resumeSessionId` returned by `resolveResumeDecision()`: present → emit
   `--resume` AND skip the transcript; null → omit `--resume` AND send the full
   transcript. They are coupled so a guard-fail / no-capability / force-fresh
   turn can never produce the broken state "cold spawn + no `--resume` + no
   transcript" (which would silently drop all prior context and break the
   non-regression guarantee in Design Decision #4). For Claude, leave the static
   `resumesSessionViaCli` flag unset; introduce `supportsSessionResume` as a
   *capability* (can this CLI resume at all?) distinct from the per-turn
   *decision* (should THIS turn resume?).
2. **Store a pointer keyed on `(conversationId, agentId)`** — the OD analog of
   multica's per-(agent, issue) session. A dedicated small table avoids bloating
   `conversations` and makes the agent-switch guard a natural key miss.
3. **`historyEpoch` guard (agent-scoped).** Each `(conversation, agent)` carries
   a monotonic epoch bumped whenever *that agent's scoped history* is edited,
   truncated, or retried. The epoch is **agent-scoped, not conversation-wide**,
   because the resumable state itself is agent-scoped: OD scopes the prompt
   transcript to the active agent (`scopeHistoryToAgent`, Research lines 79-83)
   and pins the session pointer by `(conversationId, agentId)` (Design Decision
   #2). A conversation-wide epoch would let an edit to a *Codex-only* turn bump
   the key and invalidate Claude's pinned session even though Claude's scoped
   history — the actual prompt source — never changed, making the invalidation
   model stricter than the prompt source. The live epoch therefore lives in the
   new `conversation_agent_epoch` table keyed on `(conversationId, agentId)` (the
   web edit/retry path bumps the epoch of every agent whose `scopeHistoryToAgent`
   output changes under the mutation — which includes the active agent when a
   truncate/retry lands on the most recent *foreign-agent* boundary turn or its
   descendants, since `scopeHistoryToAgent` cuts the slice at that boundary
   (`apps/web/src/providers/daemon.ts:127-135`) and dropping/regenerating it shifts
   or removes the active agent's resumed suffix even though the mutated turn sits
   outside that agent's slice); the pinned
   `conversation_agent_session.historyEpoch` records the epoch a session was
   produced under. At run start the daemon reads
   `conversation_agent_epoch.history_epoch` for the active `(conversation, agent)`
   to form `currentHistoryEpoch`, then `resolveResumeDecision()` compares it
   against the pinned row; a mismatch invalidates resume (Claude's immutable
   session would diverge from that agent's edited history). This is OD's addition
   over multica.
4. **Best-effort with guaranteed fallback.** If `claude --resume` exits early
   reporting an unknown/invalid session, retry the same turn once without
   `--resume` and with the full transcript. Worst case equals today.
5. **Anti-echo guard, not transcript sanitization.** On a resumed turn the prior
   `<question-form>` lives in Claude's session, beyond reach of
   `sanitizePriorAssistantTurnForTranscript`. Replace that defense with a short
   instruction-block guard (multica's "Focus on THIS turn" analog) telling the
   model the prior form was already answered.
6. **Force-fresh is first-class and dual-surface.** Retry-from-message, history
   edits, an explicit composer toggle, and `od --fresh-session` all set
   `forceFreshSession`, mirroring multica's `ForceFreshSession`.

### Why this design

It captures multica's token win on the dominant path (Claude, linear
conversation) while preserving the four OD properties the transcript model was
protecting: interactive tools, per-turn prompt control, agent switching, and
editable history. The fallback and capability gate make it strictly
non-regressing, so it can ship default-on without a flag day.

### Test Strategy

Red-spec first at the cheapest layer that sees the symptom (daemon HTTP e2e),
per `AGENTS.md`:

- **Resume happy path (red on main).** Two turns, same conversation, same agent:
  assert turn 2 spawns with `--resume <sid-from-turn-1>` and that turn 2's stdin
  prompt does **not** contain the full transcript (only `currentPrompt`).
  Every guard-fail case below asserts BOTH halves of the coupling (Design
  Decision #1a): no `--resume` AND the full transcript is present in the stdin
  prompt — this is the explicit non-regression proof that a fallback turn never
  loses prior context.
- **Agent-switch guard.** Turn 1 Claude, turn 2 after switching agent → no
  `--resume` AND turn 2's prompt contains the full transcript.
- **Force-fresh.** Retry-from-message and `--fresh-session` → no `--resume` AND
  full transcript present.
- **History-edit epoch guard.** Editing a prior turn in the active agent's scoped
  history bumps that agent's epoch → no `--resume` AND full transcript present.
  Conversely, editing the *content* of a turn that belongs only to a *different*
  agent's scoped history without changing Claude's scoped slice (e.g. a Codex-only
  turn that stays the boundary) must NOT bump Claude's epoch → Claude still resumes
  with `--resume`.
- **Cross-agent boundary retry/truncate guard.** History contains a Codex
  (foreign-agent) assistant turn followed by later Claude turns, so Claude's
  `scopeHistoryToAgent` slice starts just after that Codex boundary turn. A
  retry-from-message or truncate **on the Codex boundary turn** (or its
  descendants) drops or shifts Claude's resumed suffix, so it MUST bump Claude's
  epoch → no `--resume` AND full transcript present — even though the mutated turn
  sits outside Claude's own slice. (This is the case a "mutated turn is inside the
  slice" rule would miss: Claude could otherwise resume against stale history.)
- **Work-dir guard.** A pinned session whose `workDir` differs from the current
  run's (e.g. the conversation's project cwd moved) → no `--resume` AND full
  transcript present.
- **Same-runtime guard.** A pinned session whose `runtimeId` differs from the
  current run's resolved runtime (e.g. the Claude bin resolved to `openclaude` on
  turn 2 while cwd and agent stayed the same) → no `--resume` AND full transcript
  present.
- **Runtime-rejection fallback.** Stub a `claude` that rejects `--resume` → the
  daemon retries WITHOUT `--resume` AND WITH the full transcript, and the run
  still succeeds.
- **Capability probe.** A `claude --help` without `--resume` → flag never sent
  AND every turn carries the full transcript (skip-transcript stays off because
  `resolveResumeDecision` returns null without the capability).
- **Interactive intact.** An `AskUserQuestion` turn still resolves via
  `POST /api/runs/:id/tool-result` under resume.

Human verification (per `AGENTS.md`, two namespaced runtimes: `main` vs branch):
drive a multi-turn chat through production HTTP only; confirm continuity holds
and compare per-turn input-token counts (resume turn should drop sharply).

### Pseudocode

```ts
// server.ts — at run start, before buildArgs
function resolveResumeDecision(ctx): string | null {
  if (!agentDef.capabilities.supportsSessionResume) return null;
  if (chatBody.forceFreshSession) return null;
  if (!hasPriorAssistantTurn) return null;
  const row = getConversationAgentSession(db, conversationId, agentId);
  if (!row || row.agentId !== agentId) return null;          // agent-switch guard
  // currentHistoryEpoch is read from conversation_agent_epoch for THIS
  // (conversationId, agentId) at run start — agent-scoped, so a Codex-only edit
  // never invalidates Claude's pinned session.
  if (row.historyEpoch !== currentHistoryEpoch) return null; // edit guard
  if (row.workDir !== currentWorkDir) return null;           // cwd-scope guard
  if (row.runtimeId !== currentRuntimeId) return null;       // same-runtime guard
  return row.sessionId;
}

// claude.ts buildArgs
if (runtimeContext.resumeSessionId && caps.sessionResume) {
  args.push('--resume', runtimeContext.resumeSessionId);
}

// prompt composition — keyed ONLY to the per-run decision, NOT a static flag.
// `--resume` (above) and skipTranscript share the same source of truth, so a
// guard-fail turn (resumeSessionId == null) always sends the full transcript.
const skipTranscript = resumeSessionId != null;

// on run success (mirrors multica PinTaskSession)
if (finalSessionId) upsertConversationAgentSession(db, {
  conversationId, agentId, sessionId: finalSessionId,
  historyEpoch: currentHistoryEpoch, workDir, runtimeId: currentRuntimeId,
});

// runtime rejection
if (exitedWith('unknown session') && usedResume) {
  return respawnWithoutResumeAndFullTranscript();
}
```

### File Structure

- `specs/change/20260529-claude-session-resume/spec.md` (this file)
- (implementation, follow-up PR) contracts → db → runtime types → claude def →
  server orchestration → web composer → cli flag

## Plan

1. Land this spec (this PR).
2. Contracts: `forceFreshSession`, `sessionResumed`.
3. DB: `conversation_agent_session` (with `runtimeId`) + `conversation_agent_epoch`
   tables + queries; stop dropping `session_id`.
4. Runtime: `RuntimeContext.resumeSessionId`, `supportsSessionResume` probe,
   `--resume` in `claude.ts`.
5. Server: `resolveResumeDecision`, pin-on-success, resume-aware skipTranscript,
   anti-echo guard, rejection fallback.
6. Web + CLI: force-fresh control on both surfaces; epoch bump on history edit.
7. Tests per Test Strategy, then human verification.

## Notes

### Implementation

- Steps 2–6 ship as separate PRs after this spec is accepted; each carries its
  own red spec.
- Keep `resolveResumeDecision` a pure function for unit-testing the guard matrix
  without spawning a process.

### Verification

- `pnpm guard`, `pnpm typecheck`, `pnpm --filter @open-design/daemon test` per
  changed surface.
- Token-savings telemetry (`sessionResumed`, input-token delta) confirms the
  win that motivates the change.
