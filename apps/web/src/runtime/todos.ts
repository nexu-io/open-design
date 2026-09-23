import { isTodoWriteToolName } from '@open-design/contracts';
import {
  eventsEndedByAskingUser,
  todoStatusIsUnfinished,
  turnEndedByAskingUser,
} from '@open-design/contracts';
import type { AgentEvent } from '../types';

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'stopped';

export interface TodoItem {
  content: string;
  status: TodoStatus;
  activeForm?: string;
}

export function parseTodoWriteInput(input: unknown): TodoItem[] {
  if (!input || typeof input !== 'object') return [];
  const obj = input as { plan?: unknown; todos?: unknown };
  const rawItems = Array.isArray(obj.todos)
    ? obj.todos
    : Array.isArray(obj.plan)
      ? obj.plan
      : [];
  return rawItems
    .map((todo): TodoItem | null => {
      if (!todo || typeof todo !== 'object') return null;
      const record = todo as Record<string, unknown>;
      const content =
        typeof record.content === 'string'
          ? record.content
          : typeof record.step === 'string'
            ? record.step
            : typeof record.description === 'string'
              ? record.description
              : typeof record.label === 'string'
                ? record.label
                : typeof record.text === 'string'
                  ? record.text
                  : '';
      if (!content) return null;
      const status = normalizeTodoStatus(record.status);
      return {
        content,
        status,
        activeForm:
          typeof record.activeForm === 'string'
            ? record.activeForm
            : typeof record.active_form === 'string'
              ? record.active_form
              : undefined,
      };
    })
    .filter((todo): todo is TodoItem => todo !== null);
}

function normalizeTodoStatus(status: unknown): TodoStatus {
  if (status === 'completed' || status === 'in_progress' || status === 'stopped') {
    return status;
  }
  if (status === 'cancelled' || status === 'canceled' || status === 'failed') {
    return 'stopped';
  }
  return 'pending';
}

export function latestTodosFromEvents(events: AgentEvent[] | undefined): TodoItem[] {
  if (!events) return [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.kind !== 'tool_use' || !isTodoWriteToolName(event.name)) continue;
    return parseTodoWriteInput(event.input);
  }
  return [];
}

export function unfinishedTodosFromEvents(events: AgentEvent[] | undefined): TodoItem[] {
  // Uses the SAME canonical predicate the daemon stamps `endedWithUnfinishedWork`
  // with (todoStatusIsUnfinished), so this footer and the Pet task center / project
  // pill can never disagree about whether a run's work is finished (#1247 / #1060).
  return latestTodosFromEvents(events).filter((todo) => todoStatusIsUnfinished(todo.status));
}

/**
 * Unfinished todos the user can still usefully be offered to continue.
 *
 * A stale TodoWrite snapshot is not sufficient grounds for the offer. Two
 * things outrank it, and both are the daemon's own rules read through the
 * canonical contract rather than restated here:
 *
 *  · a strategy task that already settled `completed` — a verdict the daemon
 *    only reaches after verifying the canonical deliverable on disk. The
 *    declared work IS done, and "continue" would open a fresh task with nothing
 *    left to write, which can only end blocked on `no_artifact`;
 *  · a turn that ended by ASKING (`turnEndedByAskingUser`). A clarification
 *    turn writes its plan, renders a `<question-form>`, and exits 0; its plan is
 *    the work the user's ANSWER will start. Judging it on the snapshot made the
 *    footer read "stopped with unfinished work" the moment the form was
 *    answered — under a turn that nothing had stopped (run
 *    441ff961-bd66-4c4a-91e7-812f1d489668: `succeeded`, code 0, no error) — and
 *    put "continue remaining" next to it, which would bypass the question the
 *    turn just asked.
 *
 * This has to be decided HERE, not left to the daemon's `endedWithUnfinishedWork`
 * stamp: the footer never reads that flag, it re-derives the answer from the
 * turn's own events. Fixing only the daemon leaves the chat still saying it.
 *
 * `content` is the turn's rendered text and is preferred when present — it is
 * what `hasPendingQuestionForm` reads, so the footer and the form card cannot
 * disagree about whether a form is on screen. `runStatus` gates the ask rule
 * exactly as the daemon does: a turn the USER stopped is stopped, whatever it
 * asked on the way out, and its remaining todos stay continuable.
 */
export function continuableUnfinishedTodos(
  message:
    | {
        events?: AgentEvent[];
        content?: string;
        runStatus?: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | undefined;
        strategyTaskDelivered?: boolean;
      }
    | undefined,
): TodoItem[] {
  if (!message || message.strategyTaskDelivered) return [];
  if (turnRanToCleanEnd(message.runStatus) && messageEndedByAskingUser(message)) return [];
  return unfinishedTodosFromEvents(message.events);
}

/** A turn with no recorded status is a legacy/replayed reply, which the footer
 *  already treats as a clean end (`runSucceeded` in AssistantMessage). */
function turnRanToCleanEnd(
  runStatus: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | undefined,
): boolean {
  return runStatus === undefined || runStatus === 'succeeded';
}

function messageEndedByAskingUser(
  message: { events?: AgentEvent[]; content?: string },
): boolean {
  if (typeof message.content === 'string' && message.content) {
    return turnEndedByAskingUser(message.content);
  }
  return eventsEndedByAskingUser(message.events);
}

/**
 * The task list the CURRENT turn declared — the plan pill's one source.
 *
 * It stops at the newest assistant message and answers from that message alone:
 * a turn that re-listed nothing returns `[]`, and the pill is gone. That is the
 * same rule the transcript card has always followed (D24, every turn shows only
 * its own content), and it is deliberate rather than incidental — recall hands
 * an earlier plan back to the AGENT as a fact it decides about, and the client
 * "only recognizes items the agent chose to re-emit". A pill that kept showing
 * the previous plan would be the client making that decision instead: the user
 * asked an unrelated question, the agent listed nothing, and the composer still
 * read "Step 3 of 4".
 *
 * Contrast `latestTodoWriteInputFromMessages` below, which scans the WHOLE
 * conversation for the newest snapshot. That is the right answer for a pinned
 * card that outlives a turn, and the wrong one for anything that speaks about
 * the turn in progress. The pill used it until W99 only because it predates the
 * cross-turn recall model by two months.
 *
 * Reads the turn through `latestTodosFromEvents`, the same primitive
 * `previousTodosByAssistantMessageId` uses for the card's side of the pair, so
 * "which snapshot is this turn's" cannot be answered two ways.
 */
export function todosDeclaredByLatestTurn(
  messages: ReadonlyArray<{ role: string; events?: AgentEvent[] | undefined }> | undefined,
): TodoItem[] {
  if (!messages || messages.length === 0) return [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.role !== 'assistant') continue;
    return latestTodosFromEvents(message.events);
  }
  return [];
}

// Walk the conversation in reverse to find the most recent TodoWrite
// tool_use, return its raw input so callers can hand it to a `TodoCard`
// without re-implementing the discovery logic. Returns `null` when no
// TodoWrite has been emitted yet in this conversation.
export function latestTodoWriteInputFromMessages(
  messages: ReadonlyArray<{ events?: AgentEvent[] | undefined }> | undefined,
): unknown | null {
  if (!messages || messages.length === 0) return null;
  for (let mi = messages.length - 1; mi >= 0; mi -= 1) {
    const events = messages[mi]?.events;
    if (!events || events.length === 0) continue;
    for (let ei = events.length - 1; ei >= 0; ei -= 1) {
      const event = events[ei];
      if (event?.kind !== 'tool_use') continue;
      if (!isTodoWriteToolName(event.name)) continue;
      return event.input;
    }
  }
  return null;
}

export function latestTodoWriteInputForPinnedCard<
  T extends {
    events?: AgentEvent[] | undefined;
    runStatus?: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | undefined;
    endedAt?: number | undefined;
  },
>(
  messages: ReadonlyArray<T> | undefined,
): unknown | null {
  if (!messages || messages.length === 0) return null;
  for (let mi = messages.length - 1; mi >= 0; mi -= 1) {
    const message = messages[mi];
    const events = message?.events;
    if (!events || events.length === 0) continue;
    for (let ei = events.length - 1; ei >= 0; ei -= 1) {
      const event = events[ei];
      if (event?.kind !== 'tool_use') continue;
      if (!isTodoWriteToolName(event.name)) continue;
      if (!hasTerminalRunEnded(message.runStatus, message.endedAt)) {
        return event.input;
      }
      return stoppedTodoWriteInput(event.input);
    }
  }
  return null;
}

/**
 * 转发给契约里那个**唯一**的判据 —— 这里不再自己写一份。
 *
 * 曾经全仓有三份、写法还不一致(两份精确 `===`、一份带 `/i` 的正则),
 * 于是 AMR 把名字 title-case 成 `Todowrite` 之后表现成「一半坏」:
 * 客户端画得出清单,daemon 的 `endedWithUnfinishedWork` 却漏判。
 * 保留这个导出只是为了不改动全部调用点。
 */
export { isTodoWriteToolName };

/**
 * For each assistant message, the task list this conversation had already
 * declared BEFORE it — the input `buildTurnBlocks` needs to answer "was this
 * item on screen in an earlier turn?" (D17: recall is decided by content
 * intersection, nothing semantic, no turn limit).
 *
 * Two properties matter and both are deliberate:
 *  · a turn that declared no list does NOT clear the carry — an unrelated
 *    question answered in between leaves the outstanding plan outstanding;
 *  · COMPLETED items stay in the carry. Recall is matched on content, never on
 *    status, so "召回 · 上一轮就完成的" (spec §5.2) still reads as recall when the
 *    agent re-lists it.
 *
 * Mirrors the daemon's `latestTodoWriteInputForConversation`, which walks the
 * same way when it decides what to hand back to the agent.
 */
export function previousTodosByAssistantMessageId(
  messages: ReadonlyArray<{ id: string; role: string; events?: AgentEvent[] | undefined }> | undefined,
): Map<string, TodoItem[]> {
  const byId = new Map<string, TodoItem[]>();
  if (!messages || messages.length === 0) return byId;
  let carried: TodoItem[] | null = null;
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    if (carried) byId.set(message.id, carried);
    const declared = latestTodosFromEvents(message.events);
    if (declared.length > 0) carried = declared;
  }
  return byId;
}

function hasTerminalRunEnded(
  runStatus: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | undefined,
  endedAt: number | undefined,
): boolean {
  return (
    runStatus === 'succeeded' ||
    runStatus === 'failed' ||
    runStatus === 'canceled' ||
    (runStatus === undefined && endedAt !== undefined)
  );
}

function stoppedTodoWriteInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const obj = input as { todos?: unknown; plan?: unknown };
  const key = Array.isArray(obj.todos) ? 'todos' : Array.isArray(obj.plan) ? 'plan' : null;
  if (!key) return input;
  const items = obj[key] as unknown[];
  return {
    ...(input as Record<string, unknown>),
    [key]: items.map((todo) => {
      if (!todo || typeof todo !== 'object') return todo;
      const record = todo as Record<string, unknown>;
      if (record.status !== 'in_progress') return todo;
      return {
        ...record,
        status: 'stopped',
      };
    }),
  };
}
