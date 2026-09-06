import type { LiveArtifactRefreshStatus } from '../api/live-artifacts.js';
import type { RunFailureAction, RunFailureCategory, RunFailureDetail } from '../api/chat.js';
import type { StrategyTaskProjectionV2 } from '../plugins/strategy-v2.js';
import type { SseErrorPayload } from '../errors.js';
import type { SseTransportEvent } from './common.js';

export type LiveArtifactSseAction = 'created' | 'updated' | 'deleted';
export type LiveArtifactRefreshSsePhase = 'started' | 'succeeded' | 'failed';

export interface LiveArtifactSsePayload {
  type: 'live_artifact';
  action: LiveArtifactSseAction;
  projectId: string;
  artifactId: string;
  title: string;
  /**
   * Refresh lifecycle state of the artifact at emit time. Typed against the
   * canonical `LiveArtifactRefreshStatus` enum used by the REST API so that
   * SSE consumers (web, CLI) can switch on the same union members without
   * widening to `string`. Optional because the daemon may omit the field on
   * legacy events; consumers must still null-check before narrowing.
   */
  refreshStatus?: LiveArtifactRefreshStatus;
}

export interface LiveArtifactRefreshSsePayload {
  type: 'live_artifact_refresh';
  phase: LiveArtifactRefreshSsePhase;
  projectId: string;
  artifactId: string;
  refreshId?: string;
  title?: string;
  refreshedSourceCount?: number;
  error?: string;
}

export interface PlainStreamArtifactSsePayload {
  type: 'artifact';
  source: 'plain-stream';
  name: string;
  path?: string;
  identifier?: string;
  artifactType?: string;
}

/**
 * Emitted by the daemon on `/api/projects/:id/events` when a new
 * conversation is inserted into a project from a path the open
 * project view can't observe through its own state — currently
 * Routines "Run now" in reuse-an-existing-project mode (#1361).
 *
 * Lives in `packages/contracts` so the daemon producer and the web
 * consumer share one type and can't drift as the stream grows.
 */
export interface ProjectConversationCreatedSsePayload {
  type: 'conversation-created';
  projectId: string;
  conversationId: string;
  title: string | null;
  createdAt: number;
}

/**
 * Emitted by the daemon on `/api/projects/:id/events` when a finished message's
 * artifact refs changed AFTER its run's terminal frame already went out.
 *
 * The one producer today is the HTML card's static cover. Freezing the renderer
 * input is awaited at the terminal chokepoint, but the render itself is
 * deliberately not (`chat-artifacts/cover.ts`) — a turn should not stay open for
 * a thumbnail. So the cover lands a few hundred milliseconds into a message the
 * client already considers done, and the client's one post-run re-read has
 * already been and gone. Without this signal the card keeps the live-iframe
 * degrade branch for the rest of the session, which is precisely what
 * `chat-artifact-versioning-design.md` line 505 rules out: "pending thumbnail
 * 不出 placeholder,直接走 §6.4 的降级支;后台 ready 后消息投影更新".
 *
 * Thin by design, like the collab invalidation events it sits beside: it names
 * the message whose projection went stale and carries no refs of its own. The
 * consumer re-reads the conversation, so one authority (`listMessages`) keeps
 * deciding what a ref actually is, and a dropped or duplicated event costs a
 * redundant fetch rather than a wrong card.
 */
export interface ChatArtifactRefsChangedSsePayload {
  type: 'chat-artifact-refs-changed';
  projectId: string;
  conversationId: string;
  messageId: string;
  at?: number;
}

export const CHAT_SSE_PROTOCOL_VERSION = 1;

export interface ChatSseStartPayload {
  runId?: string;
  agentId?: string;
  bin: string;
  protocolVersion?: typeof CHAT_SSE_PROTOCOL_VERSION;
  /** Legacy daemon-internal absolute cwd. Kept for compatibility during W2 adoption. */
  cwd?: string | null;
  projectId?: string | null;
  model?: string | null;
  reasoning?: string | null;
  serviceTier?: string | null;
}

export interface ChatSseChunkPayload {
  chunk: string;
}

export interface ChatSseEndPayload {
  code: number | null;
  signal?: string | null;
  status?: 'succeeded' | 'failed' | 'canceled';
  /** The immutable instant the Run entered its terminal status. */
  terminalAt?: number;
  /** Authoritative count of artifact files created or modified by this run.
   *  Present when the daemon resolved the run's filesystem/tool-stream diff
   *  before publishing the terminal frame. */
  artifactCount?: number;
  /** Project-relative artifact paths created or modified by this run. */
  artifactPaths?: string[];
  /** True when a `failed` run can be recovered by resuming the agent's CLI
   *  session (transient upstream drop / inactivity on a session-resuming
   *  runtime). Lets the chat offer a Continue affordance without a separate
   *  run-status fetch. Mirrors ChatRunStatusResponse.resumable. */
  resumable?: boolean;
  /** True when this terminal run ended with unfinished declared work (a
   *  non-`completed` TodoWrite task, or a max_tokens truncation). The browser
   *  reads it straight off the terminal frame and carries it onto the persisted
   *  assistant message so every status surface avoids showing "Completed" for an
   *  incomplete run. Mirrors ChatRunStatusResponse.endedWithUnfinishedWork. */
  endedWithUnfinishedWork?: boolean;
  /** Daemon failure classification for a `failed` run, so the chat can render
   *  specific guidance straight off the terminal frame without a status refetch.
   *  Mirror ChatRunStatusResponse.failureCategory / failureDetail. */
  failureCategory?: RunFailureCategory | null;
  failureDetail?: RunFailureDetail | null;
  /** The daemon's verdict on the same failure: what the user should do, and
   *  whether re-running can help at all. Carried on the terminal frame for the
   *  same reason as the classification above — the chat decides which button
   *  the error card leads with, and re-deriving retryability from the detail
   *  name on the client is exactly the drift these fields exist to end.
   *  Mirror ChatRunStatusResponse.failureAction / retryable; both absent from
   *  older daemons, and absence means "no verdict", not `retryable: false`. */
  failureAction?: RunFailureAction | null;
  retryable?: boolean | null;
  strategyTask?: StrategyTaskProjectionV2;
}

export type DaemonAgentPayload =
  | { type: 'status'; label: string; model?: string; ttftMs?: number; detail?: string }
  | { type: 'text_delta'; delta: string }
  /**
   * This turn's one-time done key, emitted once before any model output. See
   * the `done_key` member of `PersistedAgentEvent` for the protocol rationale.
   */
  | { type: 'done_key'; key: string }
  /**
   * This turn's follow-up suggestions, already parsed and validated out of the
   * agent's `<od-next key="…" value="…"/>` markers. Emitted once after the
   * marker set is complete or the stream ends.
   *
   * The raw marker never reaches the client: the daemon strips it from the
   * visible text stream and checks its key against the turn's nonce, so a
   * suggestion the client receives is one the model was authorised to make.
   * A turn with no marker simply emits no event — which is also what every
   * conversation recorded before this event existed looks like, and is why the
   * client must render nothing at all rather than falling back to a default
   * list.
   */
  | { type: 'next_steps'; suggestions: string[] }
  /**
   * This turn's display intent, already parsed, key-checked, and path-resolved
   * out of the agent's `<od-focus …/>` marker. See
   * `api/artifact-focus-marker.ts` for the marker itself.
   *
   * `open` is a project-relative path the preview should show; the daemon has
   * already proven it resolves inside the project root and that the file is
   * non-empty, so the client never opens a blank tab and never asks for a path
   * the agent invented. `show` is the subset of this turn's produced files that
   * deserves a card — a filter, never an addition.
   *
   * May arrive more than once per turn: `open` fires as soon as the file has
   * content (mid-turn, deliberately), while `show` is only knowable at the end.
   * Consumers fold last-wins PER FIELD (`foldArtifactFocusSelections`), so a
   * late `show`-only event cannot retract an early `open`.
   *
   * A turn with no marker emits no event, and the client must keep its existing
   * inference exactly as-is — "no event" never means "show nothing".
   */
  | { type: 'artifact_focus'; open?: string; show?: string[] }
  | { type: 'conversation_title'; title: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'thinking_start' }
  /**
   * How much reasoning has happened **so far in the current thinking block** —
   * the progress signal that exists precisely when the reasoning text does not.
   *
   * Claude's extended thinking has a mode that is billed but withheld: the API
   * charges for the thinking tokens and returns only an encrypted signature, so
   * every `thinking_delta` carries the empty string. Measured on CLI 2.1.260:
   * 3,060 billed thinking tokens, zero characters. The blank panel is honest —
   * nothing was lost in transit — but without this event the screen has no way
   * to say "it is reasoning, and it is reasoning a lot".
   *
   * `tokens` is the CLI's own **cumulative estimate for the current block**,
   * lifted verbatim from its standalone `system`/`thinking_tokens` frames. Two
   * properties consumers may rely on:
   *  - **Cumulative, so fold it last-wins.** Never sum these. A dropped,
   *    duplicated, or replayed frame cannot corrupt a figure that is restated
   *    in full every time — and a client that reconnects mid-block gets the
   *    settled number whole rather than watching it climb from zero.
   *  - **Rebased per block.** The CLI restarts the count at each new thinking
   *    block, which is the same boundary at which the UI's "thinking" row is
   *    replaced. A decrease means "new block", not "lost progress".
   *
   * It is an **estimate**, not the bill. The settled figure
   * (`usage.output_tokens_details.thinking_tokens`) only exists once the block
   * has ended, and runs 20-60% lower; by then the row this event feeds is gone.
   * Do not substitute one for the other.
   *
   * NOT persisted — see `daemonAgentPayloadToPersistedAgentEvent`. The count
   * describes a block that is still running; once the run is over the reader
   * has the finished thinking text (or, for the withheld case, no row at all).
   *
   * Claude is the only runtime that emits it. Every other agent sends nothing,
   * and a client MUST render nothing there rather than a zero or a placeholder.
   */
  | { type: 'thinking_tokens'; tokens: number }
  | LiveArtifactSsePayload
  | LiveArtifactRefreshSsePayload
  | PlainStreamArtifactSsePayload
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: unknown;
      /** Optional wall-clock ms when the tool first started (e.g. ACP first frame). */
      startedAt?: number;
    }
  /**
   * Live-only incremental tool-input fragment, emitted while the model is still
   * streaming a tool call's JSON arguments (Claude `input_json_delta`). `delta`
   * is a raw, possibly mid-token JSON fragment — not parseable on its own.
   * NOT persisted — see `daemonAgentPayloadToPersistedAgentEvent`.
   *
   * **This event exists for its arrival time, not its payload.** The web client
   * counts it as upstream-liveness evidence for the S12 silence probe
   * (`markUpstreamActivity` in `apps/web/src/providers/daemon.ts`) and then
   * drops it: it never becomes an `AgentEvent` and is never rendered. It is the
   * probe's main heartbeat — in the recorded run `7ed15c2f` it is 699 of 1346
   * agent frames, and 124 of the 126 frames in one 161.6s window. Stop emitting
   * it and the probe starts falsely reporting silence while the model streams.
   *
   * **Do not render it.** It marks the model *composing the next* tool call,
   * not a tool executing — by the time it flows the previous tool has already
   * returned. The chat design forbids an in-flight tool row outright (D3 / B8 in
   * `specs/current/chat-panel-next.md`); in-flight feedback is the execution
   * shell's orb plus its ticking elapsed timer, and the design is explicit that
   * one such affordance is enough. `id` (the content-block id, equal to the
   * eventual `tool_use.id`) and `name` are carried for correlation only.
   */
  | { type: 'tool_input_delta'; id: string; name: string; delta: string }
  /**
   * Which file a still-streaming tool call is about to write, announced the
   * moment that path is provably complete — normally within the first few dozen
   * bytes of the arguments, while `content` still has tens of kilobytes to go.
   *
   * This is the CONCLUSION drawn from `tool_input_delta`, not a relay of it. The
   * daemon scans the argument buffer it already keeps
   * (`apps/daemon/src/runtimes/tool-input-path-scanner.ts`) and emits these
   * three fields; the arguments themselves never leave the daemon, so a 20KB
   * `content` never reaches a client. That separation is deliberate — see the
   * note on `tool_input_delta` above for why its payload must stay unrendered.
   *
   * Guarantees a client may rely on:
   *  - **At most once per `id`.** The scanner is retired when it answers.
   *  - **Complete or absent.** A path is emitted only after its closing quote,
   *    so a truncated stream yields nothing rather than half a name. Non-file
   *    tools (`Bash`, `Grep`, …) are never scanned at all.
   *  - **Stable.** `path` equals the `file_path` of the `tool_use` that follows
   *    for the same `id`, so a row built from this never renames itself.
   *  - **`startedAt` is when the daemon first saw this call** — the
   *    `content_block_start` of its `tool_use` block, NOT the moment the path
   *    finished scanning (measured 0.2s apart on a real 2.1.260 run) and NOT
   *    the moment the arguments closed (94.1s later on that same run). It is
   *    the same immovable origin `tool_input_progress` reports for this `id`,
   *    so the two events never disagree and the row's seconds never jump back.
   *
   * Why the origin has to ride on THIS event and not only on
   * `tool_input_progress`: `Edit` / `MultiEdit` / `NotebookEdit` / `replace`
   * emit no progress at all (their `−M` is unknowable mid-stream), so this is
   * the only thing those calls ever send early. Without it their row shows a
   * file name and a dead stopwatch, and — because
   * `dropSupersededInFlightToolUses` carries this origin onto the settled row —
   * the finished row falls back to the emit-time stamp and reports only the
   * disk write, hiding the whole argument stream behind a "0.1s".
   *
   * NOT persisted — see `runSseEventToPersistedAgentEvent`. After the run the
   * finished `tool_use` carries the same path, and a reloaded conversation must
   * show one row per call, not two.
   */
  | { type: 'tool_input_target'; id: string; name: string; path: string; startedAt: number }
  /**
   * How much of that file has been written **so far**, while the arguments are
   * still streaming.
   *
   * `tool_input_target` fires once, so the row it produces stands still for the
   * rest of a write — a file name and a stopwatch, with nothing to say the
   * write is still growing. A real 27.6KB page took 140 seconds in that state.
   * This is the same conclusion drawn repeatedly: the daemon counts newlines in
   * the buffer it already keeps and sends the count, never the text.
   *
   * Guarantees a client may rely on:
   *  - **Same counting rule as the finished row.** `lines` is
   *    `content.split('\n').length` — exactly what
   *    `apps/web/src/runtime/chat/format.ts` `diffStat` computes from the
   *    settled `tool_use`. The last one sent before `tool_use` arrives EQUALS
   *    that `+N`, so the number never jumps at the hand-off.
   *  - **Whole-file writes only.** `Write` / `write_file`. `Edit` and friends
   *    settle as `+N −M`, and `−M` cannot be known until `old_string` is
   *    complete — so no half of it is sent rather than passing 0 off as truth.
   *  - **Throttled, and self-describing.** At most one per argument fragment,
   *    and in practice one per ~512 characters of content, so it is a small
   *    fraction of `tool_input_delta`'s rate. It repeats `path`, so a client
   *    that only ever sees this event still has a complete early form of the
   *    call.
   *  - **`startedAt` never moves** for a given `id`: it is when the daemon first
   *    saw this call's arguments. The seconds on the row tick on the CLIENT
   *    (see `build-turn-blocks.ts`'s `liveEndMs`); the daemon must not push an
   *    event per second to make a number move.
   *
   * NOT persisted, for the same reason as `tool_input_target`.
   */
  | {
      type: 'tool_input_progress';
      id: string;
      name: string;
      path: string;
      lines: number;
      startedAt: number;
    }
  /**
   * A tool call that has STARTED but not finished, published so its row is on
   * screen while the work happens instead of only after it.
   *
   * This is the ACP bridge's counterpart to the two events above. Claude
   * streams a call's arguments, so the useful early facts are the write target
   * and how much of it exists. An ACP agent instead sends whole status frames
   * (`pending` → `in_progress` → terminal) and OD published nothing until the
   * last one: measured over 202 real AMR tool calls, **100% of every call's
   * lifetime was invisible** — bash p90 37.3s, one `task` hidden for 222.0s,
   * 855s of tool time with no row on screen.
   *
   * Why it is its own event rather than a wider `tool_input_target`:
   *  - **It repeats.** One call emits several as what the daemon knows
   *    improves. Identical payloads are never re-sent and emissions are
   *    throttled (`agent-protocol/acp/session.ts`), but a client must render
   *    the LATEST one per `id`, never the first.
   *  - **It upgrades.** ACP infers the tool name from `kind`/`title` and the
   *    path from `locations`/`rawInput`/title, so a later frame can replace a
   *    weaker guess — including replacing "no arguments at all", which is what
   *    every real first frame carries.
   *  - **`input` is a whole argument object**, not a single path, because the
   *    interesting early fact for the dominant case (bash, 58% of the hidden
   *    time) is the command, not a file.
   *
   * `id` equals the `tool_use.id` that eventually settles the same call, and
   * `startedAt` is when the daemon first saw the call — both so the client
   * retires the early form into the settled one instead of drawing a second row
   * and restarting its clock (`dropSupersededInFlightToolUses`).
   *
   * No `tool_result` ever accompanies this, and it must not make a turn count
   * as having produced concrete output. NOT persisted — see
   * `runSseEventToPersistedAgentEvent`; after the run the settled `tool_use`
   * carries the same facts, and a reloaded conversation must show one row.
   */
  | {
      type: 'tool_in_flight';
      id: string;
      name: string;
      input: unknown;
      startedAt: number;
      /** Bounded preview of the output produced so far, when the agent streams it. */
      output?: string;
    }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean; completedAt?: number }
  | { type: 'usage'; usage?: { input_tokens?: number; output_tokens?: number }; costUsd?: number; durationMs?: number; stopReason?: string | null }
  | { type: 'fabricated_role_marker'; marker: string; messageId?: string }
  // The agent is stuck repeating failing tool calls (see tool-loop-guard.ts).
  // `action: 'warn'` is an early heads-up the run may be looping; `'halt'` means
  // the daemon terminated the run at the hard ceiling. `signature` is a
  // truncated, human-readable form of the repeated action; `count` is how many
  // times it failed (consecutive run, or repeats of this exact action).
  | {
      type: 'tool_loop';
      reason: 'consecutive-errors' | 'repeated-failure';
      action: 'warn' | 'halt';
      toolName: string;
      signature: string;
      count: number;
    }
  | { type: 'raw'; line: string };

/**
 * The run-level automatic retry the daemon just started, as the browser sees it.
 *
 * The daemon writes this as an ANALYTICS record, but `runs.ts`'s `emit` is also
 * the SSE fan-out (`for (const sse of run.clients) sse.send(event, data, id)`),
 * so every analytics record reaches a subscribed client on the same stream as
 * `start` / `agent` / `end`. Declaring it here makes that delivery intentional
 * rather than incidental: the chat needs it to say "still trying" while the
 * second attempt spins up, and nothing else can tell it that the first attempt
 * died — the `error` frame for a retried attempt is deliberately cached and not
 * surfaced.
 *
 * Only the fields the UI reads are declared. The daemon sends the full
 * `RunRetryAttemptedProps` analytics shape (project/conversation ids, failure
 * classification, delays); consumers of this event must not grow a dependency
 * on those — they belong to the analytics contract, which is free to change.
 */
export interface ChatSseRunRetryAttemptedPayload {
  /** Which automatic attempt this is, 1-based. */
  retry_attempt_index: number;
  /** How many automatic attempts this run is allowed. 1 today. */
  retry_max_attempts: number;
}

/**
 * Out-of-band run diagnostics. The payload is discriminated by `type` and is
 * additive: a client ignores the types it does not know.
 */
export interface ChatSseDiagnosticPayload {
  type: string;
  [key: string]: unknown;
}

/**
 * The daemon is continuing the SAME logical task in a new physical Run. A Full
 * Plan turn spans several Runs (request -> production) that the user asked for
 * once, and the continuation carries no user prompt of its own.
 *
 * Observability only — it marks the hand-off in the source Run's event log so a
 * multi-Run turn can be reconstructed when diagnosing one. Rendering does NOT
 * read it: the client keeps the turn whole from each message's
 * `strategyTaskRunIndex`, folding the task's messages at render time. A client
 * that instead re-pointed the originating message at `nextRunId` would end up
 * showing the continuation's answer twice, next to the row the daemon persists
 * for that Run.
 */
export interface StrategyTaskContinuationDiagnostic extends ChatSseDiagnosticPayload {
  type: 'strategy_task_continuation';
  taskExecutionId: string | null;
  sourceRunId: string;
  nextRunId: string;
  inputStage: string | null;
  taskRunIndex: number | null;
}

export type ChatSseEvent =
  | SseTransportEvent<'start', ChatSseStartPayload>
  | SseTransportEvent<'run_retry_attempted', ChatSseRunRetryAttemptedPayload>
  | SseTransportEvent<'agent', DaemonAgentPayload>
  | SseTransportEvent<'stdout', ChatSseChunkPayload>
  | SseTransportEvent<'stderr', ChatSseChunkPayload>
  | SseTransportEvent<'diagnostic', ChatSseDiagnosticPayload>
  | SseTransportEvent<'error', SseErrorPayload>
  | SseTransportEvent<'end', ChatSseEndPayload>;
