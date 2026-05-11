/**
 * Node-environment coverage for the critique SSE connection manager
 * (Phase 7, Task 7.2). Mirrors the shape of
 * `apps/web/tests/providers/project-events.test.ts` so a future PR that
 * unifies the two managers behind one EventSource has a single test pattern
 * to merge against.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCritiqueEventsConnection,
  critiqueEventsUrl,
  sseToPanelEvent,
} from '../../../../src/components/Theater/state/sse';
import { CRITIQUE_SSE_EVENT_NAMES } from '@open-design/contracts/critique';
import type { CritiqueSseEventName } from '@open-design/contracts/critique';

type Listener = (evt: Event) => void;

/**
 * Hand-rolled EventSource stub. The web platform's EventSource is missing
 * under the default `node` vitest environment we use here, and JSDOM's
 * implementation isn't friendly to deterministic event dispatch.
 */
class StubEventSource implements EventTarget {
  static instances: StubEventSource[] = [];

  readonly url: string;
  readonly listeners = new Map<string, Set<Listener>>();
  closed = false;

  constructor(url: string) {
    this.url = url;
    StubEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (typeof listener !== 'function') return;
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener as Listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (typeof listener !== 'function') return;
    this.listeners.get(type)?.delete(listener as Listener);
  }

  dispatchEvent(evt: Event): boolean {
    this.listeners.get(evt.type)?.forEach((l) => l(evt));
    return true;
  }

  close(): void {
    this.closed = true;
  }

  // Test helpers --------------------------------------------------------------
  emit(type: string, data: unknown): void {
    const evt = new MessageEvent(type, { data: JSON.stringify(data) });
    this.dispatchEvent(evt);
  }

  emitRaw(type: string, raw: string): void {
    const evt = new MessageEvent(type, { data: raw });
    this.dispatchEvent(evt);
  }

  fireError(): void {
    this.dispatchEvent(new Event('error'));
  }
}

const RUN_ID = 'run_sse';

beforeEach(() => {
  StubEventSource.instances = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('critique SSE connection manager (Phase 7.2)', () => {
  it('opens an EventSource at /api/projects/:id/events', () => {
    const conn = createCritiqueEventsConnection('proj-1', () => undefined, {
      EventSourceCtor: StubEventSource as unknown as typeof EventSource,
    });
    expect(StubEventSource.instances).toHaveLength(1);
    expect(StubEventSource.instances[0]!.url).toBe(critiqueEventsUrl('proj-1'));
    conn.close();
  });

  it('subscribes to every CRITIQUE_SSE_EVENT_NAMES channel', () => {
    createCritiqueEventsConnection('proj-1', () => undefined, {
      EventSourceCtor: StubEventSource as unknown as typeof EventSource,
    });
    const es = StubEventSource.instances[0]!;
    for (const name of CRITIQUE_SSE_EVENT_NAMES) {
      expect(es.listeners.has(name)).toBe(true);
    }
  });

  it('decodes critique.run_started and dispatches a PanelEvent with the unwrapped type', () => {
    const seen: unknown[] = [];
    createCritiqueEventsConnection('proj-1', (action) => seen.push(action), {
      EventSourceCtor: StubEventSource as unknown as typeof EventSource,
    });
    const es = StubEventSource.instances[0]!;

    es.emit('critique.run_started', {
      runId: RUN_ID,
      protocolVersion: 1,
      cast: ['critic'],
      maxRounds: 3,
      threshold: 8,
      scale: 10,
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      type: 'run_started',
      runId: RUN_ID,
      protocolVersion: 1,
      cast: ['critic'],
      maxRounds: 3,
      threshold: 8,
      scale: 10,
    });
  });

  it('decodes critique.ship preserving artifactRef + status', () => {
    const seen: unknown[] = [];
    createCritiqueEventsConnection('proj-1', (a) => seen.push(a), {
      EventSourceCtor: StubEventSource as unknown as typeof EventSource,
    });
    StubEventSource.instances[0]!.emit('critique.ship', {
      runId: RUN_ID,
      round: 1,
      composite: 8.6,
      status: 'shipped',
      artifactRef: { projectId: 'p1', artifactId: 'a1' },
      summary: 'ok',
    });
    expect(seen[0]).toEqual({
      type: 'ship',
      runId: RUN_ID,
      round: 1,
      composite: 8.6,
      status: 'shipped',
      artifactRef: { projectId: 'p1', artifactId: 'a1' },
      summary: 'ok',
    });
  });

  it('drops a malformed payload (parse error) instead of throwing the stream', () => {
    const seen: unknown[] = [];
    createCritiqueEventsConnection('proj-1', (a) => seen.push(a), {
      EventSourceCtor: StubEventSource as unknown as typeof EventSource,
    });
    const es = StubEventSource.instances[0]!;

    // `not json` triggers JSON.parse to throw; the handler must swallow it.
    es.emitRaw('critique.run_started', 'not json');

    // The next valid frame still lands.
    es.emit('critique.panelist_open', { runId: RUN_ID, round: 1, role: 'critic' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: 'panelist_open' });
  });

  it('reconnects with exponential backoff on error and resets backoff on ready', () => {
    let now = 0;
    const queue: Array<{ at: number; fn: () => void }> = [];
    const setTimeoutFn = ((fn: () => void, delay: number) => {
      queue.push({ at: now + delay, fn });
      return queue.length as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    createCritiqueEventsConnection('proj-1', () => undefined, {
      EventSourceCtor: StubEventSource as unknown as typeof EventSource,
      initialBackoffMs: 1000,
      maxBackoffMs: 30_000,
      setTimeoutFn,
    });
    expect(StubEventSource.instances).toHaveLength(1);

    // First failure -> schedule reconnect at +1000ms with backoff doubling
    // to 2000 for next time.
    StubEventSource.instances[0]!.fireError();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.at).toBe(1000);

    // Drain the scheduled reconnect.
    now = queue[0]!.at;
    queue.shift()!.fn();
    expect(StubEventSource.instances).toHaveLength(2);

    // A successful `ready` resets the backoff to the initial value.
    StubEventSource.instances[1]!.dispatchEvent(new Event('ready'));
    // Next failure should re-arm at +1000ms, not at +2000ms.
    StubEventSource.instances[1]!.fireError();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.at - now).toBe(1000);
  });

  it('close() cancels pending reconnects and stops the live source', () => {
    const queue: Array<{ at: number; fn: () => void }> = [];
    const cancelled: Array<number> = [];
    const setTimeoutFn = ((fn: () => void, delay: number) => {
      queue.push({ at: delay, fn });
      return queue.length as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    const clearTimeoutFn = ((id: number) => {
      cancelled.push(id);
    }) as typeof clearTimeout;

    const conn = createCritiqueEventsConnection('proj-1', () => undefined, {
      EventSourceCtor: StubEventSource as unknown as typeof EventSource,
      setTimeoutFn,
      clearTimeoutFn,
    });

    StubEventSource.instances[0]!.fireError();
    expect(queue).toHaveLength(1);

    conn.close();
    expect(cancelled).toHaveLength(1);
    expect(StubEventSource.instances[0]!.closed).toBe(true);
  });

  it('returns a no-op connection when EventSource is unavailable', () => {
    // No EventSource constructor in node by default; the manager must not
    // crash, just return a closeable no-op so the hook can guard with
    // `enabled=false` without an extra check.
    const conn = createCritiqueEventsConnection('proj-1', () => undefined, {
      EventSourceCtor: undefined,
    });
    expect(typeof conn.close).toBe('function');
    // close() on a no-op must not throw.
    conn.close();
  });
});

describe('sseToPanelEvent (Phase 7.2)', () => {
  it('strips the `critique.` prefix and merges the data payload', () => {
    const action = sseToPanelEvent('critique.degraded' as CritiqueSseEventName, {
      runId: RUN_ID,
      reason: 'malformed_block',
      adapter: 'pi-rpc',
    });
    expect(action).toEqual({
      type: 'degraded',
      runId: RUN_ID,
      reason: 'malformed_block',
      adapter: 'pi-rpc',
    });
  });

  it('returns null for non-object payloads (defensive, never thrown into the reducer)', () => {
    expect(sseToPanelEvent('critique.run_started' as CritiqueSseEventName, null)).toBeNull();
    expect(sseToPanelEvent('critique.run_started' as CritiqueSseEventName, 'oops')).toBeNull();
    expect(sseToPanelEvent('critique.run_started' as CritiqueSseEventName, 42)).toBeNull();
  });

  it('refuses to let a payload-provided `type` override the channel-derived one', () => {
    // Lefarcen P1 (#1307 review): without this guard a malformed or
    // compromised SSE frame on the `critique.run_started` channel
    // could carry { type: 'ship', ... } in its payload and end up
    // dispatched as a ship action. The spread order pins `type` last
    // AND we re-validate via isPanelEvent before returning.
    const action = sseToPanelEvent('critique.run_started' as CritiqueSseEventName, {
      type: 'ship', // hostile field
      runId: RUN_ID,
      protocolVersion: 1,
      cast: ['critic'],
      maxRounds: 3,
      threshold: 8,
      scale: 10,
    });
    expect(action).not.toBeNull();
    expect(action?.type).toBe('run_started');
  });

  it('drops a payload that does not carry the required runId (isPanelEvent guard)', () => {
    expect(
      sseToPanelEvent('critique.run_started' as CritiqueSseEventName, {
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      }),
    ).toBeNull();
  });

  it('drops a payload with an empty runId string', () => {
    expect(
      sseToPanelEvent('critique.run_started' as CritiqueSseEventName, {
        runId: '',
        protocolVersion: 1,
        cast: ['critic'],
        maxRounds: 3,
        threshold: 8,
        scale: 10,
      }),
    ).toBeNull();
  });
});
