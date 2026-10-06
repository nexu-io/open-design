// @vitest-environment jsdom
//
// The one project-run-status feed every glyph surface reads (OPEND-2795,
// OPEND-2762). The rail's 最近项目 rows and the workspace tab switcher used to
// hold separate copies of it, each polling its own id set from a blank start;
// these cases pin the invariants that make the two tell one story and paint
// it with the list instead of after it.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acknowledgeProjectCompletion,
  resetProjectRunStatusStore,
  useProjectRunStatuses,
  useProjectRunSummaries,
} from '../../src/hooks/useProjectRunStatuses';
import { RUNS_CHANGED_EVENT } from '../../src/providers/daemon';

type RunFixture = { status: string; awaiting?: boolean; runId?: string; http?: number };

const DEFAULT_RUNS: Record<string, RunFixture> = {
  p1: { status: 'running' },
  p2: { status: 'succeeded', awaiting: true },
  p3: { status: 'failed' },
  p4: { status: 'succeeded', runId: 'r1' },
};

let RUNS: Record<string, RunFixture> = { ...DEFAULT_RUNS };

const originalFetch = globalThis.fetch;

function stubFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const match = /^\/api\/runs\?projectId=([^&]+)$/.exec(url);
    if (!match) {
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const id = decodeURIComponent(match[1]!);
    const fixture = RUNS[id];
    if (fixture?.http && fixture.http !== 200) {
      return new Response('{}', { status: fixture.http });
    }
    const runs = fixture
      ? [{
          id: fixture.runId ?? `run-${id}`,
          projectId: id,
          conversationId: null,
          assistantMessageId: null,
          agentId: 'claude',
          status: fixture.status,
          createdAt: 1,
          updatedAt: 2,
        }]
      : [];
    return new Response(
      JSON.stringify({ runs, awaitingInputProjectIds: fixture?.awaiting ? [id] : [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
}

function runRequests(projectId?: string): string[] {
  return vi.mocked(fetch).mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.startsWith('/api/runs?projectId=')
      && (projectId === undefined || url === `/api/runs?projectId=${projectId}`));
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  RUNS = { ...DEFAULT_RUNS };
  resetProjectRunStatusStore();
  stubFetch();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe('useProjectRunStatuses — one feed for every surface', () => {
  it('answers two surfaces asking about one project from one request', async () => {
    // The rail asks for its visible rows, the tab switcher for its open tabs.
    // Both include p1: exactly one `/api/runs?projectId=p1` may go out.
    const rail = renderHook(() => useProjectRunStatuses(['p1', 'p2']));
    const switcher = renderHook(() => useProjectRunStatuses(['p1', 'p3']));
    await flush();

    expect(runRequests('p1')).toHaveLength(1);
    expect(rail.result.current.get('p1')).toBe('running');
    expect(switcher.result.current.get('p1')).toBe('running');
    expect(rail.result.current.get('p2')).toBe('awaiting_input');
    expect(switcher.result.current.get('p3')).toBe('failed');
  });

  it('hands a remounting surface its last known statuses in the first render', async () => {
    // Leaving a project for Home remounts the rail. It must not start blank
    // and wait for the network again: the feed already knows the answer.
    const first = renderHook(() => useProjectRunStatuses(['p1', 'p4']));
    await flush();
    expect(first.result.current.get('p1')).toBe('running');
    first.unmount();

    const second = renderHook(() => useProjectRunStatuses(['p1', 'p4']));
    // Synchronously — before any request could have answered.
    expect(second.result.current.get('p1')).toBe('running');
    expect(second.result.current.get('p4')).toBe('succeeded');
    // …and it still revalidates, so a status that moved while nobody was
    // subscribed catches up without waiting for the poll.
    expect(runRequests('p1')).toHaveLength(2);
  });

  it('keeps the last known status when one read fails, rather than blanking the row', async () => {
    const { result } = renderHook(() => useProjectRunStatuses(['p1']));
    await flush();
    expect(result.current.get('p1')).toBe('running');

    RUNS = { ...DEFAULT_RUNS, p1: { status: 'running', http: 502 } };
    await act(async () => {
      window.dispatchEvent(new Event(RUNS_CHANGED_EVENT));
      await vi.advanceTimersByTimeAsync(0);
    });
    // A failed read says nothing about the project; the row must not flip to
    // its default mark and back.
    expect(result.current.get('p1')).toBe('running');
  });

  it('refreshes on the runs-changed event and keeps the poll as a backstop', async () => {
    const { result } = renderHook(() => useProjectRunStatuses(['p1']));
    await flush();
    expect(runRequests('p1')).toHaveLength(1);

    RUNS = { ...DEFAULT_RUNS, p1: { status: 'succeeded' } };
    await act(async () => {
      window.dispatchEvent(new Event(RUNS_CHANGED_EVENT));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.get('p1')).toBe('succeeded');
    expect(runRequests('p1')).toHaveLength(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(3_999); });
    expect(runRequests('p1')).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(runRequests('p1')).toHaveLength(3);
  });

  it('polls the union of every surface once per tick, not once per surface', async () => {
    renderHook(() => useProjectRunStatuses(['p1', 'p2']));
    renderHook(() => useProjectRunStatuses(['p1', 'p3']));
    await flush();
    expect(runRequests()).toHaveLength(3);

    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(runRequests()).toHaveLength(6);
    expect(runRequests('p1')).toHaveLength(2);
  });

  it('stops polling once the last surface lets go', async () => {
    const only = renderHook(() => useProjectRunStatuses(['p1']));
    await flush();
    only.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
    expect(runRequests('p1')).toHaveLength(1);
  });

  it('spends a finished run\'s ✓ on every surface at once, and re-raises it for a newer run', async () => {
    const rail = renderHook(() => useProjectRunStatuses(['p4']));
    const switcher = renderHook(() => useProjectRunStatuses(['p4', 'p1']));
    await flush();
    expect(rail.result.current.get('p4')).toBe('succeeded');
    expect(switcher.result.current.get('p4')).toBe('succeeded');

    // Opening the project (from either surface) is what spends the notice.
    act(() => { acknowledgeProjectCompletion('p4'); });
    expect(rail.result.current.get('p4')).toBeUndefined();
    expect(switcher.result.current.get('p4')).toBeUndefined();
    // Persisted per run, under the key the rail has always used.
    expect(JSON.parse(window.localStorage.getItem('od.entry.railRecentSeenDone') ?? '{}')).toEqual({
      p4: 'r1',
    });

    // A NEW finished run is a new notice for both.
    RUNS = { ...DEFAULT_RUNS, p4: { status: 'succeeded', runId: 'r2' } };
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(rail.result.current.get('p4')).toBe('succeeded');
    expect(switcher.result.current.get('p4')).toBe('succeeded');
  });

  it('only a succeeded run can be spent; running, failed and awaiting stay live', async () => {
    const { result } = renderHook(() => useProjectRunStatuses(['p1', 'p2', 'p3']));
    await flush();
    act(() => {
      acknowledgeProjectCompletion('p1');
      acknowledgeProjectCompletion('p2');
      acknowledgeProjectCompletion('p3');
    });
    expect(result.current.get('p1')).toBe('running');
    expect(result.current.get('p2')).toBe('awaiting_input');
    expect(result.current.get('p3')).toBe('failed');
    expect(window.localStorage.getItem('od.entry.railRecentSeenDone')).toBeNull();
  });

  it('exposes the raw summary (run identity included) beside the display status', async () => {
    const { result } = renderHook(() => useProjectRunSummaries(['p4']));
    await flush();
    expect(result.current.get('p4')).toEqual({
      status: 'succeeded',
      latestTerminalRunId: 'r1',
      latestTerminalUpdatedAt: 2,
    });
  });

  it('reads nothing and asks nothing while disabled', async () => {
    const { result } = renderHook(() => useProjectRunStatuses(['p1'], { enabled: false }));
    await flush();
    expect(result.current.size).toBe(0);
    expect(runRequests()).toHaveLength(0);
  });
});
