import type { ChatMessage } from '../types';

export function appendErrorStatusEvent(
  message: ChatMessage,
  detail: string,
  code?: string,
): ChatMessage {
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
    events: [...events, { kind: 'status', label: 'error', detail, ...(code ? { code } : {}) }],
  };
}

export function removeErrorStatusEvent(
  message: ChatMessage,
  detail: string,
  code?: string,
): ChatMessage {
  if (!detail) return message;
  const events = message.events ?? [];
  const nextEvents = events.filter((event) => {
    if (event.kind !== 'status' || event.label !== 'error') return true;
    if (event.detail !== detail) return true;
    if (code !== undefined && event.code !== code) return true;
    return false;
  });
  if (nextEvents.length === events.length) return message;
  return {
    ...message,
    events: nextEvents,
  };
}
