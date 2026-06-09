import type { ChatMessage } from '../types';

export interface ErrorStatusMetadata {
  code?: string;
  diagnostic?: string;
  category?: string;
  retryDelayMs?: number;
}

export function appendErrorStatusEvent(
  message: ChatMessage,
  detail: string,
  metadata: ErrorStatusMetadata = {},
): ChatMessage {
  if (!detail?.trim()) return message;
  const events = message.events ?? [];
  const last = events[events.length - 1];
  if (
    last?.kind === 'status' &&
    last.label === 'error' &&
    last.detail === detail &&
    last.code === metadata.code &&
    last.diagnostic === metadata.diagnostic &&
    last.category === metadata.category &&
    last.retryDelayMs === metadata.retryDelayMs
  ) {
    return message;
  }
  return {
    ...message,
    events: [
      ...events,
      {
        kind: 'status',
        label: 'error',
        detail,
        ...(metadata.code ? { code: metadata.code } : {}),
        ...(metadata.diagnostic ? { diagnostic: metadata.diagnostic } : {}),
        ...(metadata.category ? { category: metadata.category } : {}),
        ...(typeof metadata.retryDelayMs === 'number' ? { retryDelayMs: metadata.retryDelayMs } : {}),
      },
    ],
  };
}
