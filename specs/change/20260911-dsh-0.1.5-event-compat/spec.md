---
id: 20260911-dsh-0.1.5-event-compat
name: DeepSeek Harness 0.1.5 session-event compatibility
status: proposed
created: "2026-09-11"
zh-CN: spec.zh-CN.md
issues:
  - https://github.com/nexu-io/open-design/issues/7992
  - https://github.com/nexu-io/open-design/issues/6944
not:
  - https://github.com/nexu-io/open-design/pull/7993
---

# DSH 0.1.5 event-contract + resume generation

## 1. Why

OpenDesign sells DeepSeek Harness as a first-class runtime. npm `latest` is
already `dsh` **0.1.5-rc.1**. The installed `@open-design/dsh-runtime` still
treats `assistant/chunk` as the only source of assistant text.

On 0.1.5 that session event is gone. Probe and model listing still work, so
the product looks connected. A real run reports `status: "completed"` with an
empty assistant message. The Settings connection test fails as
`settings.testUnknown` with detail `exit 0`.

This is a silent protocol-generation break, not a detection bug.

Maintainer confirmation is in #7992: `emitSessionEvent()` maps `assistant/chunk`
into `text` / `thinking`; `assistant/message` currently contributes usage only;
`assistantOutput` is assembled only from chunk text-deltas. #7825 widened the
version/install policy to 0.1.2 and did **not** cover this event-contract
change. Version-policy widening to 0.1.5 must wait until the event path is
verified.

#7993 occupies the issue with a +15/−482 rewrite of `packages/dsh-runtime/src/index.ts`
that replaces the runtime with a detached `eventEmitter.on` snippet. Looper
requested changes: the package no longer compiles. This spec does not take over
that PR and does not copy its patch.

#6944 is the sibling hole: native resume is decided from model / cwd / cursor
**before spawn**. The profile adapter contract also requires DSH executable
identity, protocol generation, and plugin compatibility generation. A 0.1.2
session resumed under 0.1.5 (or the reverse) is an unsafe skip-transcript.

## 2. Goals

- [ ] On `dsh` 0.1.5-rc.1, a connection test and a one-turn run both produce
      assistant text. `result.output` is present when the model returned text.
- [ ] Live `text` / `thinking` frames still stream; settlement does not reprint
      the same text.
- [ ] `dsh` 0.1.2 (`assistant/chunk`) keeps working without a plugin rebuild
      per user CLI.
- [ ] `assistant/attempt` is never shown as user-visible assistant text.
- [ ] OD JSONL to the daemon stays `protocol_version: 1`. No new frame types.
- [ ] Follow-up PR: a stored Harness session is not resumed across a plugin or
      CLI generation mismatch; the turn reseeds with the full transcript.
- [ ] This change does **not** widen `supportedVersionPattern` to 0.1.5. That
      is a third PR after the event path is green on a real 0.1.5 profile.

## 3. User stories

### Story 1: 0.1.5 connection test and first turn

**As a** user on `dsh` 0.1.5-rc.1
**I want** Settings → Local CLI → DeepSeek Harness → Test, and a first Studio
turn, to show the model reply
**So that** the advertised Harness integration is usable on npm `latest`

**Acceptance Criteria:**

- [ ] Connection test no longer fails with `exit 0` solely because
      `result.output` is missing after a completed turn.
- [ ] A completed run writes at least one `text` frame when the model returned
      non-empty text, and `result.output` equals the concatenated text deltas.
- [ ] Usage frames still come from `assistant/message` when usage is present.

### Story 2: live stream without double-print

**As a** user watching a long Harness turn
**I want** tokens to appear as they are generated
**So that** the Studio does not sit empty until settlement

**Acceptance Criteria:**

- [ ] `agent/assistant-stream` chunk frames with `text-delta` / `reasoning-delta`
      become OD `text` / `thinking` frames as they arrive.
- [ ] The later `assistant/message` does not emit a second copy of that text.
- [ ] If no live chunk arrived (settlement-only), one `text` frame is emitted
      from `assistant/message` content so the UI and `result.output` still fill.

### Story 3: 0.1.2 still works

**As a** user pinned to `dsh` 0.1.2-rc.1
**I want** the same plugin to keep mapping `assistant/chunk`
**So that** upgrading OpenDesign does not break a still-supported CLI

**Acceptance Criteria:**

- [ ] A fixture that only emits `assistant/chunk` text-deltas produces the same
      `text` frames and `result.output` as today.
- [ ] The plugin does not require the user's `dsh` to export 0.1.5 TypeScript
      types. Event handling is structural (duck-typed).

### Story 4: resume does not cross generations (PR-B)

**As a** user who upgrades `dsh` or the OpenDesign profile plugin mid-conversation
**I want** the next turn to start a fresh Harness session with full transcript
**So that** skip-transcript resume cannot replay history under a different
event contract

**Acceptance Criteria:**

- [ ] Resume guard compares stored vs current: DSH CLI version, profile
      `plugin_version`, and OD JSONL `protocol_version`.
- [ ] Mismatch → `invalidationReason` set, `isResuming === false`, full
      transcript reseed. No attempt to pass `resume_session_id`.
- [ ] Same generation + existing model/cwd/cursor guards still resume.

## 4. Technical approach

### 4.1 Two PRs, one generation model

| PR               | Issue              | Surface                                                            | Why split                                                    |
| ---------------- | ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| **PR-A**         | #7992              | `packages/dsh-runtime` (+ its tests)                               | Event contract. Can merge without a daemon schema change.    |
| **PR-B**         | #6944              | `apps/daemon` resume + contracts + tests                           | Persist/compare generation. Needs a new invalidation reason. |
| **PR-C (later)** | follow-up to #7992 | `deepseek-harness.ts` version policy, peer ranges, installer tests | Only after PR-A is verified on real 0.1.5.                   |

Do not combine PR-A with version-policy widening. Lefarcen: the 0.1.2 pin is
the workaround until the event path is proven.

Do not take over #7993. Open a new branch from current `main`. If #7993 is
still open, comment on #7992 that this work implements the typed runtime path
Looper asked for, rather than replacing `index.ts`.

### 4.2 Where text actually lives in 0.1.5

Source of truth is the local `deepseek-harness` tree (0.1.5-rc.1):

```text
live (process-local, transient)
  ctx.on('agent/assistant-stream', { agent, frame })
    frame.type === 'chunk'
      frame.chunk.type === 'text-delta'      → OD `text`
      frame.chunk.type === 'reasoning-delta' → OD `thinking`

durable settlement (session log)
  session/event  type === 'assistant/message'
    data.message.content[]   final blocks
    data.stream[]            compact timed stream (replay, not live UI)
    data.usage               token usage
  session/event  type === 'assistant/attempt'
    failed / retried / cancelled / stream-error settlement
    not a user-visible assistant message

legacy (0.1.2 and old-log migration only)
  session/event  type === 'assistant/chunk'
    data.chunk.type === 'text-delta' | 'reasoning-delta'
```

The plugin today only listens to `session/event` and only accumulates
`assistant/chunk` text-deltas. `assistant/message` writes usage and returns.

OD JSONL frames (`text`, `thinking`, `tool_call`, `tool_result`, `usage`,
`result`) do not change. Daemon `dsh-profile-jsonl` parser does not change in
PR-A.

### 4.3 PR-A mapping (normative)

Introduce a small accumulator owned by `execute()`, not a rewrite of `apply()`.
`emitSessionEvent` stays the session-event mapper; live stream is a second
listener. Both write through the same helpers.

Per execute turn, after `firstSeq` is set:

1. Subscribe `session/event` (existing) and `agent/assistant-stream` (new).
2. Ignore events whose `session.id` / `agent.session.id` ≠ this turn's session.
3. Ignore `session/event` with `event.seq < firstSeq` (existing resume trim).
4. Live stream `start` / `end` frames: no OD frames.
5. Live stream `chunk`:
   - `text-delta` with non-empty text → `text` frame; append to `assistantOutput`
   - `reasoning-delta` with non-empty text → `thinking` frame; do **not** append
     to `assistantOutput` (matches today's chunk path)
   - other chunk types: ignore for OD JSONL (tool deltas already have
     `tool/call` + `tool/result` session events)
6. Legacy `assistant/chunk`: keep today's mapping. If live stream already
   produced text for this turn, still accept legacy chunks only when they appear
   (a 0.1.2 process will not emit live stream). A 0.1.5 process must not emit
   both; if a fixture does, first writer wins for `assistantOutput` and the
   second source must not emit duplicate `text` frames.
7. `assistant/message`:
   - always emit `usage` when `data.usage` is present (today)
   - if `assistantOutput === ''`, take text from `data.message.content` via
     existing `contentText()` (text + nested tool-result text; skip using
     reasoning blocks as `result.output` — `contentText` currently joins
     reasoning too; **change: `result.output` / fallback `text` frames use
     text blocks only**, so thinking does not leak into the visible answer)
   - if fallback text is non-empty, emit one `text` frame and set
     `assistantOutput`
8. `assistant/attempt`: no `text`, no `thinking`, no `assistantOutput` mutation.
   Usage on attempt is ignored unless we later learn 0.1.5 puts usage only
   there; first implementation follows current `assistant/message`-only usage.
9. `result.output` remains `terminalOutput(assistantOutput)`: omitted when empty.

`PLUGIN_VERSION` bumps from `0.1.0` to `0.1.1`. Probe `plugin_version` is the
compatibility generation PR-B will persist. `PROTOCOL_VERSION` stays `1`.

Do not bump `packages/dsh-runtime` peerDependencies to 0.1.5 in PR-A. The
plugin runs inside the user's `dsh` process. Structural event handling must
compile against the current 0.1.1-rc.2 peers.

### 4.4 Dedup rule (one sentence)

A turn emits each visible text delta at most once: live stream XOR legacy
chunk XOR settlement fallback, with live/legacy preferred over settlement.

### 4.5 PR-A tests (red before green)

Add tests next to `packages/dsh-runtime/tests/protocol.test.ts` (or a sibling
`events.test.ts`). Drive `internals.emitSessionEvent` / a new exported
accumulator through a fake `ctx.on` in `internals.execute`, same style as the
existing cancel tests.

| Fixture             | Session events / stream frames                                                             | Expected OD frames                                             |
| ------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| F1 legacy-chunk     | `assistant/chunk` text-delta `"ok"` then `turn/end` completed                              | `text:"ok"`, `result.output==="ok"`                            |
| F2 settlement-only  | no chunk; `assistant/message` content `[{type:text,text:"ok"}]` + usage + `turn/end`       | one `text:"ok"`, `usage`, `result.output==="ok"`               |
| F3 live-then-settle | stream chunk text-delta `"ok"` then `assistant/message` content `"ok"` + usage             | one `text:"ok"` (not two), `usage`, `result.output==="ok"`     |
| F4 thinking         | stream reasoning-delta `"hmm"` then text-delta `"ok"`                                      | `thinking` then `text`, `result.output==="ok"` (not `"hmmok"`) |
| F5 attempt          | `assistant/attempt` with content/stream text, then `turn/end` completed with empty message | no `text`, no `result.output`                                  |
| F6 empty message    | `assistant/message` content `[]` (max-tokens / content-less) + usage                       | `usage` only; no `output` field                                |

F2 is the #7992 reproduction. Tests must go red on current `main`.

Do not spawn a real `dsh` in unit tests. Optional later: a manual validation
note in the PR (`dsh` 0.1.5-rc.1 `--stdio` smoke).

### 4.6 PR-B resume generation

Today `evaluateResumeInvalidation` compares model, cwd, and last-message
cursor. Contract §7 also requires:

- DSH executable identity / tested compatibility family
- profile protocol generation (`protocol_version`)
- plugin compatibility generation (`plugin_version`)

Resume is chosen **before** spawn. Detection already has `dsh --version` and
`--probe`. Persist those values with the session row; compare them on the next
`resolveAgentResumeContext` using the **current** detection snapshot.

Plan:

1. Extend `AGENT_SESSION_INVALIDATION_REASONS` with `runtime_incompatible`.
2. Persist an opaque `runtimeGeneration` string on `agent_sessions` for
   `deepseek-harness` only in this PR (other adapters leave it null → no new
   invalidation). Suggested encoding:
   `dsh:${cliVersion}|plugin:${pluginVersion}|proto:${protocolVersion}`
3. Current generation is assembled from the same fields detection already
   stored for the selected agent (CLI version + last successful probe
   `plugin_version` + constant protocol `1`).
4. Null stored generation (rows written before this PR) → `missing_cursor`
   **or** a one-time `runtime_incompatible` reseed. Prefer treating missing
   generation as incompatible so a 0.1.2 session is not skip-transcript resumed
   onto a 0.1.1 plugin after the user upgrades. Document that one extra reseed
   after upgrade is expected.
5. Tests in `apps/daemon/tests/agent-session-resume.test.ts`: same model/cwd/
   cursor but different plugin version → not resuming; identical generation →
   resuming.

Do not parse Harness session files. Do not change `DSH_HOME`.

### 4.7 Out of scope

- Taking over or force-pushing #7993
- Widening `supportedVersionPattern` / peer ranges to 0.1.5 (PR-C)
- #7471 git-install `files` / `prepare`
- #7249 Windows PowerShell media stdout
- New ACP/SDK transport (`deepseek-harness-sdk-adapter.md`)
- Changing daemon JSONL frame vocabulary
- Tool-call live deltas (`tool-call-delta`); session `tool/call` + `tool/result`
  remain the tool-card source (adapter spec §9)

## 5. Files (expected)

PR-A:

- `packages/dsh-runtime/src/index.ts` — dual listeners, accumulator, version bump
- `packages/dsh-runtime/tests/events.test.ts` — F1–F6
- `packages/dsh-runtime/tests/protocol.test.ts` — only if probe version assertion needs `0.1.1`
- `specs/current/deepseek-harness-profile-adapter.md` — §9 table: live stream
  source; plugin 0.1.1

PR-B:

- `packages/contracts/src/api/agent-sessions.ts`
- `apps/daemon/src/agent-session-resume.ts` + db upsert/read
- `apps/daemon/tests/agent-session-resume.test.ts`
- daemon SQLite migration for the new column (follow existing agent_sessions
  migrations; do not invent a second store)

## 6. Risks

| Risk                                         | Handling                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.2 Cordis has no `agent/assistant-stream` | Subscribe anyway; unused listener is inert.                                                                                           |
| `contentText()` currently joins reasoning    | Fallback path uses text blocks only.                                                                                                  |
| Live + settlement double-print               | First-writer-wins; F3 locks it.                                                                                                       |
| #7993 still open                             | New PR from `main`; do not stack on the broken branch.                                                                                |
| Resume schema change                         | Isolated in PR-B; missing generation reseeds once.                                                                                    |
| Version policy lag                           | Users on 0.1.5 still see `untested-version` until PR-C. Text must work anyway. Untested warning is acceptable; empty replies are not. |

## 7. Validation

PR-A:

- [ ] New F1–F6 tests red on `main`, green on the branch
- [ ] `pnpm --filter @open-design/dsh-runtime test`
- [ ] `pnpm --filter @open-design/dsh-runtime typecheck`
- [ ] `pnpm typecheck` / `pnpm guard` as required by the PR template
- [ ] Manual: `dsh --profile open-design --stdio` against 0.1.5-rc.1, connection
      test + one HTML-producing turn (note in PR body if the environment has a
      key)

PR-B:

- [ ] Resume unit tests for generation mismatch / match / missing
- [ ] Existing `agent-session-resume.test.ts` cases still pass

## 8. Boundary with #7993

#7993 is not a starting point. It deletes the runtime entrypoint. The correct
patch keeps `apply` / `serve` / `execute` / cancellation / exit-fallback and
adds structural event mapping plus fixtures.

If #7993 is merged before this work lands, re-evaluate: if it only adds a
settlement fallback without live stream and without F3/F4/F5, follow up; if it
restores the entrypoint and matches this mapping, stop and review instead of
duplicating.
