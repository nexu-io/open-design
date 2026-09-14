/**
 * Parses Claude Code's `--output-format stream-json --verbose` JSONL stream
 * (with or without `--include-partial-messages`) into a small set of
 * UI-friendly events. With partial messages on, text arrives as
 * `stream_event` deltas; without it (older builds <1.0.86, or any build
 * where the flag isn't passed) text arrives only in the final `assistant`
 * wrapper. We handle both. The UI only needs to know five things:
 *
 *   - status        : high-level lifecycle ("initializing", "requesting",
 *                     "thinking")
 *   - text_delta    : assistant text chunk (gets fed to the artifact parser)
 *   - thinking_delta: extended-thinking chunk (shown in a collapsed block)
 *   - tool_use      : { id, name, input }     (fires when input is complete)
 *   - tool_result   : { tool_use_id, content, is_error }
 *   - usage         : aggregated input/output/cache tokens + cost
 *
 * Callers give us `onEvent({ type, ...payload })`. We track per-content-block
 * state to accumulate partial tool_use input JSON and emit a single
 * `tool_use` event when that block stops.
 */

import { createRoleMarkerGuard, type RoleMarkerGuard } from '../role-marker-guard.js';
import {
  createClaudeChildEvidenceCollector,
  type ClaudeChildRuntimeFact,
  type ClaudeChildToolRuntimeFact,
  type ClaudeOpenChildTerminationReason,
} from './claude-child-evidence.js';
import {
  createToolInputPathScanner,
  type ToolInputPathScanner,
} from './tool-input-path-scanner.js';

type StreamEvent = Record<string, unknown>;
type EventSink = (event: StreamEvent) => void;
type BlockState = {
  type?: unknown;
  name?: unknown;
  id?: unknown;
  input: string;
  inputValue?: unknown;
  /**
   * Reads the write target — and, for whole-file writes, the running line
   * count — out of `input` as it streams. `null` for every tool that names no
   * file. It stays alive for the whole block: the path is announced exactly
   * once (the scanner itself guarantees that), but the line count has to keep
   * coming until the arguments close.
   */
  pathScanner?: ToolInputPathScanner | null;
  /**
   * 这个内容块开始的时刻 —— 在途那一行的**不动的计时起点**。
   *
   * 秒数在客户端 tick(`build-turn-blocks` 的 `liveEndMs` 每秒一次),daemon 只
   * 负责给一个不变的起点。每条计数事件各盖一个「现在」的话,行上的秒数会被一路
   * 按回 0。
   */
  startedAt?: number;
  /** 已经发出去的路径。计数事件要带着它,才能自成一条完整的早期形态。 */
  targetPath?: string;
};
type RuntimeTask = {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'stopped';
  activeForm?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export interface ClaudeStreamHandlerOptions {
  suppressHtmlArtifactsAfterFileWrite?: boolean;
  onChildRuntimeFact?: (fact: ClaudeChildRuntimeFact) => void;
  onChildToolRuntimeFact?: (fact: ClaudeChildToolRuntimeFact) => void;
  childEvidenceNow?: () => number;
  nativeBuildPackageBindings?: Readonly<Record<string, string>>;
  /** Consume forwarded Child frames only as native evidence, never as parent UI output. */
  suppressForwardedSubagentEvents?: boolean;
  /** 墙上时间。只用来给在途那一行盖一个不动的计时起点;测试注入。 */
  now?: () => number;
}

export function createClaudeStreamHandler(
  onEvent: EventSink,
  options: ClaudeStreamHandlerOptions = {},
) {
  let buffer = '';
  const now = options.now ?? (() => Date.now());
  const childEvidence = options.onChildRuntimeFact || options.onChildToolRuntimeFact
    ? createClaudeChildEvidenceCollector({
        ...(options.onChildRuntimeFact ? { onFact: options.onChildRuntimeFact } : {}),
        ...(options.onChildToolRuntimeFact
          ? { onToolFact: options.onChildToolRuntimeFact }
          : {}),
        ...(options.childEvidenceNow ? { now: options.childEvidenceNow } : {}),
        ...(options.nativeBuildPackageBindings
          ? { nativeBuildPackageBindings: options.nativeBuildPackageBindings }
          : {}),
      })
    : null;

  // Per-content-block scratch, keyed by `${messageId}:${blockIndex}`.
  const blocks = new Map<string, BlockState>();
  /**
   * Tool-use ids this handler has ALREADY EMITTED, by whichever path got there
   * first. One call must produce exactly one `tool_use`.
   *
   * Two paths can emit the same tool: `content_block_stop` (input assembled
   * from `input_json_delta`) and the final `assistant` wrapper, which Claude
   * Code replays at message end. The set used to be written by the delta path
   * only while being read by the wrapper path — it meant "streamed from deltas"
   * but was consumed as "already emitted". Whenever the wrapper arrived FIRST it
   * read an empty set, emitted, and left nothing behind, so the later
   * `content_block_stop` emitted the same id a second time. That is not
   * hypothetical: in the 2026-08-28 diagnostics bundle (packaged
   * `0.21.1-beta.4`) every claude run duplicated every tool — 47 of 47 pairs,
   * byte-identical inputs 5–25ms apart — which also pins the real frame order on
   * that build as wrapper-before-stop.
   *
   * Both paths now check it and both add to it, so the ordering cannot matter.
   * Neither path ever DEFERS to the other: whichever arrives first emits
   * immediately, so a turn where only one of them ever arrives (a cancel that
   * lands before the wrapper; an older Claude Code with no
   * `--include-partial-messages` and therefore no `content_block_stop` at all)
   * still emits exactly once. Deduping must never become dropping.
   */
  const emittedToolUseIds = new Set<string>();
  // Most recent assistant message id so content_block_* events without an id
  // can be attributed correctly.
  let currentMessageId: string | null = null;
  // Message ids that already streamed assistant text/thinking via
  // `stream_event` deltas.
  // When `--include-partial-messages` is OFF (older Claude Code, e.g. 1.0.84
  // pre-flag), no deltas arrive — only the final `assistant` wrapper carries
  // content. The fallback below emits that content once, but we must skip it for
  // newer builds that already streamed deltas, otherwise the message would
  // duplicate.
  const textStreamed = new Set<string>();
  const thinkingStreamed = new Set<string>();
  let currentMessageStreamedText = false;
  let currentMessageStreamedThinking = false;
  // Per-message role-marker guards for cross-chunk detection (#3247).
  const roleGuards = new Map<string, RoleMarkerGuard>();
  // Task rows in the order the runtime declared them. The key is a slot handle
  // this module owns, NOT the runtime's task id — the id can be rebound once
  // the runtime reports it (see `bindRuntimeTaskId`), and re-keying a Map moves
  // the entry to the end, which would silently reorder the user's plan.
  const runtimeTasks = new Map<string, RuntimeTask>();
  // Runtime task id -> slot handle. The only lookup `TaskUpdate` may use.
  const runtimeTaskSlotById = new Map<string, string>();
  // Slot handles for `TaskCreate` calls still waiting on their tool_result,
  // which is where the runtime's real id arrives.
  const pendingTaskCreateSlots = new Map<string, string>();
  // `TaskList` calls whose result we still want to read as a task snapshot.
  const pendingTaskListToolUseIds = new Set<string>();
  const canonicalTaskToolUseIds = new Set<string>();
  let nextRuntimeTaskId = 1;
  let suppressNextArtifactText = false;
  let suppressDuplicateArtifactText = false;
  let artifactOpenCandidate = '';
  let pendingArtifactText = '';
  let duplicateArtifactCandidate = '';
  const recentWriteContents: string[] = [];
  let wroteHtmlFileThisTurn = false;
  /**
   * Assistant message ids whose turn boundary has already been surfaced as
   * `turn_end`. Claude Code delivers the same `stop_reason` from two different
   * frames depending on build (see `emitTurnEndOnce`), and a build that fills
   * both would otherwise announce one turn twice.
   */
  const turnEndEmittedForMessageIds = new Set<string>();

  /**
   * Announce a turn boundary exactly once, whichever frame carried it.
   *
   * Claude Code moved this field, and we do not control which build a user has
   * installed, so all three sources stay wired:
   *
   *   1. `stream_event` → `message_delta` → `delta.stop_reason`. The ONLY place
   *      Claude Code 2.1.259 carries it: measured across six verbatim
   *      recordings of that build (`tests/fixtures/claude-cli-recordings/`),
   *      every `assistant` wrapper reported `stop_reason: null` while every
   *      `message_delta` carried the real value. Requires
   *      `--include-partial-messages`; without that flag the CLI emits no
   *      `stream_event` frames at all.
   *   2. `assistant` → `message.stop_reason`. The legacy shape. Dead on
   *      2.1.259 (always null there) but it is the only in-stream boundary an
   *      older CLI — or a fork such as `openclaude` — offers when partial
   *      messages are not negotiated. Keep it.
   *   3. The terminal `result` frame, surfaced separately as `usage`. Present
   *      on every build and every flag combination, and the only boundary left
   *      when 1 and 2 are both silent. `applyClaudeStreamJsonRunBookkeeping`
   *      treats `usage` and `turn_end` as equals for that reason.
   *
   * There is no version gate on purpose. The runtime detector does probe
   * `--version` (`detection.ts`), but nothing tells us which Claude Code
   * release stopped filling the wrapper field, and the `fallbackBins` /
   * `local-profiles` forks report version strings on their own schedules. A
   * capability probe we can trust — is the field populated? — only exists once
   * the frame is in hand, which is precisely what reading all three and
   * deduping does.
   *
   * `messageId` is null only on the legacy no-partial path (no `message_start`
   * frame and no `message.id`), where source 1 cannot exist and so there is
   * nothing to collide with.
   */
  function emitTurnEndOnce(
    messageId: string | null,
    stopReason: string,
    parentToolUseId: unknown,
  ): void {
    // `turn_end` is the MAIN turn's boundary. Under `--verbose`, a Task
    // sub-agent's frames stream inline carrying a non-null top-level
    // `parent_tool_use_id`, and its internal turn ends with its own
    // `stop_reason`. That sub-turn boundary must NOT be treated as the run's
    // turn completion: emitting `turn_end` for it would let
    // applyClaudeStreamJsonRunBookkeeping mark `turnCompletedCleanly` and close
    // stdin while the main turn is still running (so a later non-zero crash
    // with no result frame is misclassified as succeeded, #5487), and would
    // reset the per-turn artifact-echo dedup state mid-turn.
    if (parentToolUseId != null) return;
    if (messageId !== null) {
      if (turnEndEmittedForMessageIds.has(messageId)) return;
      turnEndEmittedForMessageIds.add(messageId);
    }
    onEvent({ type: 'turn_end', stopReason });
    if (stopReason !== 'tool_use') resetArtifactEchoDedupForNextTurn();
  }

  /**
   * The artifact-echo dedup below is deliberately PER TURN: it exists to
   * swallow the model quoting back a file it just wrote, and a turn that never
   * wrote anything must start from a clean slate. Leaking the state past a turn
   * boundary silently drops the next turn's genuine inline HTML artifact.
   *
   * Called from every turn boundary we can observe — `emitTurnEndOnce` and the
   * terminal `result` frame — because on a build where the in-stream boundary
   * is missing (2.1.259 without `--include-partial-messages`) `result` is the
   * only one there is, and a held-open stream-json stdin gets one `result` per
   * user turn, not one per process.
   */
  function resetArtifactEchoDedupForNextTurn(): void {
    recentWriteContents.length = 0;
    wroteHtmlFileThisTurn = false;
  }

  function normalizeTaskStatus(value: unknown): RuntimeTask['status'] {
    if (value === 'completed' || value === 'in_progress' || value === 'stopped') {
      return value;
    }
    if (value === 'complete' || value === 'done') return 'completed';
    if (value === 'doing' || value === 'active') return 'in_progress';
    if (value === 'failed' || value === 'canceled' || value === 'cancelled') return 'stopped';
    return 'pending';
  }

  function nextGeneratedRuntimeTaskId(): string {
    while (runtimeTaskSlotById.has(String(nextRuntimeTaskId))) {
      nextRuntimeTaskId += 1;
    }
    const id = String(nextRuntimeTaskId);
    nextRuntimeTaskId += 1;
    return id;
  }

  function noteRuntimeTaskId(id: string): void {
    const numericId = Number(id);
    if (Number.isSafeInteger(numericId) && numericId >= nextRuntimeTaskId) {
      nextRuntimeTaskId = numericId + 1;
    }
  }

  function runtimeTaskIdFromCreate(input: Record<string, unknown>): string {
    if (typeof input.taskId === 'string' && input.taskId) {
      noteRuntimeTaskId(input.taskId);
      return input.taskId;
    }
    return nextGeneratedRuntimeTaskId();
  }

  /**
   * Point `id` at `slot`, retiring whatever id that slot answered to before.
   *
   * Retiring the old alias is the load-bearing half. A `TaskCreate` is placed
   * under a locally minted id because its tool_result — the only place the
   * runtime states the real one — has not arrived yet. Leaving that placeholder
   * resolvable after the real id lands is what lets a `TaskUpdate` naming a task
   * from an EARLIER run land on a row created in THIS one.
   */
  function bindRuntimeTaskId(slot: string, id: string): void {
    const task = runtimeTasks.get(slot);
    if (!task) return;
    noteRuntimeTaskId(id);
    if (task.id !== id) {
      if (runtimeTaskSlotById.get(task.id) === slot) runtimeTaskSlotById.delete(task.id);
      // Re-setting an existing key keeps its position, so the plan keeps the
      // order the runtime declared it in.
      runtimeTasks.set(slot, { ...task, id });
    }
    runtimeTaskSlotById.set(id, slot);
  }

  function emitTaskSnapshot(eventId: string): void {
    onEvent({
      type: 'tool_use',
      id: eventId,
      name: 'TodoWrite',
      input: {
        todos: Array.from(runtimeTasks.values()).map(({ content, status, activeForm }) => ({
          content,
          status,
          ...(activeForm ? { activeForm } : {}),
        })),
      },
    });
  }

  function emitCanonicalTaskSnapshot(toolUseId: unknown, name: unknown, input: unknown): boolean {
    if (typeof toolUseId !== 'string' || typeof name !== 'string') return false;
    if (name === 'TaskList') {
      // The call itself still renders as an ordinary tool row; we only want to
      // read what comes back (see `absorbTaskToolResult`).
      pendingTaskListToolUseIds.add(toolUseId);
      return false;
    }
    if (!isRecord(input)) return false;
    if (canonicalTaskToolUseIds.has(toolUseId)) return true;
    let changed = false;
    if (name === 'TaskCreate') {
      const content = typeof input.subject === 'string'
        ? input.subject
        : typeof input.description === 'string'
          ? input.description
          : '';
      if (!content) return false;
      const id = runtimeTaskIdFromCreate(input);
      const slot = `create:${toolUseId}`;
      const activeForm = typeof input.activeForm === 'string' ? input.activeForm : undefined;
      runtimeTasks.set(slot, {
        id,
        content,
        status: normalizeTaskStatus(input.status),
        ...(activeForm ? { activeForm } : {}),
      });
      runtimeTaskSlotById.set(id, slot);
      pendingTaskCreateSlots.set(toolUseId, slot);
      changed = true;
    } else if (name === 'TaskUpdate') {
      if (typeof input.taskId !== 'string') return false;
      const slot = runtimeTaskSlotById.get(input.taskId);
      const existing = slot ? runtimeTasks.get(slot) : undefined;
      // An id this stream never saw belongs to an earlier run of the same
      // resumed session. Guessing which local row it meant is how the card ends
      // up reporting work nobody finished, so let it go by unapplied.
      if (!slot || !existing) return false;
      const content = typeof input.subject === 'string'
        ? input.subject
        : typeof input.description === 'string'
          ? input.description
          : existing.content;
      const activeForm = typeof input.activeForm === 'string' ? input.activeForm : existing.activeForm;
      runtimeTasks.set(slot, {
        ...existing,
        content,
        status: normalizeTaskStatus(input.status),
        ...(activeForm ? { activeForm } : {}),
      });
      changed = true;
    } else {
      return false;
    }
    canonicalTaskToolUseIds.add(toolUseId);
    if (!changed || runtimeTasks.size === 0) return false;
    emitTaskSnapshot(`${toolUseId}:todo-task`);
    return true;
  }

  /** `Task #7 created successfully: Draft copy` — the runtime stating the id. */
  const TASK_CREATED_RESULT_RE = /\bTask\s+#([A-Za-z0-9_-]+)\s+created successfully/;
  /** `#7 [in_progress] Draft copy` — one row of a `TaskList` result. */
  const TASK_LIST_ROW_RE = /^#([A-Za-z0-9_-]+)\s+\[([^\]]*)\]\s*(.*)$/;

  function mergeTaskListResult(content: string): boolean {
    let changed = false;
    for (const line of content.split('\n')) {
      const row = TASK_LIST_ROW_RE.exec(line.trim());
      if (!row) continue;
      const [, id, status, subject] = row;
      // The pattern has three groups, so a match always fills them — but this
      // project builds with `noUncheckedIndexedAccess`, where indexing a match
      // yields `string | undefined`. Narrow once here rather than asserting at
      // each of the six uses below.
      if (id === undefined || status === undefined || subject === undefined) continue;
      const slot = runtimeTaskSlotById.get(id) ?? `task:${id}`;
      const existing = runtimeTasks.get(slot);
      const next: RuntimeTask = {
        id,
        content: subject.trim() || existing?.content || '',
        status: normalizeTaskStatus(status.trim()),
        ...(existing?.activeForm ? { activeForm: existing.activeForm } : {}),
      };
      if (!next.content) continue;
      if (
        existing
        && existing.content === next.content
        && existing.status === next.status
      ) {
        continue;
      }
      runtimeTasks.set(slot, next);
      runtimeTaskSlotById.set(id, slot);
      noteRuntimeTaskId(id);
      changed = true;
    }
    return changed;
  }

  /**
   * Read the runtime's answer to a task tool call.
   *
   * Two things only reach us here and nowhere else: the id a `TaskCreate` was
   * actually given, and the full list a `TaskList` reports — which is how a plan
   * written in an earlier run of this resumed session gets back onto the card
   * instead of the card showing only what this turn happened to create.
   */
  function absorbTaskToolResult(toolUseId: unknown, content: string, isError: boolean): void {
    if (typeof toolUseId !== 'string') return;
    // Retire the pending entry either way — a failed call is still answered, and
    // leaving it pending would keep the slot waiting for a result that already
    // came. Only a successful result gets to change the plan.
    const pendingSlot = pendingTaskCreateSlots.get(toolUseId);
    if (pendingSlot !== undefined) {
      pendingTaskCreateSlots.delete(toolUseId);
      if (isError) return;
      const createdId = TASK_CREATED_RESULT_RE.exec(content)?.[1];
      if (createdId) bindRuntimeTaskId(pendingSlot, createdId);
      return;
    }
    if (!pendingTaskListToolUseIds.delete(toolUseId) || isError) return;
    if (mergeTaskListResult(content)) emitTaskSnapshot(`${toolUseId}:todo-task`);
  }

  function emitToolUse(id: unknown, name: unknown, input: unknown): void {
    if (emitCanonicalTaskSnapshot(id, name, input)) return;
    if (isFileWriteToolUse(name, input)) {
      suppressNextArtifactText = true;
      const content = fileWriteContent(input);
      if (content) {
        wroteHtmlFileThisTurn = wroteHtmlFileThisTurn || isHtmlWriteToolInput(input);
        recentWriteContents.push(normalizeArtifactEchoContent(content));
        if (recentWriteContents.length > 5) recentWriteContents.shift();
      }
    }
    onEvent({
      type: 'tool_use',
      id,
      name,
      input,
    });
  }

  function blockKey(index: unknown): string {
    return `${currentMessageId ?? 'anon'}:${index}`;
  }

  /**
   * The still-open streamed block carrying `toolUseId`, if the delta path is
   * mid-flight for that tool. `blocks` is keyed by message id + block index, so
   * an id is not directly addressable; a message holds only a handful of open
   * blocks, so the scan is cheap.
   */
  function openToolUseBlock(toolUseId: string): BlockState | null {
    for (const state of blocks.values()) {
      if (state.type === 'tool_use' && state.id === toolUseId) return state;
    }
    return null;
  }

  /**
   * The input to publish for a tool_use block seen on the `assistant` wrapper.
   *
   * The delta-assembled input wins when it is present and parses. Claude Code
   * replays finished tool calls in the wrapper "often with empty `{}` inputs",
   * so once the wrapper is allowed to emit first (it is — see
   * `emittedToolUseIds`), taking its input verbatim would let an empty object
   * overwrite the real command. Assembled JSON that fails to parse means the
   * deltas were truncated, and then the wrapper's own input is the better of
   * the two.
   */
  function wrapperToolUseInput(block: Record<string, unknown>): unknown {
    if (typeof block.id === 'string') {
      const open = openToolUseBlock(block.id);
      if (open && open.input.trim()) {
        try {
          return JSON.parse(open.input);
        } catch {
          // Truncated stream — fall back to the wrapper's own input below.
        }
      }
    }
    return block.input ?? null;
  }

  // Per-message role-marker guard (#3247). Covers text_delta ONLY.
  //
  // Why not thinking_delta: extended thinking is rendered to a
  // separate `kind: 'thinking'` payload and is never folded into
  // `m.content` by `buildDaemonTranscript` (apps/web/src/providers/daemon.ts),
  // so it cannot be re-serialized as a turn boundary on the next
  // round-trip — it is not a #3247 re-injection vector. Models
  // routinely emit literal `## user` / `## assistant` lines in
  // chain-of-thought when reasoning about conversation structure,
  // and with kill-on-detection wired in server.ts a guard on the
  // thinking channel would abort otherwise-legitimate runs without
  // any compensating security benefit. See PR #3303 review
  // r3324xxxxxx. Thinking is passed through unguarded; only the
  // user-visible text channel is policed.
  function emitSafeText(msgId: string | null, text: string, eventType: string = 'text_delta') {
    if (eventType === 'text_delta') {
      text = stripDuplicateArtifactText(text);
      if (!text) return;
    }
    if (eventType !== 'text_delta' || !msgId) {
      onEvent({ type: eventType, delta: text });
      return;
    }
    let guard = roleGuards.get(msgId);
    if (!guard) {
      guard = createRoleMarkerGuard(msgId);
      roleGuards.set(msgId, guard);
    }
    if (guard.contaminated) return;

    const safe = guard.feedText(text);
    if (safe.length > 0) {
      onEvent({ type: eventType, delta: safe });
    }
    if (guard.contaminated) {
      const warn = guard.warningEvent();
      if (warn) onEvent(warn);
    }
  }

  function stripDuplicateArtifactText(text: string): string {
    if (
      !suppressNextArtifactText &&
      !suppressDuplicateArtifactText &&
      artifactOpenCandidate.length === 0 &&
      recentWriteContents.length === 0
    ) {
      return text;
    }
    const openTag = '<artifact';
    const current = `${artifactOpenCandidate}${text}`;
    artifactOpenCandidate = '';
    if (suppressDuplicateArtifactText) {
      duplicateArtifactCandidate += current;
      const closeIndex = duplicateArtifactCandidate.indexOf('</artifact>');
      if (closeIndex === -1) return '';
      const closeEnd = closeIndex + '</artifact>'.length;
      const candidate = duplicateArtifactCandidate.slice(0, closeEnd);
      const rest = duplicateArtifactCandidate.slice(closeEnd);
      duplicateArtifactCandidate = '';
      suppressDuplicateArtifactText = false;
      suppressNextArtifactText = false;
      const duplicate = isRedundantWrittenArtifact(candidate);
      if (options.suppressHtmlArtifactsAfterFileWrite !== true) {
        recentWriteContents.length = 0;
      }
      return `${duplicate ? '' : candidate}${stripDuplicateArtifactText(rest)}`;
    }
    const openIndex = current.indexOf(openTag);
    if (openIndex === -1) {
      const candidateLength = artifactOpenCandidateLength(current, openTag);
      if ((suppressNextArtifactText || recentWriteContents.length > 0) && candidateLength > 0) {
        artifactOpenCandidate = current.slice(-candidateLength);
        return current.slice(0, -candidateLength);
      }
      return current;
    }
    suppressDuplicateArtifactText = true;
    suppressNextArtifactText = false;
    duplicateArtifactCandidate = current.slice(openIndex);
    const prefix = `${pendingArtifactText}${current.slice(0, openIndex)}`;
    pendingArtifactText = '';
    return `${prefix}${stripDuplicateArtifactText('')}`;
  }

  function isRedundantWrittenArtifact(candidate: string): boolean {
    const gt = candidate.indexOf('>');
    const close = candidate.lastIndexOf('</artifact>');
    if (gt === -1 || close === -1 || close <= gt) return false;
    if (
      options.suppressHtmlArtifactsAfterFileWrite === true &&
      isHtmlArtifact(candidate) &&
      wroteHtmlFileThisTurn
    ) return true;
    const body = normalizeArtifactEchoContent(candidate.slice(gt + 1, close));
    return recentWriteContents.some((content) => content === body);
  }

  function isHtmlArtifact(candidate: string): boolean {
    const openTag = candidate.slice(0, Math.max(0, candidate.indexOf('>') + 1));
    return /\btype\s*=\s*["']text\/html["']/i.test(openTag);
  }

  function normalizeArtifactEchoContent(value: string): string {
    return value
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .replace(/^(?:\s|\\r|\\n)+|(?:\s|\\r|\\n)+$/g, '');
  }

  function artifactOpenCandidateLength(text: string, openTag: string): number {
    const max = Math.min(openTag.length - 1, text.length);
    for (let len = max; len > 0; len -= 1) {
      if (openTag.startsWith(text.slice(-len))) return len;
    }
    return 0;
  }

  function isFileWriteToolUse(name: unknown, input: unknown): boolean {
    if (typeof name !== 'string' || !isRecord(input)) return false;
    const path = typeof input.file_path === 'string'
      ? input.file_path
      : typeof input.path === 'string'
        ? input.path
        : '';
    const writesFile = name === 'Write' ||
      name === 'Edit' ||
      name === 'write_file' ||
      name === 'replace';
    if (!writesFile) return false;
    if (/\.(html|htm|css|js|jsx|ts|tsx|md)$/iu.test(path)) return true;
    return typeof input.content === 'string' || typeof input.new_string === 'string';
  }

  function fileWriteContent(input: unknown): string | null {
    if (!isRecord(input)) return null;
    if (typeof input.content === 'string') return input.content;
    if (typeof input.new_string === 'string') return input.new_string;
    return null;
  }

  function isHtmlWriteToolInput(input: unknown): boolean {
    if (!isRecord(input)) return false;
    const rawPath = input.file_path ?? input.filePath;
    if (typeof rawPath === 'string' && /\.(?:html?|xhtml)$/i.test(rawPath)) return true;
    const content = fileWriteContent(input);
    return typeof content === 'string' && /<!doctype\s+html\b|<html\b/i.test(content);
  }

  function feed(chunk: string) {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        onEvent({ type: 'raw', line });
        continue;
      }
      handleObject(obj);
    }
  }

  function flush() {
    const rem = buffer.trim();
    buffer = '';
    if (rem) {
      try {
        handleObject(JSON.parse(rem));
      } catch {
        onEvent({ type: 'raw', line: rem });
      }
    }
    flushPendingArtifactText();
  }

  function handleObject(obj: unknown) {
    if (!isRecord(obj)) return;

    childEvidence?.observe(obj);
    if (
      options.suppressForwardedSubagentEvents === true &&
      typeof obj.parent_tool_use_id === 'string' &&
      obj.parent_tool_use_id.trim().length > 0
    ) {
      return;
    }

    if (obj.type === 'system' && obj.subtype === 'init') {
      onEvent({
        type: 'status',
        label: 'initializing',
        model: obj.model ?? null,
        sessionId: obj.session_id ?? null,
      });
      return;
    }

    if (obj.type === 'system' && obj.subtype === 'status') {
      onEvent({ type: 'status', label: obj.status ?? 'working' });
      return;
    }

    /**
     * 「它在想,而且想了多少」 —— extended thinking 唯一一个**只计费、不给字**的
     * 档位里,这是屏幕上还说得出口的事实。
     *
     * API 有一档会收下推理 token、照常计费,回来的却只有一个加密签名,`thinking`
     * 一路是空串(真机 CLI 2.1.260:3060 个计费 token、0 个字符)。那一轮用户盯着
     * 「思考中」和一只空窗看了 57 秒 —— 空窗是**诚实的**,东西真的没来;但 CLI
     * 一直在报想了多少,这一行以前把它丢在地上。
     *
     * ⚠️ **读的是这种独立系统帧,不是 `thinking_delta` 上那个同名字段。**
     * 后者在录制里一半是 `null`(每个块的收尾帧),而且非 null 时是**每帧增量**
     * 不是累计(`partial-single-turn` 第二块:系统帧 50/150/300/450,delta 报
     * 50/100/150/150),不开 `--include-partial-messages` 时更是一帧都不存在。
     * 仓库里那条「`estimated_tokens` 走不通」的旧结论量的正是那个字段,对它成立。
     * 系统帧是 55 帧全非空、两种 CLI 配置下都在的那一个。判据钉在
     * `tests/runtimes/w134-thinking-token-count.test.ts` 的语料守卫一节。
     *
     * 送的是**块内累计值**,不是增量:消费方 last-wins 就够,不必自己加。于是
     * 重连补帧、丢帧、重放都改不了这个数 —— 求和才会被那些事永久带偏。
     * 一个 thinking 块 = 屏幕上一格「思考中」,所以「块内累计」正好是「那一格的累计」;
     * 换块时 CLI 自己从小数重新开始,和那一格换新是同一个边界。
     */
    if (obj.type === 'system' && obj.subtype === 'thinking_tokens') {
      const tokens = obj.estimated_tokens;
      if (typeof tokens === 'number' && Number.isFinite(tokens) && tokens > 0) {
        onEvent({ type: 'thinking_tokens', tokens });
      }
      return;
    }

    if (obj.type === 'stream_event' && isRecord(obj.event)) {
      // `parent_tool_use_id` rides on the OUTER envelope, not on the inner
      // `event`, so the sub-agent guard needs it handed down explicitly.
      handleStreamEvent(obj.event, obj.parent_tool_use_id);
      return;
    }

    // `assistant` messages are the "block finished" signal for the current
    // content block. For tool_use blocks whose input finished assembling,
    // emit tool_use now with the final parsed input. For text blocks, emit
    // the text as a single delta — but only if no streaming deltas already
    // covered it (older Claude Code without --include-partial-messages
    // delivers text only here; newer builds stream it and would duplicate).
    if (obj.type === 'assistant' && isRecord(obj.message) && Array.isArray(obj.message.content)) {
      const explicitMsgId = typeof obj.message.id === 'string' ? obj.message.id : null;
      const textMsgId = explicitMsgId ?? (currentMessageStreamedText ? currentMessageId : null);
      const thinkingMsgId = explicitMsgId ?? (currentMessageStreamedThinking ? currentMessageId : null);
      if (explicitMsgId) currentMessageId = explicitMsgId;
      const textAlreadyStreamed = textMsgId ? textStreamed.has(textMsgId) : false;
      const thinkingAlreadyStreamed = thinkingMsgId ? thinkingStreamed.has(thinkingMsgId) : false;
      // LEGACY turn-boundary source. Claude Code 2.1.259 sets this field to
      // null on every assistant frame — it now emits one wrapper per content
      // block, and the turn's stop reason is not known yet when the first of
      // them is written. That build carries the real value on
      // `stream_event`/`message_delta` instead (see `emitTurnEndOnce`), so on a
      // current CLI this branch is inert. It stays because it is the only
      // in-stream boundary an OLDER Claude Code — or an argv-compatible fork —
      // offers when `--include-partial-messages` is not negotiated, and we do
      // not control which build a user has installed.
      //
      // Emitted AFTER the content blocks have been processed (see below), not
      // here: when `--include-partial-messages` is unsupported, tool_use events
      // surface only from this wrapper, and emitting `turn_end` before that
      // loop would let the daemon's stdin-close handler act on the turn before
      // its tool_use blocks were seen, closing stdin mid-tool. Read the
      // stop_reason now, emit after.
      const stopReason = typeof obj.message.stop_reason === 'string'
        ? obj.message.stop_reason
        : null;
      for (const block of obj.message.content) {
        if (!isRecord(block)) continue;
        if (block.type === 'tool_use') {
          if (typeof block.id === 'string') {
            if (emittedToolUseIds.has(block.id)) continue;
            emittedToolUseIds.add(block.id);
          }
          emitToolUse(block.id, block.name, wrapperToolUseInput(block));
        } else if (
          !textAlreadyStreamed &&
          block.type === 'text' &&
          typeof block.text === 'string' &&
          block.text.length > 0
        ) {
          emitSafeText(textMsgId, block.text);
        } else if (
          !thinkingAlreadyStreamed &&
          block.type === 'thinking' &&
          typeof block.thinking === 'string' &&
          block.thinking.length > 0
        ) {
          emitSafeText(thinkingMsgId, block.thinking, 'thinking_delta');
        }
      }
      // Surface the turn_end signal now that every tool_use in this
      // assistant message has been emitted, so the daemon's stdin-close
      // handler sees the final `stop_reason` before deciding whether to
      // close stream-json input stdin. The sub-agent guard and the
      // once-per-message dedup both live in `emitTurnEndOnce`.
      if (stopReason) {
        emitTurnEndOnce(explicitMsgId ?? currentMessageId, stopReason, obj.parent_tool_use_id);
      }
      // A sub-agent (parent_tool_use_id != null) in-stream error must NOT be
      // emitted as a run-level error: it condemns a main turn that has already
      // recovered (end_turn + is_error:false result + exit 0) to a false
      // `failed`. Mirror the parent_tool_use_id guard the turn_end emit above
      // already carries (#5488). Main-turn errors (connection-drop path) are
      // unaffected since they carry a null parent_tool_use_id.
      if (typeof obj.error === 'string' && obj.error.trim() && obj.parent_tool_use_id == null) {
        onEvent({
          type: 'error',
          message: assistantText(obj.message.content) || obj.error,
          code: obj.error,
        });
      }
      currentMessageStreamedText = false;
      currentMessageStreamedThinking = false;
      return;
    }

    // `user` messages in a stream-json transcript are usually tool_result
    // wrappers from prior turns.
    if (obj.type === 'user' && isRecord(obj.message) && Array.isArray(obj.message.content)) {
      for (const block of obj.message.content) {
        if (!isRecord(block)) continue;
        if (block.type === 'tool_result') {
          const content = stringifyToolResult(block.content);
          const isError = Boolean(block.is_error);
          absorbTaskToolResult(block.tool_use_id, content, isError);
          onEvent({
            type: 'tool_result',
            toolUseId: block.tool_use_id,
            content,
            isError,
          });
        }
      }
      return;
    }

    if (obj.type === 'result') {
      // An is_error result is an error termination, not a clean turn: the CLI
      // is about to exit non-zero (error_during_execution, error_max_turns,
      // resume failures) and the human-readable cause lives in errors[], not
      // in any assistant message. Washing it into a plain usage event lets the
      // close handler classify the run as succeeded with nothing surfaced.
      // Mirrors the qoder-stream result contract.
      const isError = obj.is_error === true;
      onEvent({
        type: 'usage',
        usage: obj.usage ?? null,
        costUsd: obj.total_cost_usd ?? null,
        durationMs: obj.duration_ms ?? null,
        stopReason:
          (typeof obj.stop_reason === 'string' && obj.stop_reason) ||
          (typeof obj.terminal_reason === 'string' && obj.terminal_reason) ||
          null,
        ...(isError ? { isError: true } : {}),
      });
      // A `result` frame ends ONE user turn, not the process: a stream-json
      // session whose stdin is held open emits one `result` per turn and keeps
      // reading (verified against
      // `tests/fixtures/claude-cli-recordings/claude-2.1.259-*-two-turns.jsonl`,
      // two `result` frames from a single CLI process). So it is a legitimate
      // per-turn reset point — and on a build with no in-stream boundary at all
      // (2.1.259 without `--include-partial-messages`) it is the ONLY one, which
      // is what keeps the next turn's genuine inline HTML artifact from being
      // mistaken for an echo of a file written in the previous turn.
      const resultStopReason =
        (typeof obj.stop_reason === 'string' && obj.stop_reason) ||
        (typeof obj.terminal_reason === 'string' && obj.terminal_reason) ||
        null;
      if (resultStopReason !== 'tool_use') resetArtifactEchoDedupForNextTurn();
      if (isError) {
        const message = errorResultMessage(obj);
        onEvent({
          type: 'error',
          message,
          code: isPromptTooLongResult(message)
            ? 'AGENT_PROMPT_TOO_LARGE'
            : typeof obj.subtype === 'string' && obj.subtype
              ? obj.subtype
              : 'result_error',
          // Marks this as the run's terminal error (the CLI is exiting), not an
          // in-stream hiccup. Consumers with their own result-frame
          // classification (connection test #4501) skip terminal errors.
          terminal: true,
        });
      }
      return;
    }
  }

  function errorResultMessage(obj: Record<string, unknown>): string {
    if (Array.isArray(obj.errors)) {
      const parts = obj.errors.filter(
        (entry): entry is string => typeof entry === 'string' && entry.length > 0,
      );
      if (parts.length > 0) return parts.join('\n');
    }
    if (typeof obj.result === 'string' && obj.result.trim()) return obj.result;
    if (typeof obj.subtype === 'string' && obj.subtype) return `Claude run failed: ${obj.subtype}`;
    return 'Claude run failed';
  }

  function isPromptTooLongResult(message: string): boolean {
    return /^(?:API Error:\s*)?Prompt is too long\.?$/i.test(message.trim());
  }

  function assistantText(content: unknown[]): string {
    const parts: string[] = [];
    for (const block of content) {
      if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
        parts.push(block.text);
      }
    }
    return parts.join('\n').trim();
  }

  function handleStreamEvent(ev: Record<string, unknown>, parentToolUseId: unknown = null) {
    // The turn's real `stop_reason` on Claude Code 2.1.259. It lands after
    // every `content_block_stop` of the message (verified frame-by-frame
    // against the recordings in `tests/fixtures/claude-cli-recordings/`), so by
    // the time it arrives every tool_use of the turn has already been emitted —
    // the ordering the assistant-wrapper path had to be careful about.
    if (ev.type === 'message_delta' && isRecord(ev.delta)) {
      const stopReason = typeof ev.delta.stop_reason === 'string' ? ev.delta.stop_reason : null;
      if (stopReason) emitTurnEndOnce(currentMessageId, stopReason, parentToolUseId);
      return;
    }

    if (ev.type === 'message_start') {
      flushPendingArtifactText();
      // Clean up per-message role-marker guard from the previous message.
      if (currentMessageId) roleGuards.delete(currentMessageId);
      currentMessageId = isRecord(ev.message) && typeof ev.message.id === 'string' ? ev.message.id : null;
      currentMessageStreamedText = false;
      currentMessageStreamedThinking = false;
      if (typeof ev.ttft_ms === 'number') {
        onEvent({ type: 'status', label: 'streaming', ttftMs: ev.ttft_ms });
      }
      return;
    }

    if (ev.type === 'content_block_start' && isRecord(ev.content_block)) {
      const key = blockKey(ev.index);
      const block = ev.content_block;
      blocks.set(key, {
        type: block.type,
        name: block.name,
        id: block.id,
        input: '',
        inputValue: 'input' in block ? block.input : undefined,
        pathScanner: block.type === 'tool_use' ? createToolInputPathScanner(block.name) : null,
        ...(block.type === 'tool_use' ? { startedAt: now() } : {}),
      });
      if (block.type === 'thinking') {
        onEvent({ type: 'thinking_start' });
      }
      return;
    }

    if (ev.type === 'content_block_delta' && isRecord(ev.delta)) {
      const state = blocks.get(blockKey(ev.index));
      const delta = ev.delta;

      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        if (currentMessageId) textStreamed.add(currentMessageId);
        currentMessageStreamedText = true;
        emitSafeText(currentMessageId, delta.text);
        return;
      }
      if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        /*
         * Only an delta that actually carried characters counts as "the
         * reasoning already streamed".
         *
         * Claude Code sends `thinking_delta` frames whose `thinking` is the
         * empty string — 1508 of 1707 across 32 recorded runs. Marking the
         * message as streamed on those retired the message-end fallback below,
         * which is the ONLY place the real reasoning arrives, so the whole
         * turn's thinking was dropped: the record head said 「思考中」 over an
         * empty reasoning window, and after 60s S12 replaced even that with
         * 「上游响应慢」 while the model was streaming the whole time.
         */
        if (delta.thinking.length > 0) {
          if (currentMessageId) thinkingStreamed.add(currentMessageId);
          currentMessageStreamedThinking = true;
        }
        emitSafeText(currentMessageId, delta.thinking, 'thinking_delta');
        return;
      }
      if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        if (state && state.type === 'tool_use') {
          state.input += delta.partial_json;
          if (typeof state.id === 'string' && typeof state.name === 'string') {
            onEvent({
              type: 'tool_input_delta',
              id: state.id,
              name: state.name,
              delta: delta.partial_json,
            });
            /*
             * Announce WHICH file this write is about, the moment the path is
             * provably complete — normally within the first few dozen bytes,
             * while `content` still has tens of kilobytes to go. Without this
             * the call is invisible until the last byte lands, because
             * `tool_use` only fires at `content_block_stop`.
             *
             * The scanner reads the buffer we already keep; the arguments
             * themselves never leave the daemon. `tool_input_delta`'s payload
             * stays a heartbeat nobody renders (see the note on it in
             * `packages/contracts/src/sse/chat.ts`) — this is a separate,
             * few-dozen-byte conclusion. The path fires at most once per call;
             * the scanner enforces that itself.
             *
             * 同一趟扫描顺手把正文行数数出来(W120),于是那一行**一边写一边长**,
             * 不再是一个静止的文件名 + 一个秒表。行数走节流后的
             * `tool_input_progress`,同样只有数字 —— 正文一个字节都不出 daemon。
             */
            const update = state.pathScanner?.push(delta.partial_json) ?? null;
            if (update?.path !== undefined) {
              state.targetPath = update.path;
              onEvent({
                type: 'tool_input_target',
                id: state.id,
                name: state.name,
                path: update.path,
                /*
                 * 起点必须跟着这一条一起走,因为 `Edit` / `MultiEdit` /
                 * `NotebookEdit` / `replace` **只有**这一条 —— 行数在途算不出来
                 * (`−M` 要等 `old_string` 数完),`tool_input_progress` 一条都不
                 * 发。少了它,行上有文件名而秒表不走(`build-turn-blocks` 的
                 * `spanElapsed(undefined, live)` 返回 null),而且落定之后
                 * `dropSupersededInFlightToolUses` 没有可搬的起点,结算行退回
                 * `emitAgentEvent` 出口盖的时刻 —— 那是**入参传完**的一刻,
                 * 整段流式传输被排除在外。真机 2026-09-04 实测(claude 2.1.260,
                 * 27458 字节入参)这一段是 **94.1 秒**,行上却只剩落盘的 0.1 秒。
                 *
                 * 用 `state.startedAt`(块开始那一刻)而不是此刻:此刻是**路径
                 * 扫出来**的时刻,真机那次比块开始晚 0.2 秒。同一次调用的
                 * `tool_input_progress` 用的也是它,所以两条报的是同一个起点 ——
                 * 起点在一次调用里必须不动,否则行上的秒数会被一路按回去。
                 */
                startedAt: state.startedAt ?? now(),
              });
            }
            /*
             * ⚠️ `state.targetPath !== undefined` **不是运行时守卫,是形状约束**:
             * 扫描器保证路径没出之前不报行数(`dueLineCount` 的 `pathFound`),而
             * 路径出的那一次 push 就在上面把 `targetPath` 记下了 —— 所以这个条件
             * 恒真,撤掉它任何测试都不会红。留着只为一件事:让这条事件在类型上也
             * 不可能带一个 `undefined` 的 `path`。别把它当成第二道判据。
             */
            if (update?.lines !== undefined && state.targetPath !== undefined) {
              onEvent({
                type: 'tool_input_progress',
                id: state.id,
                name: state.name,
                path: state.targetPath,
                lines: update.lines,
                startedAt: state.startedAt ?? now(),
              });
            }
          }
        }
        return;
      }
    }

    if (ev.type === 'content_block_stop') {
      const key = blockKey(ev.index);
      const state = blocks.get(key);
      // The wrapper may already have published this call (it usually gets here
      // first — see `emittedToolUseIds`); then this stop is bookkeeping only.
      const alreadyEmitted = state?.type === 'tool_use'
        && typeof state.id === 'string'
        && emittedToolUseIds.has(state.id);
      if (alreadyEmitted) {
        blocks.delete(key);
        return;
      }
      if (state && state.type === 'tool_use' && typeof state.id === 'string' && state.input.trim()) {
        try {
          emitToolUse(state.id, state.name, JSON.parse(state.input));
          emittedToolUseIds.add(state.id);
        } catch {
          // Fall through to the final assistant wrapper's input if the
          // streamed JSON is malformed or incomplete.
        }
      } else if (
        state &&
        state.type === 'tool_use' &&
        typeof state.id === 'string' &&
        state.inputValue !== undefined
      ) {
        emitToolUse(state.id, state.name, state.inputValue);
        emittedToolUseIds.add(state.id);
      }
      blocks.delete(key);
      return;
    }
  }

  function flushPendingArtifactText() {
    const text = `${pendingArtifactText}${artifactOpenCandidate}${duplicateArtifactCandidate}`;
    if (!text) return;
    pendingArtifactText = '';
    artifactOpenCandidate = '';
    duplicateArtifactCandidate = '';
    suppressNextArtifactText = false;
    suppressDuplicateArtifactText = false;
    recentWriteContents.length = 0;
    wroteHtmlFileThisTurn = false;
    emitSafeText(currentMessageId, text);
  }

  function finishOpenChildEvidence(reason: ClaudeOpenChildTerminationReason): void {
    childEvidence?.finishOpenChildren(reason);
  }

  function childEvidenceCoverage() {
    return childEvidence?.coverage();
  }

  return { feed, flush, finishOpenChildEvidence, childEvidenceCoverage };
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (isRecord(c) && c.type === 'text' ? String(c.text) : JSON.stringify(c)))
      .join('\n');
  }
  return JSON.stringify(content);
}
