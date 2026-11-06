// Phase 4 / spec §11.5 / plan §3.II1 — plugin event ring buffer.
//
// In-memory FIFO ring buffer of plugin lifecycle events
// (install / uninstall / upgrade / apply / snapshot-prune).
// Capped at MAX_BUFFER entries to keep daemon memory bounded
// even on a long-running install spree. Older entries fall off
// the head when the buffer is full.
//
// The buffer is read-only from outside this module. Producers
// (installer / uninstaller / apply path) call `recordPluginEvent()`;
// consumers subscribe via `subscribe()` (returns an unsubscribe
// callback) or pull `snapshot()` for a one-shot read. The route
// in server.ts wires both into a single SSE endpoint.
//
// No SQLite, no FS — pure in-memory state. A daemon restart
// resets the buffer (events survive the run, not the restart).

export type PluginEventKind =
  | 'plugin.installed'
  | 'plugin.upgraded'
  | 'plugin.uninstalled'
  | 'plugin.trust-changed'
  | 'plugin.applied'
  | 'plugin.snapshot-pruned'
  | 'plugin.marketplace-refreshed';

export interface PluginEvent {
  // Unique-per-buffer monotonically-increasing id. Resets on
  // daemon restart. Lets a CLI consumer ask 'what's new since
  // event #N?' without re-reading the whole buffer.
  id:        number;
  kind:      PluginEventKind;
  // Epoch ms.
  at:        number;
  // The plugin id this event relates to. Some events
  // (marketplace-refreshed) have no plugin id; they pass
  // pluginId='' so consumers can filter consistently.
  pluginId:  string;
  // Optional structured payload — installer ships
  // { source, version }, uninstaller ships { reason }, etc.
  details?:  Record<string, unknown>;
}

const MAX_BUFFER = 1000;

interface Subscriber {
  (event: PluginEvent): void;
}

class PluginEventBuffer {
  private buffer: PluginEvent[] = [];
  private subscribers = new Set<Subscriber>();
  private nextId = 1;

  record(input: Omit<PluginEvent, 'id' | 'at'>): PluginEvent {
    const event: PluginEvent = {
      id:       this.nextId++,
      at:       Date.now(),
      kind:     input.kind,
      pluginId: input.pluginId,
      ...(input.details ? { details: input.details } : {}),
    };
    this.buffer.push(event);
    if (this.buffer.length > MAX_BUFFER) {
      this.buffer = this.buffer.slice(this.buffer.length - MAX_BUFFER);
    }
    // Fan out to subscribers; exceptions are swallowed so a
    // misbehaving listener can't poison the buffer.
    for (const sub of this.subscribers) {
      try { sub(event); } catch { /* ignore */ }
    }
    return event;
  }

  // Returns a copy of the current buffer slice (since `since`
  // exclusive). Pass since=0 (or omit) for the whole buffer.
  snapshot(since = 0): PluginEvent[] {
    if (since <= 0) return this.buffer.slice();
    return this.buffer.filter((e) => e.id > since);
  }

  // Subscribe to live events. Returns an unsubscribe callback.
  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => { this.subscribers.delete(fn); };
  }

  // Test-only reset. Production callers never invoke this.
  reset(): void {
    this.buffer = [];
    this.subscribers.clear();
    this.nextId = 1;
  }

  size(): number { return this.buffer.length; }
}

const singleton = new PluginEventBuffer();

export function recordPluginEvent(input: Omit<PluginEvent, 'id' | 'at'>): PluginEvent {
  return singleton.record(input);
}

export function pluginEventSnapshot(since?: number): PluginEvent[] {
  return singleton.snapshot(since);
}

export function subscribePluginEvents(fn: Subscriber): () => void {
  return singleton.subscribe(fn);
}

export function pluginEventBufferSize(): number {
  return singleton.size();
}

// Test-only helper for vitest (the production path never calls
// this). Exported so vitest can clear state between cases.
export function __resetPluginEventBufferForTests(): void {
  singleton.reset();
}

// Plan §3.NN1 — operator-facing buffer reset. Distinct from
// __resetPluginEventBufferForTests because it returns the
// pre-purge stats so the caller can audit what was discarded.
// Exposed via the loopback-only `POST /api/plugins/events/purge`
// route + `od plugin events purge` CLI subcommand.
export interface PurgePluginEventBufferResult {
  purged:        number;
  // The ids of the first / last entry that was discarded, so an
  // operator who exported the buffer right before the purge can
  // confirm coverage.
  firstId:       number | null;
  lastId:        number | null;
  // The ringe buffer's nextId value PRE-purge — useful for
  // debugging 'did we lose a window of events between export
  // and purge?'.
  preNextId:     number;
}

export function purgePluginEventBuffer(): PurgePluginEventBufferResult {
  const events = singleton.snapshot();
  const result: PurgePluginEventBufferResult = {
    purged:    events.length,
    firstId:   events.length > 0 ? events[0]!.id                    : null,
    lastId:    events.length > 0 ? events[events.length - 1]!.id    : null,
    preNextId: (singleton as unknown as { nextId: number }).nextId,
  };
  singleton.reset();
  return result;
}

// Plan §3.KK2 — pure roll-up over a slice of events. Useful for
// dashboards + the `od plugin events stats` CLI summary. Lives
// next to the buffer so consumers can compute the same rollup
// shape over either the full buffer or a filtered subset.

export interface PluginEventStats {
  total:         number;
  byKind:        Record<string, number>;
  byPluginId:    Record<string, number>;
  oldestAt:      number | null;
  newestAt:      number | null;
  // Ids of the first / last entries so a CLI can echo the range
  // without re-walking the slice.
  firstId:       number | null;
  lastId:        number | null;
}

export function summarisePluginEvents(events: ReadonlyArray<PluginEvent>): PluginEventStats {
  const stats: PluginEventStats = {
    total:      events.length,
    byKind:     {},
    byPluginId: {},
    oldestAt:   null,
    newestAt:   null,
    firstId:    null,
    lastId:     null,
  };
  for (const ev of events) {
    stats.byKind[ev.kind] = (stats.byKind[ev.kind] ?? 0) + 1;
    if (ev.pluginId) {
      stats.byPluginId[ev.pluginId] = (stats.byPluginId[ev.pluginId] ?? 0) + 1;
    }
    if (typeof ev.at === 'number') {
      stats.oldestAt = stats.oldestAt === null ? ev.at : Math.min(stats.oldestAt, ev.at);
      stats.newestAt = stats.newestAt === null ? ev.at : Math.max(stats.newestAt, ev.at);
    }
    if (typeof ev.id === 'number') {
      stats.firstId = stats.firstId === null ? ev.id : Math.min(stats.firstId, ev.id);
      stats.lastId  = stats.lastId  === null ? ev.id : Math.max(stats.lastId,  ev.id);
    }
  }
  return stats;
}
