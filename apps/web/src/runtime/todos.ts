import type { AgentEvent } from '../types';

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

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
        record.status === 'completed' || record.status === 'in_progress'
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

function isTodoWriteToolName(name: string): boolean {
  return name === 'TodoWrite' || name === 'todowrite';
}
