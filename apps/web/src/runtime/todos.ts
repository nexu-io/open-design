import { todoStatusIsUnfinished } from '@open-design/contracts';
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

export function isTodoWriteToolName(name: string): boolean {
  return (
    name === 'TodoWrite' ||
    name === 'todowrite' ||
    name === 'todo_write' ||
    name === 'update_plan'
  );
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
