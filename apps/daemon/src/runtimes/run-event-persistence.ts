import type { PersistedAgentEvent } from '@open-design/contracts';
import { runSseEventToPersistedAgentEvent } from './persisted-agent-events.js';

export interface RunWithAssistantMessageId {
  assistantMessageId?: string | null;
}

export function persistRunEventToAssistantMessage(
  appendEvent: (messageId: string, event: PersistedAgentEvent) => void,
  run: RunWithAssistantMessageId,
  event: unknown,
  data: unknown,
  warn: (...args: unknown[]) => void = console.warn,
): void {
  if (!run.assistantMessageId) return;
  const persisted = runSseEventToPersistedAgentEvent(event, data);
  if (!persisted) return;
  try {
    appendEvent(run.assistantMessageId, persisted);
  } catch (err: unknown) {
    warn('[runs] message event persistence failed', err);
  }
}
