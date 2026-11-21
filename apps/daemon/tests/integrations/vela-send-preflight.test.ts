import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(new URL('../../../../packages/contracts/tests/fixtures/send-preflight-v1.json', import.meta.url), 'utf8'));
import { fetchVelaSendPreflight } from '../../src/integrations/vela-send-preflight.js';
const input = { workspaceId: 'workspace-123', clientRequestId: 'attempt-123', modelId: null };
const session = { profile: 'test', apiUrl: 'https://api.invalid', controlKey: 'synthetic-control', user: null, configMtimeMs: null };
const readSession = () => session;
describe('direct Vela optional preview', () => {
  it('captures control session and forwards exact request without CLI or Link identity', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(fixture.invalidPresentation)));
    const result = await fetchVelaSendPreflight(input, { readSession, fetch });
    expect(result).toEqual({ status: 200, body: { ...fixture.responses[2], details: undefined } });
    expect(fetch).toHaveBeenCalledWith(new URL('https://api.invalid/api/v1/workspaces/workspace-123/billing/send-preflight'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ clientRequestId: input.clientRequestId, modelId: null }) }));
  });
  it.each([401, 403])('preserves only whitelisted HTTP %i', async status => {
    const error = status === 401 ? 'unauthenticated' : 'workspace_forbidden';
    expect(await fetchVelaSendPreflight(input, { readSession, fetch: vi.fn(async () => new Response(JSON.stringify({ error }), { status })) })).toEqual({ status, body: { error } });
    expect((await fetchVelaSendPreflight(input, { readSession, fetch: vi.fn(async () => new Response(JSON.stringify({ error: 'proxy_acl' }), { status })) })).status).toBe(503);
  });
  it('returns technical unavailable for missing session, wrong binding, and malformed content', async () => {
    const fetch = vi.fn(); expect((await fetchVelaSendPreflight(input, { readSession: () => null, fetch })).status).toBe(503); expect(fetch).not.toHaveBeenCalled();
    for (const body of ['<html>', JSON.stringify({ ...fixture.responses[0], workspaceId: 'other' })]) expect((await fetchVelaSendPreflight(input, { readSession, fetch: vi.fn(async () => new Response(body)) })).status).toBe(503);
  });
  it('propagates downstream cancellation to the upstream wait', async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => { controller.abort(); expect(init?.signal?.aborted).toBe(true); throw new DOMException('cancelled', 'AbortError'); });
    expect((await fetchVelaSendPreflight(input, { readSession, fetch, signal: controller.signal })).status).toBe(503);
  });
});
