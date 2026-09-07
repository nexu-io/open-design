// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearExceptionTrackingContext,
  setExceptionTrackingContext,
} from '../../src/analytics/error-tracking';
import {
  __resetChatContextForTest,
  setChatCorrelation,
} from '../../src/observability/chat-context';
import {
  __resetChatInteractionForTest,
  installChatInteractionObserver,
} from '../../src/observability/chat-interaction';
import {
  __resetChatProtocolForTest,
  reportChatProtocolAnomaly,
  reportChatRecovery,
} from '../../src/observability/chat-protocol';

/**
 * Protocol anomalies and recovery outcomes are the two signals that
 * describe SILENT failure — nothing throws, so exception tracking never
 * sees them, and the user just reports "sometimes the buttons don't
 * appear". The specs below pin the two properties that decide whether
 * these events are usable: anomalies must not multiply on re-render, and
 * recovery attempts must NOT be collapsed, because the attempt count is
 * the signal.
 */

const fetchMock = vi.fn();
const ORIGINAL_FETCH = globalThis.fetch;

let eventCallbacks: Array<(list: { getEntries: () => unknown[] }) => void> = [];

class FakePerformanceObserver {
  static supportedEntryTypes = ['event', 'longtask'];
  private readonly cb: (list: { getEntries: () => unknown[] }) => void;
  constructor(cb: (list: { getEntries: () => unknown[] }) => void) {
    this.cb = cb;
  }
  observe(options: { type?: string }): void {
    if (options?.type === 'event') eventCallbacks.push(this.cb);
  }
  disconnect(): void {
    eventCallbacks = eventCallbacks.filter((c) => c !== this.cb);
  }
  takeRecords(): unknown[] {
    return [];
  }
}

function emitInteraction(name: string, duration: number, target: Element | null): void {
  for (const cb of eventCallbacks) {
    cb({ getEntries: () => [{ name, duration, target, entryType: 'event' }] });
  }
}

function sent(): Array<{ event: string; properties: Record<string, unknown> }> {
  return fetchMock.mock.calls.map((c) => {
    const init = c[1] as RequestInit;
    return JSON.parse(init.body as string) as {
      event: string;
      properties: Record<string, unknown>;
    };
  });
}

function allNamed(name: string): Array<Record<string, unknown>> {
  return sent().filter((e) => e.event === name).map((e) => e.properties);
}

beforeEach(() => {
  eventCallbacks = [];
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  setExceptionTrackingContext({
    apiKey: 'phc_test',
    host: 'https://us.i.posthog.com',
    distinctId: 'chat-protocol-test',
  });
  (globalThis as unknown as { PerformanceObserver: unknown }).PerformanceObserver =
    FakePerformanceObserver;
  vi.useFakeTimers({ shouldAdvanceTime: false });
  document.body.innerHTML = '';
  __resetChatProtocolForTest();
  __resetChatContextForTest();
  __resetChatInteractionForTest();
});

afterEach(() => {
  __resetChatProtocolForTest();
  __resetChatContextForTest();
  __resetChatInteractionForTest();
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearExceptionTrackingContext();
  globalThis.fetch = ORIGINAL_FETCH;
  document.body.innerHTML = '';
});

describe('observability/chat-protocol — anomalies', () => {
  it('reports an anomaly once per run, however many times render re-runs it', () => {
    // Anomalies are detected during render. Without the dedupe, a message
    // that stays on screen would emit one event per keystroke in the
    // composer — the metric would measure typing speed, not defects.
    setChatCorrelation({ run_id: 'run-1' });
    for (let i = 0; i < 50; i += 1) {
      reportChatProtocolAnomaly({ anomaly: 'question_form_parse_failed', sourceLength: 812 });
    }
    const events = allNamed('client_chat_protocol_anomaly');
    expect(events).toHaveLength(1);
    expect(events[0]?.anomaly).toBe('question_form_parse_failed');
    expect(events[0]?.source_length).toBe(812);
    expect(events[0]?.run_id).toBe('run-1');
  });

  it('keeps anomalies of different kinds, and the same kind in a different run', () => {
    setChatCorrelation({ run_id: 'run-1' });
    reportChatProtocolAnomaly({ anomaly: 'question_form_parse_failed' });
    reportChatProtocolAnomaly({ anomaly: 'next_step_marker_missing' });
    setChatCorrelation({ run_id: 'run-2' });
    reportChatProtocolAnomaly({ anomaly: 'question_form_parse_failed' });

    expect(allNamed('client_chat_protocol_anomaly')).toHaveLength(3);
  });

  it('carries a length but never the payload that failed to parse', () => {
    // The whole reason `source_length` exists instead of `source`: a
    // malformed question form is agent output about the user's project.
    setChatCorrelation({ run_id: 'run-1' });
    reportChatProtocolAnomaly({ anomaly: 'question_form_parse_failed', sourceLength: 4096 });
    const props = allNamed('client_chat_protocol_anomaly')[0] ?? {};
    expect(props.source_length).toBe(4096);
    const serialized = JSON.stringify(props);
    expect(serialized).not.toContain('question-form');
    expect(Object.keys(props)).not.toContain('source');
    expect(Object.keys(props)).not.toContain('body');
  });
});

describe('observability/chat-protocol — recovery', () => {
  it('keeps every attempt, because the attempt count IS the signal', () => {
    // Three failures then a success is a different product story from one
    // clean reconnect. Deduping recovery would erase exactly that.
    setChatCorrelation({ run_id: 'run-9', conversation_id: 'conv-9' });
    reportChatRecovery({ path: 'sse_reconnect', outcome: 'failed', attempt: 1, durationMs: 500, errorCode: 'DAEMON_STREAM_DISCONNECTED' });
    reportChatRecovery({ path: 'sse_reconnect', outcome: 'failed', attempt: 2, durationMs: 1200, errorCode: 'DAEMON_STREAM_DISCONNECTED' });
    reportChatRecovery({ path: 'sse_reconnect', outcome: 'success', attempt: 3, durationMs: 2400 });

    const events = allNamed('client_chat_recovery');
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.attempt)).toEqual([1, 2, 3]);
    expect(events.map((e) => e.outcome)).toEqual(['failed', 'failed', 'success']);
    expect(events[0]?.error_code).toBe('DAEMON_STREAM_DISCONNECTED');
    // A successful attempt must not carry a stale error code.
    expect(events[2] && 'error_code' in events[2]).toBe(false);
    // Correlation rides along so the episode can be pulled back to a run.
    expect(events[2]?.run_id).toBe('run-9');
  });
});

describe('observability/chat-interaction — input latency', () => {
  function buildChat(): { composer: HTMLElement; log: HTMLElement; outside: HTMLElement } {
    const composer = document.createElement('div');
    composer.setAttribute('data-testid', 'chat-composer');
    const textarea = document.createElement('textarea');
    composer.appendChild(textarea);

    const log = document.createElement('div');
    log.setAttribute('data-testid', 'chat-log');
    const row = document.createElement('button');
    log.appendChild(row);

    const outside = document.createElement('div');
    const other = document.createElement('button');
    outside.appendChild(other);

    document.body.append(composer, log, outside);
    return { composer: textarea, log: row, outside: other };
  }

  it('reports only the worst interaction per window, not every slow one', () => {
    // Three layers of volume control converge here. If this ever reports
    // per-interaction, a janky minute of typing becomes hundreds of
    // beacons and the telemetry becomes the jank.
    const { composer } = buildChat();
    installChatInteractionObserver();

    emitInteraction('keydown', 240, composer);
    emitInteraction('keydown', 880, composer);
    emitInteraction('keydown', 310, composer);
    vi.advanceTimersByTime(30_000);

    const events = allNamed('client_chat_interaction_latency');
    expect(events).toHaveLength(1);
    expect(events[0]?.inp_ms).toBe(880);
    expect(events[0]?.interaction_count).toBe(3);
    expect(events[0]?.event_name).toBe('keydown');
    expect(events[0]?.area).toBe('composer');
  });

  it('ignores interactions outside the chat panel', () => {
    // An event called `client_chat_*` that also counts file-viewer clicks
    // would make "chat input latency" a false statement.
    const { outside } = buildChat();
    installChatInteractionObserver();
    emitInteraction('click', 900, outside);
    vi.advanceTimersByTime(30_000);
    expect(allNamed('client_chat_interaction_latency')).toHaveLength(0);
  });

  it('labels the window as streaming exactly when a run is in flight', () => {
    const { log } = buildChat();
    installChatInteractionObserver();

    setChatCorrelation({ run_id: 'run-live' });
    emitInteraction('pointerup', 600, log);
    vi.advanceTimersByTime(30_000);

    setChatCorrelation({ run_id: undefined });
    emitInteraction('pointerup', 600, log);
    vi.advanceTimersByTime(30_000);

    const events = allNamed('client_chat_interaction_latency');
    expect(events).toHaveLength(2);
    expect(events[0]?.streaming).toBe(true);
    expect(events[0]?.area).toBe('chat_log');
    expect(events[1]?.streaming).toBe(false);
  });

  it('stops reporting after the per-session cap', () => {
    const { composer } = buildChat();
    installChatInteractionObserver();
    for (let i = 0; i < 60; i += 1) {
      emitInteraction('keydown', 500, composer);
      vi.advanceTimersByTime(30_000);
    }
    expect(allNamed('client_chat_interaction_latency').length).toBeLessThanOrEqual(20);
  });

  it('no-ops where the Event Timing API is unavailable', () => {
    // Safari and Firefox. observe() would throw; a broken observability
    // module must never take the chat panel down with it.
    (globalThis as unknown as { PerformanceObserver: unknown }).PerformanceObserver = class {
      static supportedEntryTypes = ['longtask'];
      observe(): void {
        throw new Error('unsupported');
      }
      disconnect(): void {}
    };
    expect(() => installChatInteractionObserver()()).not.toThrow();
    expect(allNamed('client_chat_interaction_latency')).toHaveLength(0);
  });
});
