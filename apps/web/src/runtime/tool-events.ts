import type { AgentEvent } from '../types';

export function dedupeToolUsesById(events: AgentEvent[] | undefined): AgentEvent[] {
  if (!events || events.length === 0) return [];

  const seen = new Set<string>();
  let deduped: AgentEvent[] | null = null;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i]!;
    if (event.kind === 'tool_use') {
      if (seen.has(event.id)) {
        if (!deduped) deduped = events.slice(0, i);
        continue;
      }
      seen.add(event.id);
    }
    if (deduped) deduped.push(event);
  }

  return deduped ?? events;
}
