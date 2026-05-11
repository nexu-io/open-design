---
title: fix: Surface Codex response.failed errors
type: fix
status: completed
date: 2026-05-12
---

# fix: Surface Codex response.failed errors

## Summary

Staging runs using Codex CLI can end with `response.failed` from Codex/OpenAI, but Open Design currently does not translate that event into a daemon error. The browser then sees the stream close before a clean completion and shows a generic reconnect message instead of the real provider/model/auth failure. This plan makes `response.failed` a first-class Codex JSON stream error so users and logs see the actionable upstream message.

## Problem Frame

The daemon routes Codex through `json-event-stream` parsing. Existing parser coverage handles `type: "error"` and `type: "turn.failed"`, but not `type: "response.failed"`. When Codex emits `response.failed`, the parser treats it as raw/unhandled, the run can finish without a visible error message, and the web client reports a reconnect/disconnect symptom. The root cause is missing Codex event coverage, not skill loading.

## Requirements

- R1. Codex `response.failed` JSON events must become daemon `error` events.
- R2. The emitted error message should prefer `response.error.message`, then fall back through other structured error fields.
- R3. The raw Codex failure frame should be preserved in error details for logs/debugging.
- R4. Existing Codex handling for `error`, `turn.failed`, successful text, usage, and tool events must keep working.
- R5. Focused tests must cover the new event shape and protect existing Codex parser behavior.

## Scope Boundaries

- Do not change Codex default selection, model defaults, or CLI argv behavior in this fix.
- Do not change frontend reconnect behavior unless parser fixes are insufficient.
- Do not change skill loading or the career-page skill replacement.
- Do not suppress retries globally; the goal is to surface the correct failure cause.

## Relevant Files

- `apps/daemon/src/json-event-stream.ts`
- `apps/daemon/tests/json-event-stream.test.ts`
- `apps/daemon/tests/agents.test.ts`

## Key Technical Decisions

- Handle `response.failed` inside the Codex branch of `createJsonEventStreamHandler`, alongside the existing `error` and `turn.failed` coverage.
- Use the existing `extractErrorMessage` helper so nested JSON/string error payloads keep the same behavior as other parser errors.
- Include `raw: stringifyContent(obj)` on the emitted daemon error so `server.ts` can pass structured details through the existing `createSseErrorPayload` path.
- Keep the existing single-error guard, `state.codexErrorEmitted`, so one failing response does not produce duplicate user-facing errors.

## Test Scenarios

- `apps/daemon/tests/json-event-stream.test.ts`: feed a Codex `response.failed` frame containing `response.error.message`; assert the parser emits one `type: "error"` event with that message and raw JSON.
- `apps/daemon/tests/json-event-stream.test.ts`: feed `response.failed` frames that require fallback to top-level error/message fields; assert the parser still surfaces the actionable message.
- `apps/daemon/tests/json-event-stream.test.ts`: feed `response.failed` followed by another Codex failure event; assert only the first error is emitted.
- `apps/daemon/tests/json-event-stream.test.ts`: existing structured error test remains green, proving `error` and `turn.failed` still de-dupe.

## Validation

- Run focused daemon parser and adapter tests.
- Run `git diff --check`.
- Record any broader typecheck limitations separately if unrelated repo drift blocks full validation.

## Post-Deploy Monitoring & Validation

- Watch daemon logs for `AGENT_EXECUTION_FAILED` on Codex runs.
- Expected healthy signal: Codex provider/model/auth failures display the underlying error message instead of only reconnecting.
- Failure signal: users still see only `stream disconnected before completion` with no provider detail.
- Validation window: first staging Codex run after deploy.
- Owner: staging deploy owner.
