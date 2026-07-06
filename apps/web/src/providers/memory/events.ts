// SSE transport bridge for the memory event stream (`/api/memory/events`).
// `EventSource` is transport, so it lives here rather than in a feature hook.
// The stream carries two channels — `change` (the memory list mutated) and
// `extraction` (an extraction attempt progressed) — and the subscriber wires
// each to its owning cluster. Malformed frames are ignored; the browser's
// EventSource auto-reconnects on transient daemon hiccups.
import type {
  MemoryChangeEvent,
  MemoryExtractionEvent,
} from '@open-design/contracts';

export interface MemoryEventHandlers {
  onChange: (event: MemoryChangeEvent) => void;
  onExtraction: (event: MemoryExtractionEvent) => void;
}

/** Open the memory event stream. Returns an unsubscribe that closes it. */
export function subscribeMemoryEvents(handlers: MemoryEventHandlers): () => void {
  const es = new EventSource('/api/memory/events');
  es.addEventListener('change', (raw) => {
    try {
      handlers.onChange(JSON.parse((raw as MessageEvent).data) as MemoryChangeEvent);
    } catch {
      // Malformed — ignore.
    }
  });
  es.addEventListener('extraction', (raw) => {
    try {
      handlers.onExtraction(JSON.parse((raw as MessageEvent).data) as MemoryExtractionEvent);
    } catch {
      // Malformed — ignore.
    }
  });
  return () => {
    es.close();
  };
}
