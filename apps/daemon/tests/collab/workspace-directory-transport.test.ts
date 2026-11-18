import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchVelaWorkspaceDirectory } from '../../src/collab/vela-workspace-context.js';
import { verifyWorkspaceRequestContext } from '../../src/collab/request-workspace-context.js';

const SESSION = {
  profile: 'prod', apiUrl: 'https://authority.example', controlKey: 'test-key',
  user: null, configMtimeMs: null,
};
const MEMBER = {
  workspaceId: 'workspace', workspaceName: 'Workspace', workspaceType: 'personal',
  workspaceMemberId: 'member', role: 'owner', memberStatus: 'active', lifecycleState: 'active',
};
const headers: Record<string, string> = { 'x-od-workspace-id': 'workspace', 'x-od-workspace-member-id': 'member' };
const request = { get: (name: string) => headers[name.toLowerCase()] };
const directoryResponse = (items = [MEMBER]) => Response.json({ items });
const timeoutFetch = (_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
  init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
});

afterEach(() => vi.useRealTimers());

describe('workspace directory transport recovery', () => {
  it('recovers a timed-out authority read before failing the waiting operation with 503', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockImplementationOnce(timeoutFetch)
      .mockResolvedValueOnce(directoryResponse());
    const result = verifyWorkspaceRequestContext({
      req: request,
      fetchWorkspaceDirectory: () => fetchVelaWorkspaceDirectory({ readSession: () => SESSION, fetch }),
    });
    await vi.advanceTimersByTimeAsync(7_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ ok: true, context: { workspaceId: 'workspace', workspaceMemberId: 'member' } });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('caps an ongoing outage at two attempts and still fails closed', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(timeoutFetch);
    let settled = false;
    const result = verifyWorkspaceRequestContext({
      req: request,
      fetchWorkspaceDirectory: () => fetchVelaWorkspaceDirectory({ readSession: () => SESSION, fetch }),
    }).then(value => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(12_999);
    expect(settled).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(await result).toMatchObject({ ok: false, status: 503, code: 'WORKSPACE_AUTHORITY_UNAVAILABLE' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries a connection reset and uses the retried directory to deny removed membership', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } }))
      .mockResolvedValueOnce(directoryResponse([{ ...MEMBER, memberStatus: 'removed' }]));
    const result = await verifyWorkspaceRequestContext({
      req: request,
      fetchWorkspaceDirectory: () => fetchVelaWorkspaceDirectory({ readSession: () => SESSION, fetch }),
    });
    expect(result).toMatchObject({ ok: false, status: 403, code: 'WORKSPACE_ACCESS_DENIED' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 429, 503])('does not retry an HTTP %s response', async status => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({}, { status }));
    expect(await fetchVelaWorkspaceDirectory({ readSession: () => SESSION, fetch }))
      .toMatchObject({ ok: false, status });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry malformed authority JSON', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{'));
    expect(await fetchVelaWorkspaceDirectory({ readSession: () => SESSION, fetch })).toMatchObject({ ok: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry the captured credential after the account changes', async () => {
    vi.useFakeTimers();
    let session = SESSION;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(timeoutFetch);
    const result = fetchVelaWorkspaceDirectory({ readSession: () => session, fetch });
    session = { ...SESSION, controlKey: 'new-account-key' };
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await result).toMatchObject({ ok: false, reason: 'network' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
