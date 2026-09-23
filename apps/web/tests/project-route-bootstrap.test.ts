import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bootstrapFirstOpenTeamProjectRoute,
  bootstrapProjectRoute,
} from '../src/state/projects';
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
/*
 * What `GET /api/projects/:id/workspace-scope` ACTUALLY answers.
 *
 * The daemon route has exactly one branch (`resolveLocalProjectWorkspaceScope`)
 * and it hardcodes `role: 'member'` no matter who asks — that placeholder is the
 * whole implementation of "creator may write / non-creator is read-only", and it
 * deliberately never consults the membership directory.
 *
 * These fixtures used to echo the caller's own context back, `role: 'owner'`
 * included. That is a response production cannot produce, and it is why every
 * test in this file stayed green while a team owner opening their own project
 * got "项目不存在".
 */
const SCOPE_CONTEXT_A = workspaceContextFixture({
  workspaceId: CONTEXT_A.workspaceId,
  workspaceMemberId: CONTEXT_A.workspaceMemberId,
});
const SCOPE_CONTEXT_B = workspaceContextFixture({
  workspaceId: CONTEXT_B.workspaceId,
  workspaceMemberId: CONTEXT_B.workspaceMemberId,
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
            context: SCOPE_CONTEXT_A,
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
        context: SCOPE_CONTEXT_A,
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
        ? SCOPE_CONTEXT_B
        : SCOPE_CONTEXT_A;
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

  // OPEND: a team OWNER opening their own project from the team directory
  // before the ambient project list has loaded. The witness they hand in is the
  // shell's (real role `owner`); the daemon answers with its placeholder role.
  // Re-confirmation asks "is this the same person", so the role difference is
  // not an answer to it — and treating it as one produced "项目不存在" on a
  // project the daemon had a local row for. Only owners/admins ever saw it,
  // because a plain member's two contexts are byte-identical.
  it('re-confirms an owner witness against the daemon placeholder member role', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/workspace-scope')) {
        return new Response(JSON.stringify({
          scope: {
            kind: 'team',
            projectId: PROJECT_ID,
            workspaceId: CONTEXT_A.workspaceId,
            visibility: 'team',
            context: SCOPE_CONTEXT_A,
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ project: PROJECT_A }), { status: 200 });
    }));

    await expect(bootstrapProjectRoute(PROJECT_ID, {
      accountGeneration: 11,
      exactContext: CONTEXT_A,
    })).resolves.toMatchObject({ kind: 'found', project: PROJECT_A });
    // An exact witness skips the headerless discovery lane entirely: one scope
    // read, one detail read.
    expect(calls).toHaveLength(2);
  });

  // The other half of the same gate: relaxing role must not relax WHO.
  it('still fails closed when the daemon re-confirms a different member', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/workspace-scope')) {
        return new Response(JSON.stringify({
          scope: {
            kind: 'team',
            projectId: PROJECT_ID,
            workspaceId: CONTEXT_A.workspaceId,
            visibility: 'team',
            context: { ...SCOPE_CONTEXT_A, workspaceMemberId: 'member-someone-else' },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ project: PROJECT_A }), { status: 200 });
    }));

    await expect(bootstrapProjectRoute(PROJECT_ID, {
      accountGeneration: 12,
      exactContext: CONTEXT_A,
    })).resolves.toEqual({ kind: 'forbidden' });
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
          context: SCOPE_CONTEXT_A,
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
          context: SCOPE_CONTEXT_A,
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        scope: {
          kind: 'team',
          projectId: PROJECT_ID,
          workspaceId: CONTEXT_A.workspaceId,
          visibility: 'team',
          context: SCOPE_CONTEXT_A,
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

describe('bootstrapFirstOpenTeamProjectRoute', () => {
  it('uses one exact idempotent bootstrap then mounts only a confirmed Team binding', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let bound = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/collab/bootstrap')) {
        bound = true;
        return new Response(JSON.stringify({
          ok: true,
          awaitingFirstMaterialization: true,
        }), { status: 202 });
      }
      if (url.endsWith('/workspace-scope')) {
        if (!bound) return new Response('{}', { status: 404 });
        return new Response(JSON.stringify({
          scope: {
            kind: 'team',
            projectId: PROJECT_ID,
            workspaceId: CONTEXT_A.workspaceId,
            visibility: 'team',
            context: SCOPE_CONTEXT_A,
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ project: PROJECT_A }), { status: 200 });
    }));

    await expect(bootstrapProjectRoute(PROJECT_ID, {
      accountGeneration: 4,
      exactContext: CONTEXT_A,
    })).resolves.toEqual({ kind: 'not-found' });

    await expect(bootstrapFirstOpenTeamProjectRoute(PROJECT_ID, {
      accountGeneration: 4,
      exactContext: CONTEXT_A,
    })).resolves.toMatchObject({
      kind: 'found',
      project: PROJECT_A,
      awaitingFirstMaterialization: true,
      scope: { kind: 'team', context: SCOPE_CONTEXT_A },
    });

    expect(calls).toHaveLength(4);
    expect(calls[1]?.url).toContain('/collab/bootstrap');
    expect(calls[1]?.init?.method).toBe('PUT');
    expect(calls.every((call) =>
      new Headers(call.init?.headers).get('x-od-workspace-id') === CONTEXT_A.workspaceId,
    )).toBe(true);
  });

  it('rejects an old-daemon unbound placeholder and preserves the fallback lane', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        awaitingFirstMaterialization: true,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        scope: {
          kind: 'unbound',
          projectId: PROJECT_ID,
          workspaceId: null,
          context: null,
        },
      }), { status: 200 })));

    await expect(bootstrapFirstOpenTeamProjectRoute(PROJECT_ID, {
      accountGeneration: 4,
      exactContext: CONTEXT_A,
    })).resolves.toEqual({ kind: 'unavailable' });
  });

  // The progressive first-open fast lane. Same fork, different consequence:
  // for an owner/admin the lane returned `unavailable` every single time and the
  // route silently fell back to the slow full-materialization path.
  it('mounts the placeholder for an owner whose scope reports the placeholder role', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/collab/bootstrap')) {
        return new Response(JSON.stringify({
          ok: true,
          awaitingFirstMaterialization: true,
        }), { status: 202 });
      }
      if (url.endsWith('/workspace-scope')) {
        return new Response(JSON.stringify({
          scope: {
            kind: 'team',
            projectId: PROJECT_ID,
            workspaceId: CONTEXT_A.workspaceId,
            visibility: 'team',
            context: SCOPE_CONTEXT_A,
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ project: PROJECT_A }), { status: 200 });
    }));

    await expect(bootstrapFirstOpenTeamProjectRoute(PROJECT_ID, {
      accountGeneration: 9,
      exactContext: CONTEXT_A,
    })).resolves.toMatchObject({
      kind: 'found',
      awaitingFirstMaterialization: true,
    });
  });

  it('still rejects a placeholder bound to a different member', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/collab/bootstrap')) {
        return new Response(JSON.stringify({ ok: true }), { status: 202 });
      }
      if (url.endsWith('/workspace-scope')) {
        return new Response(JSON.stringify({
          scope: {
            kind: 'team',
            projectId: PROJECT_ID,
            workspaceId: CONTEXT_A.workspaceId,
            visibility: 'team',
            context: { ...SCOPE_CONTEXT_A, workspaceMemberId: 'member-someone-else' },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ project: PROJECT_A }), { status: 200 });
    }));

    await expect(bootstrapFirstOpenTeamProjectRoute(PROJECT_ID, {
      accountGeneration: 10,
      exactContext: CONTEXT_A,
    })).resolves.toEqual({ kind: 'unavailable' });
  });

  it('never starts the Team lane for a Personal context', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(bootstrapFirstOpenTeamProjectRoute(PROJECT_ID, {
      accountGeneration: 4,
      exactContext: { ...CONTEXT_A, workspaceType: 'personal', teamId: undefined },
    })).resolves.toEqual({ kind: 'not-found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
