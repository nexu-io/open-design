import type { ChatMessage } from '../types';

export function appendErrorStatusEvent(message: ChatMessage, detail: string): ChatMessage {
  if (!detail) return message;
  const events = message.events ?? [];
  const last = events[events.length - 1];
  if (last?.kind === 'status' && last.label === 'error' && last.detail === detail) {
    return message;
  }
  if (!detail?.trim()) {
    return message;
  }
  return {
    ...message,
    events: [...events, { kind: 'status', label: 'error', detail }],
  };
}
