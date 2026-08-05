import { afterEach, describe, expect, it, vi } from 'vitest';

import { bootstrapProjectRoute } from '../src/state/projects';
import { resetCoalescedGet } from '../src/lib/coalesced-get';
import { workspaceContextFixture } from './helpers/workspace-context';

const PROJECT_ID = 'project-a';
const CONTEXT_A = workspaceContextFixture({
  workspaceId: 'workspace-a',
  workspaceMemberId: 'member-a',
  role: 'owner',
});
const CONTEXT_B = workspaceContextFixture({
  workspaceId: 'workspace-b',
  workspaceMemberId: 'member-b',
  role: 'member',
});
const PROJECT_A = {
  id: PROJECT_ID,
  name: 'Project A',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
  workspaceId: CONTEXT_A.workspaceId,
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetCoalescedGet();
});

describe('bootstrapProjectRoute', () => {
  it('revalidates a headerless team discovery with exact scope and detail reads', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/workspace-scope')) {
        return new Response(JSON.stringify({
          scope: {
            kind: 'team',
            projectId: PROJECT_ID,
            workspaceId: CONTEXT_A.workspaceId,
            visibility: 'team',
            context: CONTEXT_A,
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ project: PROJECT_A }), { status: 200 });
    }));

    await expect(bootstrapProjectRoute(PROJECT_ID, {
      accountGeneration: 7,
    })).resolves.toEqual({
      kind: 'found',
      project: PROJECT_A,
      resolvedDir: null,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: CONTEXT_A.workspaceId,
        visibility: 'team',
        context: CONTEXT_A,
      },
    });

    expect(calls).toHaveLength(3);
    expect(new Headers(calls[0]?.init?.headers).has('x-od-workspace-id')).toBe(false);
    expect(new Headers(calls[1]?.init?.headers).get('x-od-workspace-id'))
      .toBe(CONTEXT_A.workspaceId);
    expect(new Headers(calls[1]?.init?.headers).get('x-od-workspace-member-id'))
      .toBe(CONTEXT_A.workspaceMemberId);
    expect(calls[1]?.url).toContain('/workspace-scope');
    expect(new Headers(calls[2]?.init?.headers).get('x-od-workspace-id'))
      .toBe(CONTEXT_A.workspaceId);
    expect(new Headers(calls[2]?.init?.headers).get('x-od-workspace-member-id'))
      .toBe(CONTEXT_A.workspaceMemberId);
    expect(calls[2]?.url).not.toContain('/workspace-scope');
    expect(calls.every((call) => call.init?.cache === 'no-store')).toBe(true);
  });

  it('uses an exact opening witness for the first scope read and partitions coalescing by identity', async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, headers });
      const context = headers.get('x-od-workspace-id') === CONTEXT_B.workspaceId
        ? CONTEXT_B
        : CONTEXT_A;
      if (url.endsWith('/workspace-scope')) {
        return new Response(JSON.stringify({
          scope: {
            kind: 'team',
            projectId: PROJECT_ID,
            workspaceId: context.workspaceId,
            visibility: 'team',
            context,
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        project: { ...PROJECT_A, workspaceId: context.workspaceId },
      }), { status: 200 });
    }));

    await Promise.all([
      bootstrapProjectRoute(PROJECT_ID, {
        accountGeneration: 7,
        exactContext: CONTEXT_A,
      }),
      bootstrapProjectRoute(PROJECT_ID, {
        accountGeneration: 7,
        exactContext: CONTEXT_B,
      }),
    ]);

    expect(calls).toHaveLength(4);
    expect(calls.filter((call) => call.url.endsWith('/workspace-scope'))).toHaveLength(2);
    expect(calls.filter(
      (call) => call.headers.get('x-od-workspace-id') === CONTEXT_A.workspaceId,
    )).toHaveLength(2);
    expect(calls.filter(
      (call) => call.headers.get('x-od-workspace-id') === CONTEXT_B.workspaceId,
    )).toHaveLength(2);
  });

  it('fails closed when an exact opening witness is not re-confirmed', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      scope: {
        kind: 'unbound',
        projectId: PROJECT_ID,
        workspaceId: null,
        context: null,
      },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(bootstrapProjectRoute(PROJECT_ID, {
      accountGeneration: 7,
      exactContext: CONTEXT_A,
    })).resolves.toEqual({ kind: 'forbidden' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: 403, kind: 'forbidden' as const },
    { status: 404, kind: 'not-found' as const },
    { status: 503, kind: 'unavailable' as const },
  ])('maps scope HTTP $status to $kind without reading project content', async ({ status, kind }) => {
    const fetchMock = vi.fn(async () => new Response('{}', { status }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(bootstrapProjectRoute(PROJECT_ID, {
      accountGeneration: 1,
    })).resolves.toEqual({ kind });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed on a mismatched scope or a binding change between scope and detail', async () => {
    const responses = [
      new Response(JSON.stringify({
        scope: {
          kind: 'team',
          projectId: 'different-project',
          workspaceId: CONTEXT_A.workspaceId,
          visibility: 'team',
          context: CONTEXT_A,
        },
      }), { status: 200 }),
    ];
    vi.stubGlobal('fetch', vi.fn(async () => responses.shift()!));
    await expect(bootstrapProjectRoute(PROJECT_ID, {
      accountGeneration: 1,
    })).resolves.toEqual({ kind: 'unavailable' });

    resetCoalescedGet();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        scope: {
          kind: 'team',
          projectId: PROJECT_ID,
          workspaceId: CONTEXT_A.workspaceId,
          visibility: 'team',
          context: CONTEXT_A,
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        scope: {
          kind: 'team',
          projectId: PROJECT_ID,
          workspaceId: CONTEXT_A.workspaceId,
          visibility: 'team',
          context: CONTEXT_A,
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        project: { ...PROJECT_A, workspaceId: 'workspace-b' },
      }), { status: 200 })));
    await expect(bootstrapProjectRoute(PROJECT_ID, {
      accountGeneration: 1,
    })).resolves.toEqual({ kind: 'forbidden' });
  });

  it('preserves signed-out unbound local project compatibility', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return url.endsWith('/workspace-scope')
        ? new Response(JSON.stringify({
            scope: {
              kind: 'unbound',
              projectId: PROJECT_ID,
              workspaceId: null,
              context: null,
            },
          }), { status: 200 })
        : new Response(JSON.stringify({
            project: { ...PROJECT_A, workspaceId: null },
          }), { status: 200 });
    }));

    await expect(bootstrapProjectRoute(PROJECT_ID, {
      accountGeneration: 0,
    })).resolves.toMatchObject({ kind: 'found' });
    expect(calls).toHaveLength(2);
    expect(new Headers(calls[1]?.init?.headers).has('x-od-workspace-id')).toBe(false);
  });

  it('single-flights one launch generation, retries failures, and partitions account changes', async () => {
    let scopeCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/workspace-scope')) {
        scopeCalls += 1;
        return new Response(JSON.stringify({
          scope: {
            kind: 'unbound',
            projectId: PROJECT_ID,
            workspaceId: null,
            context: null,
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        project: { ...PROJECT_A, workspaceId: null },
      }), { status: 200 });
    }));

    await Promise.all([
      bootstrapProjectRoute(PROJECT_ID, { accountGeneration: 1 }),
      bootstrapProjectRoute(PROJECT_ID, { accountGeneration: 1 }),
    ]);
    expect(scopeCalls).toBe(1);
    await bootstrapProjectRoute(PROJECT_ID, { accountGeneration: 2 });
    expect(scopeCalls).toBe(2);

    resetCoalescedGet();
    const failedFetch = vi.fn(async () => new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', failedFetch);
    await bootstrapProjectRoute(PROJECT_ID, { accountGeneration: 3 });
    await bootstrapProjectRoute(PROJECT_ID, { accountGeneration: 3 });
    expect(failedFetch).toHaveBeenCalledTimes(2);
  });
});
