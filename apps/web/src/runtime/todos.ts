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
    if (event?.kind !== 'tool_use' || event.name !== 'TodoWrite') continue;
    return parseTodoWriteInput(event.input);
  }
  return [];
}

export function unfinishedTodosFromEvents(events: AgentEvent[] | undefined): TodoItem[] {
  return latestTodosFromEvents(events).filter((todo) => todo.status !== 'completed');
}
