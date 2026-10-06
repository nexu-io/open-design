import { renderDoneMarker } from './done-marker.js';
import { emittedRenderableQuestionForm } from './question-form-markup.js';

/**
 * Canonical "did the run's declared work actually finish?" predicate.
 *
 * ONE definition, shared by the daemon run classifier (which stamps
 * `endedWithUnfinishedWork` onto the run/message) and the web chat footer
 * (`unfinishedTodosFromEvents` in apps/web/src/runtime/todos.ts). If these two
 * drifted, the lower-left status surfaces (Pet task center, project pill) could
 * read "Completed" while the chat footer reads "Stopped with unfinished work" —
 * the exact bug (#1247 / #1060) this module exists to make unrepresentable.
 *
 * A TodoWrite task counts as UNFINISHED when its status is anything other than
 * `completed` — i.e. `pending`, `in_progress`, or `stopped` (a task the agent
 * marked failed/canceled). This mirrors the web footer's `status !== 'completed'`
 * filter exactly. Do not narrow this to "pending or in_progress only": excluding
 * `stopped` would make a stopped-only run read "unfinished" in the footer but
 * "Completed" on the pill/Pet widget, reintroducing the divergence.
 */

/** Turn-terminal stop reasons that mean the model was cut off mid-generation
 *  rather than finishing cleanly. A run truncated here is incomplete even if its
 *  last TodoWrite looked done. Shared by the daemon capture path and the persisted
 *  events predicate so the live and reloaded verdicts agree. */
export const MID_TURN_TRUNCATION_STOP_REASONS: ReadonlySet<string> = new Set([
  'max_tokens',
  'max_output_tokens',
]);

/** True when a turn stop reason indicates a mid-generation truncation. */
export function stopReasonIsTruncation(stopReason: unknown): boolean {
  return typeof stopReason === 'string' && MID_TURN_TRUNCATION_STOP_REASONS.has(stopReason);
}

/** True when a single TodoWrite task status represents unfinished work. */
export function todoStatusIsUnfinished(status: unknown): boolean {
  return status !== 'completed';
}

interface CodeRange {
  start: number;
  end: number;
}

/**
 * Only the canonical per-run marker is completion evidence. The prompt asks
 * the model to copy this exact form and explicitly says that a fenced marker
 * is ignored, so this predicate deliberately fails closed on alternate tag
 * spellings and markers inside fenced/inline code.
 */
export function textHasAuthenticatedDoneConclusion(text: unknown, key: unknown): boolean {
  const at = authenticatedDoneMarkerIndex(text, key);
  if (at < 0 || typeof text !== 'string' || typeof key !== 'string') return false;
  return text.slice(at + renderDoneMarker(key).length).trim().length > 0;
}

/** True when the exact per-run marker occurs outside Markdown code. */
export function textHasAuthenticatedDoneMarker(text: unknown, key: unknown): boolean {
  return authenticatedDoneMarkerIndex(text, key) >= 0;
}

function authenticatedDoneMarkerIndex(text: unknown, key: unknown): number {
  if (typeof text !== 'string' || typeof key !== 'string' || !key) return -1;
  const marker = renderDoneMarker(key);
  const skipped = markdownCodeRanges(text);
  let from = 0;
  for (;;) {
    const at = text.indexOf(marker, from);
    if (at < 0) return -1;
    if (!skipped.some((range) => at >= range.start && at < range.end)) {
      return at;
    }
    from = at + marker.length;
  }
}

export interface AuthenticatedDoneCaptureState {
  markerTail: string;
  awaitingConclusion: boolean;
  authenticatedConclusion: boolean;
}

/**
 * Incremental live-stream companion to `textHasAuthenticatedDoneConclusion`.
 *
 * `fullVisibleText` is the caller's existing reply accumulator; this state
 * deliberately keeps only a marker-length tail and one boolean. Once a valid
 * marker has arrived without prose, later whitespace deltas do no rescanning;
 * the first non-whitespace delta authenticates the conclusion in O(1).
 */
export function advanceAuthenticatedDoneCapture(args: {
  fullVisibleText: string;
  delta: string;
  key: string;
  state?: Partial<AuthenticatedDoneCaptureState> | null;
}): AuthenticatedDoneCaptureState {
  const previous: AuthenticatedDoneCaptureState = {
    markerTail: args.state?.markerTail ?? '',
    awaitingConclusion: args.state?.awaitingConclusion === true,
    authenticatedConclusion: args.state?.authenticatedConclusion === true,
  };
  if (previous.authenticatedConclusion || !args.key || !args.delta) return previous;

  const marker = renderDoneMarker(args.key);
  const candidate = `${previous.markerTail}${args.delta}`;
  const markerArrived = candidate.includes(marker);
  const next: AuthenticatedDoneCaptureState = {
    ...previous,
    markerTail: candidate.slice(-(marker.length - 1)),
  };

  if (markerArrived && textHasAuthenticatedDoneMarker(args.fullVisibleText, args.key)) {
    if (textHasAuthenticatedDoneConclusion(args.fullVisibleText, args.key)) {
      next.authenticatedConclusion = true;
      next.awaitingConclusion = false;
    } else {
      next.awaitingConclusion = true;
    }
  } else if (previous.awaitingConclusion && args.delta.trim().length > 0) {
    next.authenticatedConclusion = true;
    next.awaitingConclusion = false;
  }
  return next;
}

/**
 * Persisted-event form of `textHasAuthenticatedDoneConclusion`. A `done_key`
 * without its matching marker is not evidence; neither is a marker without a
 * visible final answer after it.
 */
export function eventsHaveAuthenticatedDoneConclusion(events: unknown): boolean {
  if (!Array.isArray(events)) return false;
  let key = '';
  let text = '';
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const record = event as { kind?: unknown; key?: unknown; text?: unknown };
    if (!key && record.kind === 'done_key' && typeof record.key === 'string') {
      key = record.key.trim();
    } else if (record.kind === 'text' && typeof record.text === 'string') {
      text += record.text;
    }
  }
  return textHasAuthenticatedDoneConclusion(text, key);
}

function markdownCodeRanges(text: string): CodeRange[] {
  const ranges: CodeRange[] = [];
  let position = 0;
  let fenceStart = -1;
  while (position < text.length) {
    const eol = text.indexOf('\n', position);
    const end = eol < 0 ? text.length : eol;
    const line = text.slice(position, end);
    if (fenceStart < 0) {
      if (eol >= 0 && /^```(?:\w[\w+-]*)?\s*$/.test(line)) fenceStart = position;
    } else if (eol >= 0 && /^```\s*$/.test(line)) {
      ranges.push({ start: fenceStart, end: eol + 1 });
      fenceStart = -1;
    }
    if (eol < 0) break;
    position = eol + 1;
  }
  if (fenceStart >= 0) ranges.push({ start: fenceStart, end: text.length });

  const inline = /`[^`]+`/g;
  let match: RegExpExecArray | null;
  while ((match = inline.exec(text)) !== null) {
    if (!ranges.some((range) => match!.index >= range.start && match!.index < range.end)) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return ranges;
}

/**
 * True when the turn ended by handing the baton back to the user.
 *
 * `text` is the turn's VISIBLE assistant text. The turn asked when that text
 * rendered a `<question-form>`/`<ask-question>` the user can answer — the same
 * `emittedRenderableQuestionForm` the daemon already uses to report a project
 * as `awaiting_input` (`listPartitionsAwaitingInput` in apps/daemon/src/db.ts)
 * and to score `run_finished.asked_user_question`. This is deliberately not a
 * new product rule: it is the existing awaiting-input rule, finally consulted
 * by the surfaces that judge completeness.
 *
 * Why completeness has to ask it. A discovery/clarification turn writes its
 * plan with TodoWrite, asks its question, and exits 0 — nothing stopped it, and
 * the user's answer is the continuation. Judging that turn on its last TodoWrite
 * snapshot alone (one `in_progress` + three `pending`, zero `completed`) made
 * every surface assert a *termination cause* it had no evidence for: the chat
 * footer read "stopped with unfinished work" under a form the user was still
 * filling in, and `projectDisplayStatusForRunRow` projected the project as
 * `incomplete`. Run `441ff961-bd66-4c4a-91e7-812f1d489668` (packaged beta
 * 0.21.1-beta.7) is the recorded case: `status: succeeded`, `exitCode: 0`,
 * `signal: null`, no error of any kind, and the next turn — after the user
 * answered — delivered 34 artifacts.
 *
 * Renderable is the whole point of the predicate: a bare `<question-form` tag
 * quoted in prose, or the literal markup inside a generated HTML artifact, is
 * NOT a question. Only a closed block whose body the web parser would actually
 * turn into a form card counts, so an artifact-writing turn that happens to
 * print the tag keeps reporting its real completeness.
 *
 * Callers combine this with the run's terminal status themselves, exactly as
 * they already do for `authenticatedDoneConclusion`: a turn the user STOPPED,
 * or one that failed, is stopped whatever it asked on the way out.
 */
export function turnEndedByAskingUser(text: unknown): boolean {
  return emittedRenderableQuestionForm(text);
}

/**
 * Persisted-event form of `turnEndedByAskingUser`.
 *
 * Reassembles the turn's visible text from `kind: 'text'` events — the same
 * events `eventsHaveAuthenticatedDoneConclusion` reads, and the same array the
 * web chat footer holds — so the reloaded verdict matches the live one.
 */
export function eventsEndedByAskingUser(events: unknown): boolean {
  if (!Array.isArray(events)) return false;
  let text = '';
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const record = event as { kind?: unknown; text?: unknown };
    if (record.kind === 'text' && typeof record.text === 'string') text += record.text;
  }
  return turnEndedByAskingUser(text);
}

/**
 * True when a TodoWrite `todos` snapshot contains any unfinished task.
 *
 * `todos` is the raw `input.todos` array from a `TodoWrite` tool_use event.
 * A non-array (no plan emitted) is NOT unfinished — the absence of a declared
 * plan means a text-only answer, which must stay "Completed". An empty array is
 * likewise finished.
 */
export function todoSnapshotHasUnfinishedWork(todos: unknown): boolean {
  if (!Array.isArray(todos)) return false;
  return todos.some(
    (todo) =>
      Boolean(todo) &&
      typeof todo === 'object' &&
      todoStatusIsUnfinished((todo as { status?: unknown }).status),
  );
}

/** A TodoWrite tool_use carries its task list under `todos` (Claude / codex
 *  normalized) or `plan` (update_plan style). Mirrors parseTodoWriteInput in
 *  apps/web/src/runtime/todos.ts, which accepts both. */
function todoItemsFromToolInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as { todos?: unknown; plan?: unknown };
  if (Array.isArray(record.todos)) return record.todos;
  if (Array.isArray(record.plan)) return record.plan;
  return undefined;
}

/**
 * 「这是不是一次清单快照」—— **全仓唯一的判据**。
 *
 * 各家 runtime 的原生写法本来就不一样(claude `TodoWrite`、opencode `todowrite`、
 * codex 归一后也是 `TodoWrite`、gemini 系 `write_todos`),再加上 MCP 注入的
 * `mcp__*__todo_write`。**大小写一律不敏感**,因为判据不该依赖某一家怎么拼。
 *
 * 为什么必须不敏感 —— 一条真实的坏账(2026-08-27 复现):
 * AMR 走 vela 的 ACP 桥,而 vela **从不发 `name` 字段**,只发 `kind: 'todowrite'`。
 * OD 于是掉到 title 启发式(`agent-protocol/acp/updates.ts:438-448`),那里的
 * `/\bwrite\b/` 因为**词边界**匹配不到 `todowrite` 里的 write,最后走兜底
 * 「首词 title-case」,发出来的名字是 **`Todowrite`**(w 小写)。
 *
 * 当时全仓有**三份**判据、写法还不一致(这里和 `web/runtime/todos.ts` 是精确 `===`,
 * `web/runtime/chat/tool-kind.ts` 是带 `/i` 的正则),于是表现成**「一半坏」**——
 * 最难查的那种:客户端画得出清单,而 daemon 的 `endedWithUnfinishedWork` 漏判。
 * 讽刺的是 AMR 跑的就是 opencode 本人:直连 BYOK-opencode 一切正常,走 AMR 就没了,
 * 纯粹是传输层把名字改坏。九家 ACP runtime 同受影响。
 *
 * **不要再复制一份。** 需要这个判据的地方从这里 import。
 */
const TODO_TOOL_NAME_RE = /^(?:todowrite|todo_write|update_plan|write_todos)$|(?:^|__)todo_?write$/i;

export function isTodoWriteToolName(name: unknown): boolean {
  return typeof name === 'string' && TODO_TOOL_NAME_RE.test(name);
}

/**
 * Derive "ended with unfinished declared work" from a run's PERSISTED agent
 * events (the `events_json` the daemon writes per event, and the same array the
 * web chat footer reads). Finds the LAST TodoWrite tool_use snapshot and applies
 * the canonical predicate. Returns false when the run emitted no TodoWrite at all
 * (a text-only answer stays "Completed").
 *
 * This lets the project-status projection judge completeness from data that
 * already survives reload — no extra column — while reusing the exact predicate
 * the footer uses, so the two can never disagree (#1247 / #1060).
 */
export function eventsEndedWithUnfinishedWork(events: unknown): boolean {
  if (!Array.isArray(events)) return false;
  // A max_tokens truncation is recorded on the persisted `usage` event's
  // stopReason. It flags the run incomplete regardless of the TodoWrite state,
  // so a generation cut off mid-stream never reads "Completed" — even after the
  // in-memory run ages out.
  for (const event of events) {
    if (
      event &&
      typeof event === 'object' &&
      (event as { kind?: unknown }).kind === 'usage' &&
      stopReasonIsTruncation((event as { stopReason?: unknown }).stopReason)
    ) {
      return true;
    }
  }
  // A matching nonce plus a visible conclusion is the agent's authenticated
  // completion declaration. The per-turn contract says to emit this marker
  // only once the work is done, so it outranks an older Todo snapshot exactly
  // like the verified strategy verdict does. Truncation above still wins.
  if (eventsHaveAuthenticatedDoneConclusion(events)) return false;
  // A turn that rendered a question form did not stop with work undone — it is
  // waiting on the user, which `GET /api/projects` already reports separately as
  // `awaiting_input`. Its TodoWrite plan is the work the ANSWER will start, so
  // reading the snapshot as a termination cause projects the project
  // `incomplete` while the user is still filling in the form. Truncation above
  // still wins: a generation cut off mid-form is cut off, not waiting.
  if (eventsEndedByAskingUser(events)) return false;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (
      !event ||
      typeof event !== 'object' ||
      (event as { kind?: unknown }).kind !== 'tool_use' ||
      !isTodoWriteToolName((event as { name?: unknown }).name)
    ) {
      continue;
    }
    return todoSnapshotHasUnfinishedWork(
      todoItemsFromToolInput((event as { input?: unknown }).input),
    );
  }
  return false;
}

/** Extract a TodoWrite tool_use's task array from its input, whether the tool
 *  emitted `todos` or `plan`. Exposed so the daemon capture path folds the same
 *  shape the projection later reads. */
export function todoItemsFromTodoWriteInput(input: unknown): unknown {
  return todoItemsFromToolInput(input);
}

/**
 * True when a strategy task's own terminal verdict already proves this turn
 * delivered the work it declared.
 *
 * OD Next reaches `completed` only after the coordinator saw BOTH a succeeded
 * process AND a canonical deliverable that this Run resolved on disk
 * (`validateRunDeliverable`: the project's entry file exists, is readable, was
 * touched by the Run, and matches the project kind). That is evidence Open
 * Design produced itself. A TodoWrite snapshot is the agent's own unverified
 * narration of the same turn, and agents routinely write the artifact while
 * leaving the last checklist item on `pending`.
 *
 * When the two disagree the verified verdict wins. Otherwise a finished task
 * reads "stopped with unfinished work", the chat offers to continue work that
 * is already delivered, and taking that offer opens a SECOND task which can
 * only block — it has nothing left to write, so its deliverable validation
 * resolves `no_artifact`.
 *
 * A mid-generation truncation is deliberately NOT covered by this: the caller
 * keeps `truncatedMidTurn` as an independent term, so a turn cut off by
 * `max_tokens` stays unfinished no matter what verdict was recorded.
 */
export function strategyTaskProvesDelivery(
  strategyTask: { outcome?: unknown; terminal?: unknown } | null | undefined,
): boolean {
  return strategyTask?.terminal === true && strategyTask.outcome === 'completed';
}
