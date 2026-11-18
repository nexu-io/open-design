import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../packages/contracts/tests/fixtures/send-preflight-v1.json';
import { checkAmrSendPreflight, discardAmrSendPreflightHandoff, handoffAmrSendPreflight, takeAmrSendPreflightHandoff, type SendAttempt } from '../../src/runtime/amr-send-preflight';
const attempt: SendAttempt = { workspaceId: 'workspace-123', clientRequestId: 'attempt-123', modelId: null, accountGeneration: 1, targetRevision: 1 };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => vi.unstubAllGlobals());
describe('optional send preflight', () => {
  it.each(fixture.responses)('consumes canonical $decision response independently of display', async response => {
    vi.stubGlobal('fetch', vi.fn(async () => json(response)));
    expect(await checkAmrSendPreflight(attempt, { isCurrent: () => true })).toEqual(response.decision === 'proceed' ? { action: 'continue' } : { action: 'reject', rejection: 'reason' in response ? response.reason : undefined });
  });
  it('preserves core rejection despite invalid presentation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(fixture.invalidPresentation)));
    expect(await checkAmrSendPreflight(attempt, { isCurrent: () => true })).toEqual({ action: 'reject', rejection: 'concurrency_full' });
  });
  it.each([{}, { ...fixture.responses[0], schemaVersion: 2 }, { ...fixture.responses[0], workspaceId: 'other' }, { ...fixture.responses[0], modelId: 'other' }, { ...fixture.responses[0], clientRequestId: 'other' }, { ...fixture.responses[0], decision: ['proceed'], reason: 'insufficient_funds' }])('continues original target on malformed or misbound core', async body => {
    vi.stubGlobal('fetch', vi.fn(async () => json(body)));
    expect(await checkAmrSendPreflight(attempt, { isCurrent: () => true })).toEqual({ action: 'continue' });
  });
  it.each([400, 404, 429, 500, 503])('does not retry or fall back on HTTP %i', async status => {
    const fetch = vi.fn(async () => json({}, status)); vi.stubGlobal('fetch', fetch);
    expect(await checkAmrSendPreflight(attempt, { isCurrent: () => true })).toEqual({ action: 'continue' }); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each<[string, number]>([['unauthenticated', 401], ...fixture.errors['403'].map(code => [code, 403] as [string, number])])('recognizes only explicit %s', async (error, status) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error }, Number(status))));
    expect(await checkAmrSendPreflight(attempt, { isCurrent: () => true })).toEqual({ action: 'reject', rejection: error });
  });
  it.each([401, 403])('does not turn arbitrary HTTP %i into permission rejection', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'proxy_acl' }, status)));
    expect(await checkAmrSendPreflight(attempt, { isCurrent: () => true })).toEqual({ action: 'continue' });
  });
  it('cancels stale intent before consuming a late rejection', async () => {
    let current = true;
    vi.stubGlobal('fetch', vi.fn(async () => { current = false; return json(fixture.responses[1]); }));
    expect(await checkAmrSendPreflight(attempt, { isCurrent: () => current })).toEqual({ action: 'cancelled' });
  });
  it('uses user cancellation separately from deadline failure', async () => {
    const controller = new AbortController(); controller.abort(); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect(await checkAmrSendPreflight(attempt, { signal: controller.signal, isCurrent: () => true })).toEqual({ action: 'cancelled' }); expect(fetch).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('deadline', 'TimeoutError'); }));
    expect(await checkAmrSendPreflight(attempt, { isCurrent: () => true })).toEqual({ action: 'continue' });
  });
  it('never caches a negative verdict across sends and hands Home stages off once', async () => {
    const fetch = vi.fn(async () => json(fixture.responses[1])); vi.stubGlobal('fetch', fetch);
    await checkAmrSendPreflight(attempt, { isCurrent: () => true }); await checkAmrSendPreflight(attempt, { isCurrent: () => true }); expect(fetch).toHaveBeenCalledTimes(2);
    handoffAmrSendPreflight('project', attempt); expect(takeAmrSendPreflightHandoff('project')).toEqual(attempt); expect(takeAmrSendPreflightHandoff('project')).toBeUndefined();
    handoffAmrSendPreflight('abandoned', attempt); discardAmrSendPreflightHandoff('abandoned'); expect(takeAmrSendPreflightHandoff('abandoned')).toBeUndefined();
  });
});
