import type { AgentEvent } from '../types';

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'stopped';

export interface TodoItem {
  content: string;
  status: TodoStatus;
  activeForm?: string;
}

export function parseTodoWriteInput(input: unknown): TodoItem[] {
  if (!input || typeof input !== 'object') return [];
  const obj = input as { todos?: unknown };
  if (!Array.isArray(obj.todos)) return [];
  return obj.todos
    .map((todo): TodoItem | null => {
      if (!todo || typeof todo !== 'object') return null;
      const record = todo as Record<string, unknown>;
      const content = typeof record.content === 'string' ? record.content : '';
      if (!content) return null;
      const status =
        record.status === 'completed' || record.status === 'in_progress' || record.status === 'stopped'
          ? record.status
          : 'pending';
      return {
        content,
        status,
        activeForm: typeof record.activeForm === 'string' ? record.activeForm : undefined,
      };
    })
    .filter((todo): todo is TodoItem => todo !== null);
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
  return latestTodosFromEvents(events).filter((todo) => todo.status !== 'completed');
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

function isTodoWriteToolName(name: string): boolean {
  return name === 'TodoWrite' || name === 'todowrite';
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
  const obj = input as { todos?: unknown };
  if (!Array.isArray(obj.todos)) return input;
  return {
    ...(input as Record<string, unknown>),
    todos: obj.todos.map((todo) => {
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
