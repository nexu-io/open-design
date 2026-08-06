// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureWorkspaceBillingInterestDeclared,
  resetWorkspaceBillingInterestRegistry,
  retainWorkspaceBillingInterest,
  workspaceBillingInterestHeaders,
} from '../src/collab/workspace-billing-interests';

const SCOPE_A = { workspaceId: 'workspace-a', workspaceMemberId: 'member-a' };
const SCOPE_B = { workspaceId: 'workspace-b', workspaceMemberId: 'member-b' };

describe('workspace billing renderer interest registry', () => {
  beforeEach(() => {
    resetWorkspaceBillingInterestRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetWorkspaceBillingInterestRegistry();
  });

  it('declares one renderer full set for simultaneous ambient A and project B', async () => {
    const requests: Array<{ method: string; generation: string; interests: unknown[] }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        generation: string;
        interests: unknown[];
      };
      requests.push({
        method: init?.method ?? 'GET',
        generation: body.generation,
        interests: body.interests,
      });
      const clientId = decodeURIComponent(String(input).split('/').at(-1)!);
      return new Response(JSON.stringify({
        clientId,
        acceptedGeneration: body.generation,
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));

    const releaseA = retainWorkspaceBillingInterest('ambient', SCOPE_A);
    const releaseB = retainWorkspaceBillingInterest('project', SCOPE_B);
    await ensureWorkspaceBillingInterestDeclared();

    expect(requests.at(-1)).toMatchObject({
      method: 'PUT',
      generation: '2',
      interests: [SCOPE_A, SCOPE_B],
    });
    const headersA = workspaceBillingInterestHeaders(SCOPE_A);
    const headersB = workspaceBillingInterestHeaders(SCOPE_B);
    expect(headersA['x-od-workspace-runtime-client-id']).toBe(
      headersB['x-od-workspace-runtime-client-id'],
    );
    expect(headersA['x-od-workspace-runtime-generation']).toBe('2');
    expect(headersB['x-od-workspace-runtime-generation']).toBe('2');

    releaseA();
    await ensureWorkspaceBillingInterestDeclared();
    expect(requests.at(-1)).toMatchObject({
      generation: '3',
      interests: [SCOPE_B],
    });
    releaseB();
  });

  it('revokes the daemon lease when the final renderer owner unmounts', async () => {
    const methods: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      methods.push(init?.method ?? 'GET');
      if (init?.method === 'DELETE') {
        expect(String(input)).toContain('generation=2');
        return new Response(JSON.stringify({ ok: true, released: true }), {
          status: 200,
        });
      }
      const body = JSON.parse(String(init?.body)) as { generation: string };
      const clientId = decodeURIComponent(String(input).split('/').at(-1)!);
      return new Response(JSON.stringify({
        clientId,
        acceptedGeneration: body.generation,
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));

    const release = retainWorkspaceBillingInterest('surface', SCOPE_A);
    await ensureWorkspaceBillingInterestDeclared();
    release();
    await ensureWorkspaceBillingInterestDeclared();
    expect(methods).toEqual(['PUT', 'DELETE']);
  });

  it('degrades additively when an old daemon has no interest endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    retainWorkspaceBillingInterest('surface', SCOPE_A);
    await ensureWorkspaceBillingInterestDeclared();
    await ensureWorkspaceBillingInterestDeclared();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(workspaceBillingInterestHeaders(SCOPE_A)).toEqual({});
  });

  it('does not expose an unaccepted generation and recovers a failed full-set PUT', async () => {
    const requests: Array<{ generation: string; interests: unknown[] }> = [];
    let attempt = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      attempt += 1;
      const body = JSON.parse(String(init?.body)) as {
        generation: string;
        interests: unknown[];
      };
      requests.push(body);
      if (attempt === 2) throw new Error('response lost');
      const clientId = decodeURIComponent(String(input).split('/').at(-1)!);
      return new Response(JSON.stringify({
        clientId,
        acceptedGeneration: body.generation,
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));

    retainWorkspaceBillingInterest('ambient', SCOPE_A);
    retainWorkspaceBillingInterest('project', SCOPE_B);
    await ensureWorkspaceBillingInterestDeclared();

    expect(workspaceBillingInterestHeaders(SCOPE_A)).toEqual({});
    expect(workspaceBillingInterestHeaders(SCOPE_B)).toEqual({});

    await ensureWorkspaceBillingInterestDeclared();
    expect(requests).toEqual([
      { generation: '1', interests: [SCOPE_A] },
      { generation: '2', interests: [SCOPE_A, SCOPE_B] },
      { generation: '2', interests: [SCOPE_A, SCOPE_B] },
    ]);
    expect(workspaceBillingInterestHeaders(SCOPE_A)[
      'x-od-workspace-runtime-generation'
    ]).toBe('2');
  });

  it('rebases a rejected generation and retries the complete desired set', async () => {
    const requests: Array<{ generation: string; interests: unknown[] }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        generation: string;
        interests: unknown[];
      };
      requests.push(body);
      if (requests.length === 2) {
        return new Response(JSON.stringify({
          error: 'generation_payload_mismatch',
          acceptedGeneration: '7',
        }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        });
      }
      const clientId = decodeURIComponent(String(input).split('/').at(-1)!);
      return new Response(JSON.stringify({
        clientId,
        acceptedGeneration: body.generation,
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));

    retainWorkspaceBillingInterest('ambient', SCOPE_A);
    retainWorkspaceBillingInterest('project', SCOPE_B);
    await ensureWorkspaceBillingInterestDeclared();

    expect(requests).toEqual([
      { generation: '1', interests: [SCOPE_A] },
      { generation: '2', interests: [SCOPE_A, SCOPE_B] },
      { generation: '8', interests: [SCOPE_A, SCOPE_B] },
    ]);
    expect(workspaceBillingInterestHeaders(SCOPE_B)[
      'x-od-workspace-runtime-generation'
    ]).toBe('8');
  });

  it('keeps retrying a failed renewal beyond the original lease TTL', async () => {
    vi.useFakeTimers();
    const requests: string[] = [];
    let responseCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { generation: string };
      requests.push(body.generation);
      responseCount += 1;
      if (responseCount === 1) {
        const clientId = decodeURIComponent(String(input).split('/').at(-1)!);
        return new Response(JSON.stringify({
          clientId,
          acceptedGeneration: body.generation,
          leaseExpiresAt: new Date(Date.now() + 10_000).toISOString(),
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (responseCount < 4) throw new Error('daemon unavailable');
      const clientId = decodeURIComponent(String(input).split('/').at(-1)!);
      return new Response(JSON.stringify({
        clientId,
        acceptedGeneration: body.generation,
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));

    retainWorkspaceBillingInterest('surface', SCOPE_A);
    await ensureWorkspaceBillingInterestDeclared();
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(requests).toEqual(['1', '1', '1', '1']);
    expect(workspaceBillingInterestHeaders(SCOPE_A)[
      'x-od-workspace-runtime-generation'
    ]).toBe('1');
  });
});
