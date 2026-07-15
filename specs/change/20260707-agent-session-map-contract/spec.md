---
id: 20260707-agent-session-map-contract
name: Agent-Agnostic Session Map Contract
status: proposed
created: '2026-07-07'
related:
  - '#744'
  - '#5268'
  - '#5269'
  - '#5270'
  - '#5271'
---

# Agent-Agnostic Session Map Contract

## Overview

#744 now tracks the shared native/ACP session-continuity layer above the
per-agent resume slices. OpenCode, Codex, Pi, and AMR have shipped session
continuity paths in #4629, Claude has the earlier #3290 design, and
cursor-agent is in flight in #4790. Those slices proved the value of resuming an
upstream agent session, but the shared contract should not be shaped like any
one adapter.

This spec defines the shared session-map contract that resumable adapters plug
into. It is intentionally behavior-light: no new adapter starts resuming because
of this spec alone. The goal is to name the durable binding shape, the handle
acquisition/continuation modes, capability flags, privacy boundary, and current
agent matrix so future implementation PRs can review against one source of
truth.

## Goals

- Define the canonical logical key and fields for a session binding.
- Reconcile the contract with the current `agent_sessions` table and runtime
  definition flags.
- Model heterogeneous handle shapes: opaque ids, CLI thread ids, ACP handles,
  local session-file paths, and continue-latest agents.
- Model acquisition and continuation separately so the daemon can support
  daemon-specified ids, stream-captured ids, ACP `session/load`, native
  `--resume <id>`, native `--continue`, and future variants.
- Preserve the fallback invariant: a failed resume guard falls back to full
  transcript recompose rather than skipping history.
- Include Hermes and other ACP/native candidates in the first matrix without
  promising first-wave implementation for every adapter.

## Non-Goals

- No new per-agent resume behavior.
- No UI or CLI recovery action. That belongs to #5271 after #5270 defines safe
  recovery metadata.
- No public exposure of raw native handles. #5270 owns sanitized run details and
  diagnostics export.
- No production migration unless a later implementation needs one.

## Contract Types

The typed contract lives in `packages/contracts/src/api/agent-sessions.ts` and
is exported from `@open-design/contracts`.

Core enums:

- `AgentSessionHandleKind`
  - `opaque-id`
  - `cli-thread-id`
  - `acp-session-handle`
  - `session-file-path`
  - `continue-latest`
  - `none`
  - `unknown`
- `AgentSessionHandleAcquisitionMode`
  - `daemon-specified`
  - `stream-captured`
  - `acp-session-load`
  - `session-file-discovered`
  - `continue-latest`
  - `none`
  - `unknown`
- `AgentSessionContinuationMode`
  - `native-resume-by-id`
  - `native-continue-latest`
  - `acp-session-load`
  - `session-file-resume`
  - `none`
- `AgentSessionHandleVisibility`
  - `persist-only`
  - `diagnostics-redacted`
  - `safe-display`

Core records:

- `AgentSessionMapKey`
  - `projectId`
  - `conversationId`
  - `agentId`
- `AgentSessionHandleRef`
  - `kind`
  - `acquisition`
  - `continuation`
  - `value`
  - `visibility`
- `AgentSessionBindingRecord`
  - `key`
  - `handle`
  - `model`
  - `cwd`
  - `lastMessageId`
  - `stablePromptHash`
  - optional `revision`
  - `updatedAt`
- `AgentSessionCapabilityFlags`
  - `resumeById`
  - `continueLatest`
  - `acpSessionLoad`
  - `streamCapturedHandle`
  - `daemonSpecifiedHandle`
  - `sessionFileHandle`
  - `headlessPromptInjection`
  - `modelOverride`
  - `modeOverride`

The `value` field is a daemon-side persisted handle, not a safe public display
field. Public run details should use a sanitized shape from #5270.

## Current Schema Mapping

The existing daemon schema is sufficient for the current shipped slices. No
backward-incompatible migration is required for this contract pass.

| Contract field | Current source | Notes |
| --- | --- | --- |
| `projectId` | `conversations.project_id` | Logical key field, normalized through the conversation row instead of duplicated into `agent_sessions`. |
| `conversationId` | `agent_sessions.conversation_id` | Part of the persisted primary key. |
| `agentId` | `agent_sessions.agent_id` | Part of the persisted primary key. |
| `handle.value` | `agent_sessions.session_id` | Stores opaque ids, thread ids, ACP handles, or Pi session-file paths depending on adapter. |
| `stablePromptHash` | `agent_sessions.stable_prompt_hash` | Used to decide whether the stable instruction block must be resent on resume. |
| `model` | `agent_sessions.model` | Resume identity guard. |
| `cwd` | `agent_sessions.cwd` | Resume identity guard and workspace identity. |
| `lastMessageId` | `agent_sessions.last_message_id` | Conversation cursor guard. |
| `updatedAt` | `agent_sessions.updated_at` | Last binding write time. |
| `revision` | None today | Optional future field. Current guard uses `lastMessageId` plus `updatedAt`. |

Current invalidation reasons are exported as `AgentSessionInvalidationReason`:

| Reason | Meaning |
| --- | --- |
| `model_changed` | Stored session model differs from the current run model. |
| `cwd_changed` | Stored session cwd differs from the current run cwd. |
| `conversation_advanced` | Another turn changed the conversation cursor after the stored session. |
| `missing_cursor` | Legacy or incomplete row cannot prove the conversation cursor. |

Every non-null invalidation reason means the run must start fresh and send the
full transcript.

## Runtime Flag Mapping

The current runtime definitions use three opt-in flags:

| Runtime flag | Contract meaning |
| --- | --- |
| `resumesSessionViaCli` | Adapter can continue upstream memory through a CLI/RPC native session path and may skip transcript only when the per-run resume decision is safe. |
| `capturesSessionIdFromStream` | Adapter is capture-style: the upstream process mints the handle and reports it on the stream. |
| `resumesSessionViaAcpLoad` | Adapter resumes via ACP `session/load`; the durable handle is obtained from ACP session setup rather than a CLI argv flag. |

The existing flags remain valid. Future cleanup may collapse them into a single
structured runtime field, but that should be a follow-up and must preserve
today's behavior.

## Capability Matrix

This matrix is a contract-accounting table, not an implementation promise. Rows
marked `candidate` or `unknown` are included so the contract accounts for their
shape before the adapter work starts.

| Agent | Status | Handle kind | Acquisition | Continuation | Capability notes |
| --- | --- | --- | --- | --- | --- |
| Claude | implemented | `opaque-id` | `daemon-specified` | `native-resume-by-id` | `--session-id` on create, `--resume <id>` on resume. |
| Codebuddy | implemented | `opaque-id` | `daemon-specified` | `native-resume-by-id` | Claude-compatible session flags. |
| Codex | implemented | `cli-thread-id` | `stream-captured` | `native-resume-by-id` | Captures `thread.started.thread_id`; resumes with `exec resume <thread_id>`. |
| OpenCode | implemented | `opaque-id` | `stream-captured` | `native-resume-by-id` | Captures OpenCode `sessionID`; resumes with `run -s <id>`. |
| Pi | implemented | `session-file-path` | `session-file-discovered` | `session-file-resume` | Captures the single `.pi/sessions/*.jsonl` file changed by the run; path-like handle is persist-only/redacted. |
| AMR | implemented | `acp-session-handle` | `acp-session-load` | `acp-session-load` | Captures durable ACP session handle and maps `resume_failed` to reseed. |
| cursor-agent | in-flight | `opaque-id` | `stream-captured` | `native-resume-by-id` | #4790 captures emitted `session_id` and resumes with `--resume <chatId>`. |
| Hermes | candidate | `acp-session-handle` | `acp-session-load` | `acp-session-load` | ACP-native candidate; include in matrix before implementation. |
| Kimi | candidate | `acp-session-handle` | `acp-session-load` | `acp-session-load` | ACP-native candidate. |
| Kilo | candidate | `acp-session-handle` | `acp-session-load` | `acp-session-load` | ACP-native candidate. |
| Kiro | candidate | `acp-session-handle` | `acp-session-load` | `acp-session-load` | ACP-native candidate. |
| Vibe | candidate | `acp-session-handle` | `acp-session-load` | `acp-session-load` | ACP-native candidate. |
| Devin | candidate | `acp-session-handle` | `acp-session-load` | `acp-session-load` | ACP-native candidate from the #730 direction. |
| Gemini / Antigravity | unknown | `unknown` | `unknown` | `none` | Current `agy -c` path is deliberately not used by OD because it weakens prompt control. |
| Qoder | unknown | `unknown` | `unknown` | `none` | No shared resume contract wired yet. |
| Copilot | unknown | `unknown` | `unknown` | `none` | No shared resume contract wired yet. |
| Qwen | unknown | `unknown` | `unknown` | `none` | No shared resume contract wired yet. |

Minimum capability expectations for implementation rows:

- If `continuation` is `native-resume-by-id`, `resumeById` must be true.
- If `continuation` is `native-continue-latest`, `continueLatest` must be true
  and the guard must prove the target conversation cannot drift across projects,
  agents, or cwd.
- If `continuation` is `acp-session-load`, `acpSessionLoad` must be true and
  `resume_failed` must route to the reseed path.
- If `acquisition` is `stream-captured`, `streamCapturedHandle` must be true and
  a missing capture on success must clear or avoid writing stale state.
- If `handleKind` is `session-file-path`, the public visibility must default to
  `diagnostics-redacted` or `persist-only`.

## Privacy Boundary

Raw handles are operational pointers, not user-facing data.

- Safe to persist: raw handle values in daemon-owned storage when they are
  needed to resume an upstream session.
- Safe to show by default: capability status, acquisition mode, continuation
  mode, and coarse resume state.
- Requires redaction or diagnostics-only handling: local file paths, ACP handles,
  opaque session ids that could correlate user activity, and any handle whose
  vendor semantics are unknown.
- Never derive user-visible continuity from the raw handle alone. The daemon's
  conversation messages remain the authoritative history.

## Fallback Invariant

Transcript skipping is permitted only when the same per-run decision also
provides a safe continuation handle. The valid pairings are:

| Resume decision | Continuation argv/RPC | Prompt sent |
| --- | --- | --- |
| Safe resume | Native/ACP resume is requested | Latest user turn plus current stable instructions as needed |
| Guard failure | No native/ACP resume | Full transcript recompose |
| Missing/expired upstream handle | Clear stale handle, retry or reseed | Full transcript recompose |
| Unsupported adapter | No native/ACP resume | Full transcript recompose |

The broken state "no resume requested and transcript skipped" must remain
unrepresentable.

## Review Checklist for Future Adapter PRs

- Add or update the agent's matrix row.
- Identify handle kind, acquisition mode, continuation mode, and display
  visibility.
- Prove how the handle is captured or specified.
- Prove how model, cwd, and conversation cursor guards are enforced.
- Prove resume-target-missing fallback clears stale state and reseeds the full
  transcript.
- Keep raw handles out of public run responses unless #5270 defines a safe
  display form for that handle kind.

## References

- `packages/contracts/src/api/agent-sessions.ts`
- `apps/daemon/src/db.ts` (`agent_sessions`)
- `apps/daemon/src/agent-session-resume.ts`
- `apps/daemon/src/runtimes/types.ts`
- `specs/change/20260529-claude-session-resume/spec.md`
- `specs/change/20260618-stability-performance-3408/agent-cli-session-resume.md`
