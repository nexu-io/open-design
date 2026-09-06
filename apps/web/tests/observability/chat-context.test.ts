// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearExceptionTrackingContext,
  setExceptionTrackingContext,
} from '../../src/analytics/error-tracking';
import {
  __resetChatContextForTest,
  chatBreadcrumbTrail,
  chatMeasurementTrust,
  setChatCorrelation,
} from '../../src/observability/chat-context';
import {
  __resetChatHealthForTest,
  openChatSurface,
} from '../../src/observability/chat-health';

/**
 * The correlation layer is what turns "the number got worse" into "the
 * number got worse HERE". These specs pin the three properties that make
 * that possible, and the one property that keeps it safe:
 *
 *   - every chat event carries the join keys (run/conversation/project),
 *   - a bad-outcome event carries the run-up, not just the moment,
 *   - a timing taken under bad conditions is labelled as such,
 *   - and none of the above ever carries user content.
 */

const fetchMock = vi.fn();
const ORIGINAL_FETCH = globalThis.fetch;

let clock = 0;

function sentEvents(): Array<{ event: string; properties: Record<string, unknown> }> {
  return fetchMock.mock.calls.map((call) => {
    const init = call[1] as RequestInit;
    return JSON.parse(init.body as string) as {
      event: string;
      properties: Record<string, unknown>;
    };
  });
}

function propsOf(name: string): Record<string, unknown> | undefined {
  return sentEvents().find((e) => e.event === name)?.properties;
}

function setHeap(usedBytes: number, limitBytes: number): void {
  (performance as unknown as { memory?: unknown }).memory = {
    usedJSHeapSize: usedBytes,
    totalJSHeapSize: usedBytes,
    jsHeapSizeLimit: limitBytes,
  };
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

function buildChatLog(rows: number): HTMLElement {
  const log = document.createElement('div');
  for (let i = 0; i < rows; i += 1) {
    const row = document.createElement('div');
    row.appendChild(document.createElement('details'));
    log.appendChild(row);
  }
  document.body.appendChild(log);
  return log;
}

beforeEach(() => {
  clock = 0;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  setExceptionTrackingContext({
    apiKey: 'phc_test',
    host: 'https://us.i.posthog.com',
    distinctId: 'chat-context-test',
  });
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  setVisibility('visible');
  document.body.innerHTML = '';
  __resetChatHealthForTest();
  __resetChatContextForTest();
});

afterEach(() => {
  __resetChatHealthForTest();
  __resetChatContextForTest();
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearExceptionTrackingContext();
  globalThis.fetch = ORIGINAL_FETCH;
  delete (performance as unknown as { memory?: unknown }).memory;
  delete (globalThis as unknown as { posthog?: unknown }).posthog;
  document.body.innerHTML = '';
});

describe('observability/chat-context — correlation', () => {
  it('stamps the join keys onto every chat event', () => {
    // Without run_id the dashboard can say "slow" but nobody can pull the
    // Langfuse trace, and triage stops at the number.
    setChatCorrelation({
      conversation_id: 'conv-1',
      project_id: 'proj-1',
      run_id: 'run-1',
      agent_id: 'vela',
      model_id: 'deepseek-v4-flash',
    });
    const log = buildChatLog(2);
    const handle = openChatSurface({ element: log, messageCount: 2, virtualized: false });
    handle.markFirstPaint({ renderedRowCount: 2 });
    handle.sample('conversation_open');

    for (const name of ['client_chat_first_paint', 'client_chat_dom_growth']) {
      const props = propsOf(name);
      expect(props, name).toBeDefined();
      expect(props?.run_id, name).toBe('run-1');
      expect(props?.conversation_id, name).toBe('conv-1');
      expect(props?.project_id, name).toBe('proj-1');
      expect(props?.agent_id, name).toBe('vela');
      expect(props?.model_id, name).toBe('deepseek-v4-flash');
    }
  });

  it('clears a key when it is set back to undefined', () => {
    // A run ending must not leave its id stamped on the next
    // conversation's idle samples, or every event looks run-attributed.
    setChatCorrelation({ conversation_id: 'conv-1', run_id: 'run-1' });
    setChatCorrelation({ run_id: undefined });
    const log = buildChatLog(1);
    const handle = openChatSurface({ element: log, messageCount: 1, virtualized: false });
    handle.sample('interval');

    const props = propsOf('client_chat_dom_growth');
    expect(props?.conversation_id).toBe('conv-1');
    expect(props && 'run_id' in props).toBe(false);
  });

  it('picks up the PostHog replay session id when replay is recording', () => {
    (globalThis as unknown as { posthog?: unknown }).posthog = {
      get_session_id: () => 'replay-abc',
    };
    const log = buildChatLog(1);
    const handle = openChatSurface({ element: log, messageCount: 1, virtualized: false });
    handle.sample('interval');
    expect(propsOf('client_chat_dom_growth')?.replay_session_id).toBe('replay-abc');
  });

  it('survives posthog-js being absent or throwing', () => {
    (globalThis as unknown as { posthog?: unknown }).posthog = {
      get_session_id: () => {
        throw new Error('not recording');
      },
    };
    const log = buildChatLog(1);
    const handle = openChatSurface({ element: log, messageCount: 1, virtualized: false });
    expect(() => handle.sample('interval')).not.toThrow();
    const props = propsOf('client_chat_dom_growth');
    expect(props).toBeDefined();
    expect(props && 'replay_session_id' in props).toBe(false);
  });
});

describe('observability/chat-context — breadcrumbs on bad outcomes', () => {
  it('attaches the run-up trail and heap trend to a memory-pressure event', () => {
    // Today's renderer death (`Reached heap limit`) produced exactly one
    // fact: it died. This is the shape that would have let someone form a
    // hypothesis without a repro.
    const limit = 1_000_000_000;
    const log = buildChatLog(3);
    const handle = openChatSurface({ element: log, messageCount: 3, virtualized: false });
    handle.markFirstPaint({ renderedRowCount: 3 });

    setHeap(0.2 * limit, limit);
    handle.sample('interval');
    clock += 1000;
    handle.runStarted('run-1');
    setHeap(0.45 * limit, limit);
    handle.sample('interval');
    clock += 1000;
    handle.runEnded('run-1');
    setHeap(0.9 * limit, limit);
    handle.sample('interval');

    const props = propsOf('client_chat_memory_pressure');
    expect(props).toBeDefined();
    expect(props?.threshold_pct).toBe(85);
    // Ascending trend, oldest first — the shape that says "leak", not "spike".
    expect(props?.heap_trend_mb).toEqual([191, 429, 858]);

    const trail = String(props?.breadcrumbs ?? '');
    expect(trail).toContain('surface_attach@');
    expect(trail).toContain('first_paint@');
    expect(trail).toContain('run_start@');
    expect(trail).toContain('run_end@');
    expect(trail).toContain('heap_band@');
    // Ordering is what makes it readable as a story.
    expect(trail.indexOf('run_start@')).toBeLessThan(trail.indexOf('run_end@'));
  });

  it('caps the breadcrumb trail so a long session cannot grow the payload', () => {
    const log = buildChatLog(1);
    const handle = openChatSurface({ element: log, messageCount: 1, virtualized: false });
    for (let i = 0; i < 200; i += 1) {
      handle.runStarted(`run-${i}`);
      handle.runEnded(`run-${i}`);
    }
    const entries = chatBreadcrumbTrail().split(',');
    expect(entries.length).toBeLessThanOrEqual(24);
  });
});

describe('observability/chat-context — measurement trust', () => {
  it('marks a first paint untrusted when the tab was hidden during the open', () => {
    // A throttled background tab reports a duration the user never
    // experienced. Counting it would inflate P95 with pure fiction.
    const log = buildChatLog(2);
    const handle = openChatSurface({ element: log, messageCount: 2, virtualized: false });
    setVisibility('hidden');
    setVisibility('visible');
    clock += 4000;
    handle.markFirstPaint({ renderedRowCount: 2 });

    const props = propsOf('client_chat_first_paint');
    expect(props?.measurement_trusted).toBe(false);
    expect(props?.untrusted_reason).toBe('document_hidden');
  });

  it('marks a first paint trusted on a clean, visible, fully-styled open', () => {
    const log = buildChatLog(2);
    const handle = openChatSurface({ element: log, messageCount: 2, virtualized: false });
    clock += 300;
    handle.markFirstPaint({ renderedRowCount: 2 });

    const props = propsOf('client_chat_first_paint');
    expect(props?.measurement_trusted).toBe(true);
    expect(props && 'untrusted_reason' in props).toBe(false);
  });

  it('distrusts a reading taken while a stylesheet has not applied yet', () => {
    // This is the failure mode that fooled a careful human observer: in
    // Next dev the CSS Module stylesheet lands after the DOM, so anything
    // measured before it reflects browser defaults, not the product.
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/late.css';
    document.head.appendChild(link);
    // jsdom never resolves the sheet, which is exactly the pending state.
    expect(chatMeasurementTrust({ hiddenDuringWindow: false })).toEqual({
      measurement_trusted: false,
      untrusted_reason: 'stylesheets_pending',
    });
    link.remove();
  });
});
