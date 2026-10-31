import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAmrRequestConcurrency } from '../../src/runtime/amr-request-concurrency';

const scope = { workspaceType: 'team' as const, workspaceId: 'space', workspaceMemberId: 'member' };
const hint = () => ({ workspaceId: 'space', workspaceMemberId: 'member', observedAt: new Date().toISOString(), status: 'available', running: 0, limit: 10 });
afterEach(() => vi.unstubAllGlobals());

describe('Link advisory request concurrency', () => {
  it('reads real zero without reserving, then refreshes rather than caching the next send', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ requestConcurrencyHint: hint() })));
    vi.stubGlobal('fetch', fetch);
    expect(await readAmrRequestConcurrency(scope)).toMatchObject({ status: 'available', running: 0 });
    expect(await readAmrRequestConcurrency(scope)).toMatchObject({ status: 'available', running: 0 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith('/api/workspace/billing/request-concurrency?workspaceId=space', expect.objectContaining({ cache: 'no-store' }));
  });
  it.each(['workspace', 'member', 'stale', 'future', 'missing-count', 'bad-limit', 'false-full', 'unknown-with-count'] as const)('rejects %s evidence', async (kind) => {
    const raw: Record<string, unknown> = hint();
    if (kind === 'workspace') raw.workspaceId = 'other';
    if (kind === 'member') raw.workspaceMemberId = 'other';
    if (kind === 'stale') raw.observedAt = new Date(Date.now() - 60_000).toISOString();
    if (kind === 'future') raw.observedAt = new Date(Date.now() + 60_000).toISOString();
    if (kind === 'missing-count') delete raw.running;
    if (kind === 'bad-limit') raw.limit = 0;
    if (kind === 'false-full') raw.status = 'full';
    if (kind === 'unknown-with-count') raw.status = 'unknown';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ requestConcurrencyHint: raw }))));
    expect(await readAmrRequestConcurrency(scope)).toBeNull();
  });
  it('keeps old-server failure or a read timeout unknown without retrying', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 404 })).mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    vi.stubGlobal('fetch', fetch);
    expect(await readAmrRequestConcurrency(scope)).toBeNull();
    expect(await readAmrRequestConcurrency(scope)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
