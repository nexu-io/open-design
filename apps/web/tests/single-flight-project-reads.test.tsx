// @vitest-environment jsdom

// Red-spec for project-open read deduplication (Batch A §4.3).
//
// Evidence baseline (electron-project-waterfall-20260727): opening one shared
// project issued duplicated GETs before the first stable frame — /files ×2,
// /conversations ×2, /tabs ×2, /workspace-scope ×3 (one aborted),
// /collab/status ×2 immediately, /analytics/config ×2 and /recent-dirs ×2.
//
// The contract under test: every one of these display reads has a single
// request owner per (resource, project/workspace) — concurrent consumers of
// the same resource share one network request instead of each issuing their
// own.

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn(() => ({ connected: false })),
}));

import { fetchProjectFiles, fetchRecentLinkedDirs } from '../src/providers/registry';
import { listConversations, loadTabs } from '../src/state/projects';
import { CollabClient, fetchProjectCollabStatus } from '../src/collab/collab-client';
import { useProjectWorkspaceScope } from '../src/collab/useProjectWorkspaceScope';
import {
  bootstrapExceptionTracking,
  getAnalyticsClient,
} from '../src/analytics/client';

const fetchCalls: string[] = [];

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function bodyForUrl(url: string): unknown {
  if (url.includes('/collab/status')) return { syncState: 'local_only' };
  if (url.includes('/conversations')) return { conversations: [] };
  if (url.includes('/tabs')) return { tabs: [], active: null };
  if (url.includes('/recent-dirs')) return { dirs: [] };
  if (url.includes('/analytics/config')) return { enabled: false, key: null, host: null };
  if (url.includes('/workspace-scope')) {
    const projectId = decodeURIComponent(url.split('/projects/')[1]!.split('/')[0]!);
    return {
      scope: { kind: 'unbound', projectId, workspaceId: null, context: null },
    };
  }
  if (url.endsWith('/files')) return { files: [] };
  return {};
}

const defaultFetchImpl = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const url = String(input);
  fetchCalls.push(url);
  // Yield one microtask so concurrent callers genuinely overlap in flight.
  await Promise.resolve();
  if (init?.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  return jsonResponse(bodyForUrl(url));
};

const fetchStub = vi.fn(defaultFetchImpl);

beforeEach(() => {
  fetchCalls.length = 0;
  fetchStub.mockReset();
  fetchStub.mockImplementation(defaultFetchImpl);
  vi.stubGlobal('fetch', fetchStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const callsMatching = (fragment: string): string[] =>
  fetchCalls.filter((url) => url.includes(fragment));

describe('project-open single-flight reads (Batch A §4.3)', () => {
  it('shares one /files request between concurrent cancellable readers', async () => {
    const a = new AbortController();
    const b = new AbortController();
    const [filesA, filesB] = await Promise.all([
      fetchProjectFiles('sf-files', { signal: a.signal }),
      fetchProjectFiles('sf-files', { signal: b.signal }),
    ]);
    expect(filesA).toEqual([]);
    expect(filesB).toEqual([]);
    expect(callsMatching('/projects/sf-files/files')).toHaveLength(1);
  });

  it('shares one /files request between a cancellable and a plain reader', async () => {
    const a = new AbortController();
    await Promise.all([
      fetchProjectFiles('sf-files-mixed', { signal: a.signal }),
      fetchProjectFiles('sf-files-mixed'),
    ]);
    expect(callsMatching('/projects/sf-files-mixed/files')).toHaveLength(1);
  });

  it('keeps the shared /files request alive when only one of two readers aborts', async () => {
    let resolveBody: (() => void) | null = null;
    let sawAbort = false;
    fetchStub.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      fetchCalls.push(url);
      init?.signal?.addEventListener('abort', () => {
        sawAbort = true;
      });
      await new Promise<void>((resolve) => {
        resolveBody = resolve;
      });
      return jsonResponse(bodyForUrl(url));
    });

    const a = new AbortController();
    const b = new AbortController();
    const readA = fetchProjectFiles('sf-files-abort', { signal: a.signal });
    const readB = fetchProjectFiles('sf-files-abort', { signal: b.signal });
    await Promise.resolve();
    a.abort();
    // The aborted reader settles without waiting for the shared body...
    await expect(readA).resolves.toEqual([]);
    // ...while the surviving reader's network request was NOT aborted.
    expect(sawAbort).toBe(false);
    resolveBody!();
    await expect(readB).resolves.toEqual([]);
    expect(callsMatching('/projects/sf-files-abort/files')).toHaveLength(1);
  });

  it('shares one /conversations request between concurrent readers', async () => {
    await Promise.all([
      listConversations('sf-convs'),
      listConversations('sf-convs'),
    ]);
    expect(callsMatching('/projects/sf-convs/conversations')).toHaveLength(1);
  });

  it('shares one /tabs request between concurrent readers', async () => {
    await Promise.all([loadTabs('sf-tabs'), loadTabs('sf-tabs')]);
    expect(callsMatching('/projects/sf-tabs/tabs')).toHaveLength(1);
  });

  it('shares one /recent-dirs request between concurrent readers', async () => {
    await Promise.all([fetchRecentLinkedDirs(), fetchRecentLinkedDirs()]);
    expect(callsMatching('/recent-dirs')).toHaveLength(1);
  });

  it('shares one /collab/status request between concurrent one-shot status reads', async () => {
    // The 2× immediate status duplication came from FileWorkspace and
    // FileViewer each running a private shared-status check; both now go
    // through `fetchProjectCollabStatus`. CollabClient's poll loop stays
    // un-coalesced on purpose — its transfer fences order responses by
    // request start time, and joining an in-flight GET would let a poll
    // issued after a restart tombstone apply pre-restart state.
    await Promise.all([
      fetchProjectCollabStatus('sf-status'),
      fetchProjectCollabStatus('sf-status'),
    ]);
    expect(callsMatching('/projects/sf-status/collab/status')).toHaveLength(1);
  });

  it('keeps CollabClient status polls independent of the shared one-shot read', async () => {
    const client = new CollabClient({
      projectId: 'sf-status-poll',
      member: null,
      fetch: fetchStub as unknown as typeof fetch,
    });
    await fetchProjectCollabStatus('sf-status-poll');
    await client.pollStatus();
    // The poll must issue its own request even inside the one-shot read's
    // share window — its response-ordering fences require a request that
    // started after the poll was asked for.
    expect(callsMatching('/projects/sf-status-poll/collab/status')).toHaveLength(2);
  });

  it('shares one /analytics/config request between error tracking and analytics init', async () => {
    const context = {
      anonymousId: 'anon-1',
      sessionId: 'session-1',
      clientType: 'web',
      locale: 'en',
      appVersion: '0.0.0-test',
    } as Parameters<typeof getAnalyticsClient>[0];
    await Promise.all([
      bootstrapExceptionTracking(context),
      getAnalyticsClient(context),
    ]);
    expect(callsMatching('/analytics/config')).toHaveLength(1);
  });

  it('shares one /workspace-scope request between two mounted scope consumers', async () => {
    const first = renderHook(() => useProjectWorkspaceScope('sf-scope'));
    const second = renderHook(() => useProjectWorkspaceScope('sf-scope'));
    await waitFor(() => {
      expect(first.result.current.loading).toBe(false);
      expect(second.result.current.loading).toBe(false);
    });
    expect(first.result.current.scope?.kind).toBe('unbound');
    expect(second.result.current.scope?.kind).toBe('unbound');
    expect(callsMatching('/projects/sf-scope/workspace-scope')).toHaveLength(1);
    first.unmount();
    second.unmount();
  });
});
