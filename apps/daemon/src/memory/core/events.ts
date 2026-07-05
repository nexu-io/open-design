/** @module core/events
 * Foundation of the memory domain: the in-process change bus and its change-event
 * vocabulary. Extracted out of the store so that `store/`, `extractions/`, `verify/`,
 * and `llm/` can all emit and subscribe without importing each other — this is what
 * breaks the former `store ↔ extractions` import cycle. Depends on nothing in the
 * domain; every sibling subdirectory may import it.
 */

import { EventEmitter } from 'node:events';

/**
 * Tiny in-process bus. The HTTP layer (`/api/memory/events`) subscribes to this and
 * forwards events to any open SSE client; the storage helpers emit on every write so
 * the web UI auto-refreshes whenever memory changes — whether the change came from the
 * chat hook, the LLM extractor, the settings panel, or `curl`.
 */
export const memoryEvents = new EventEmitter();
memoryEvents.setMaxListeners(64);

/** The category of a memory mutation carried on a {@link MemoryChangeEvent}. */
export type MemoryChangeKind =
  | 'upsert'
  | 'delete'
  | 'index'
  | 'config'
  | 'extract';

/**
 * Payload emitted on the `'change'` event of {@link memoryEvents}. `id`/`name`/etc. are
 * populated for `upsert` / `delete`; for `index` / `config` they are absent and the
 * frontend simply re-fetches the list. `count` lets an `extract` batch surface a single
 * "Memory updated (N new)" toast instead of one per fact.
 */
export interface MemoryChangeEvent {
  kind: MemoryChangeKind;
  // Optional details — populated for upsert / delete; absent for index /
  // config so the frontend just re-fetches the list.
  id?: string;
  name?: string;
  description?: string;
  type?: string;
  // For 'extract' events, the size of the batch that was added in one
  // pass. Lets the toast say "Memory updated (3 new)" instead of three
  // separate toasts.
  count?: number;
  source?: 'heuristic' | 'llm' | 'manual' | 'connector' | 'brand';
  enabled?: boolean;
  at: number;
}
