import type { ChatMessage, PersistedAgentEvent } from '@open-design/contracts';

/** Preserve the existing user-facing Run verdict for both ordinary and aggregated records. */
export function effectiveTurnRunStatus(
  message: ChatMessage,
  streaming = false,
  events: PersistedAgentEvent[] = message.events ?? [],
): NonNullable<ChatMessage['runStatus']> {
  if (streaming) return 'running';
  if (message.runStatus === 'canceled') return 'canceled';
  // Delivery has its own feedback; it does not change the Run's verdict (P0-24).
  if (!message.runStatus && legacyTurnFailed(events, message.endedAt)) return 'failed';
  return message.runStatus ?? 'succeeded';
}

function legacyTurnFailed(events: PersistedAgentEvent[], endedAt: number | undefined): boolean {
  const settled = new Set<string>();
  for (const event of events) {
    if (event.kind === 'tool_result') settled.add(event.toolUseId);
  }
  return events.some(event => {
    if (event.kind === 'tool_result') return event.isError === true;
    if (event.kind !== 'tool_use') return false;
    return endedAt === undefined && !settled.has(event.id);
  });
}
