// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import type { ChatRunStatusResponse } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectRunSummaries } from '../../src/hooks/useProjectRunStatuses';
import { RUNS_CHANGED_EVENT } from '../../src/providers/daemon';

type PendingRequest = {
  readonly projectId: string;
  readonly resolve: (response: Response) => void;
};

const pendingRequests: PendingRequest[] = [];

function run(
  projectId: string,
  status: ChatRunStatusResponse['status'],
  updatedAt: number,
): ChatRunStatusResponse {
  return {
    id: `${projectId}-${updatedAt === 0 ? 'history' : 'current'}`,
    projectId,
    conversationId: null,
    assistantMessageId: null,
    agentId: 'claude',
    status,
    createdAt: updatedAt === 0 ? 0 : 1,
    updatedAt,
  };
}

function snapshot(
  projectId: string,
  status: ChatRunStatusResponse['status'],
  updatedAt: number,
): { readonly runs: ChatRunStatusResponse[]; readonly awaitingInputProjectIds: string[] } {
  return {
    runs: [
      run(projectId, 'succeeded', 0),
      run(projectId, status, updatedAt),
    ],
    awaitingInputProjectIds: [],
  };
}

async function answer(
  requestIndex: number,
  body: ReturnType<typeof snapshot>,
): Promise<void> {
  const request = pendingRequests[requestIndex];
  if (!request) throw new Error(`No pending request at index ${requestIndex}`);
  await act(async () => {
    request.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
}

async function announceRunsChanged(): Promise<void> {
  await act(async () => window.dispatchEvent(new Event(RUNS_CHANGED_EVENT)));
}

beforeEach(() => {
  vi.useFakeTimers();
  pendingRequests.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const match = /^\/api\/runs\?projectId=([^&]+)$/.exec(url);
      const encodedProjectId = match?.[1];
      if (!encodedProjectId) return Promise.resolve(new Response('{}', { status: 200 }));
      return new Promise<Response>((resolve) => {
        pendingRequests.push({ projectId: decodeURIComponent(encodedProjectId), resolve });
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useProjectRunSummaries refresh ordering', () => {
  it('keeps a newer active snapshot when an older terminal refresh completes last', async () => {
    // Given two overlapping refreshes for the same project.
    const hook = renderHook(() => useProjectRunSummaries(['p1']));
    await announceRunsChanged();

    // When a distinct new run starts, its snapshot retains the old terminal history.
    const terminalSnapshot = snapshot('p1', 'succeeded', 1);
    const activeSnapshot = {
      ...terminalSnapshot,
      runs: [...terminalSnapshot.runs, { ...run('p1', 'running', 2), id: 'p1-next' }],
    };
    await answer(1, activeSnapshot);
    expect(hook.result.current.get('p1')?.status).toBe('running');
    await answer(0, terminalSnapshot);

    // Then the stale terminal response cannot roll the project backward.
    expect(hook.result.current.get('p1')?.status).toBe('running');
  });

  it('keeps a newer terminal snapshot when an older active refresh completes last', async () => {
    // Given an active run that finishes while two refreshes overlap.
    const hook = renderHook(() => useProjectRunSummaries(['p1']));
    await announceRunsChanged();

    // When the terminal snapshot applies before the stale active snapshot resolves.
    await answer(1, snapshot('p1', 'succeeded', 3));
    expect(hook.result.current.get('p1')?.status).toBe('succeeded');
    await answer(0, snapshot('p1', 'running', 2));

    // Then the stale active response cannot resurrect the finished run.
    expect(hook.result.current.get('p1')?.status).toBe('succeeded');
  });

  it('applies useful slow-poll results while a later refresh is still pending', async () => {
    // Given every poll overlaps the next four-second interval.
    const hook = renderHook(() => useProjectRunSummaries(['p1']));
    await act(async () => vi.advanceTimersByTimeAsync(4_000));
    expect(pendingRequests).toHaveLength(2);

    // When the first useful response arrives after the second refresh started.
    await answer(0, snapshot('p1', 'running', 1));

    // Then it makes progress instead of waiting for the latest-started refresh.
    expect(hook.result.current.get('p1')?.status).toBe('running');

    // When another interval starts before the second response arrives.
    await act(async () => vi.advanceTimersByTimeAsync(4_000));
    expect(pendingRequests).toHaveLength(3);
    await answer(1, snapshot('p1', 'succeeded', 2));

    // Then the newer completed response can still advance the visible state.
    expect(hook.result.current.get('p1')?.status).toBe('succeeded');
  });

  it('ignores completions from a previous project set', async () => {
    // Given the effect changes from one project set to another.
    const hook = renderHook(
      ({ projectIds }: { readonly projectIds: readonly string[] }) =>
        useProjectRunSummaries(projectIds),
      { initialProps: { projectIds: ['p1'] } },
    );
    hook.rerender({ projectIds: ['p2'] });

    // When the current set resolves before the previous set.
    await answer(1, snapshot('p2', 'running', 2));
    await answer(0, snapshot('p1', 'succeeded', 1));

    // Then teardown keeps the old effect from replacing the current snapshot.
    expect(hook.result.current.get('p2')?.status).toBe('running');
    expect(hook.result.current.has('p1')).toBe(false);
  });

  it('stays empty after an in-flight refresh is disabled', async () => {
    // Given an enabled refresh is still pending.
    const hook = renderHook(
      ({ enabled }: { readonly enabled: boolean }) =>
        useProjectRunSummaries(['p1'], { enabled }),
      { initialProps: { enabled: true } },
    );

    // When the hook is disabled before that refresh completes.
    hook.rerender({ enabled: false });
    expect(hook.result.current.size).toBe(0);
    await answer(0, snapshot('p1', 'succeeded', 1));

    // Then the disabled effect remains empty and starts no replacement request.
    expect(hook.result.current.size).toBe(0);
    expect(pendingRequests).toHaveLength(1);
  });
});
