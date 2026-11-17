import { describe, expect, it, vi } from 'vitest';
import { captureHttpRequest, captureHttpResponse, evidenceUrl, mayReadEvidenceBody } from '../../lib/playwright/share-chain/http-evidence.js';
const request = (url: string) => ({ url: () => url, method: () => 'GET', resourceType: () => 'fetch' });
const response = (url: string, json: () => Promise<unknown>) => ({ url: () => url, status: () => 200, request: () => request(url), json });
describe('share probe evidence (local helper tests, not live acceptance)', () => {
  it('records directory attempts even when no response ever arrives', () => {
    expect(captureHttpRequest(request('https://console.invalid/api/teams/t/members'), 'visitor')).toMatchObject({ page: 'visitor', method: 'GET', url: 'https://console.invalid/api/teams/t/members' });
  });
  it.each(['/api/auth/get-session', '/api/teams/t/members', '/api/projects/p/members/comments', '/api/projects/p/comments/members', '/api/v1/public/snapshots/s/files/index.html'])('does not read sensitive/unrelated body %s', async path => {
    const json = vi.fn().mockResolvedValue({ private: 'must not be read' });
    expect(await captureHttpResponse(response('https://console.invalid' + path, json), 'visitor')).toMatchObject({ status: 200, body: null, bodyRead: 'not-requested' });
    expect(json).not.toHaveBeenCalled();
  });
  it('distinguishes an actual JSON null from a lost CDP body', async () => {
    const url = 'https://console.invalid/api/v1/collab/share/alias/comments';
    expect(await captureHttpResponse(response(url, async () => null), 'visitor')).toMatchObject({ body: null, bodyRead: 'complete' });
    expect(await captureHttpResponse(response(url, async () => { throw new Error('Network.getResponseBody'); }), 'visitor')).toMatchObject({ body: null, bodyRead: 'unavailable' });
  });
  it('captures comment snapshots verbatim without interpreting identity', async () => {
    const body = { comments: [{ id: 'test-id', author: { kind: 'member', displayName: 'Test snapshot' } }], latestSeq: 1, unresolvedTotal: 1 };
    const read = vi.fn().mockResolvedValue(body);
    const pending = captureHttpResponse(response('https://console.invalid/api/v1/collab/share/alias/comments', read), 'visitor');
    expect(read).toHaveBeenCalledOnce();
    expect((await pending).body).toBe(body);
  });
  it('allows canonical metadata/backfill/publish evidence paths', () => {
    for (const path of ['/v1/public/snapshots/a', '/api/v1/public/snapshots/a', '/api/projects/p/comments/sync-state', '/api/projects/p/conversations/c/comments', '/api/projects/p/files/index.html/publish-public']) expect(mayReadEvidenceBody(path)).toBe(true);
  });
  it('handles malformed URLs without persisting input or reading a body', async () => {
    const json = vi.fn().mockResolvedValue('not allowed');
    expect(evidenceUrl('not a URL secret')).toBe('invalid:<REDACTED>');
    expect(await captureHttpResponse(response('not a URL secret', json), 'visitor')).toMatchObject({ url: 'invalid:<REDACTED>', bodyRead: 'not-requested' });
    expect(json).not.toHaveBeenCalled();
  });
  it.each([
    'https://console.invalid/api/v1/public/snapshots/alias?projectId=p&shareAlias=1',
    'https://console.invalid/api/v1/collab/share/alias/comments?projectId=p&filePath=slides%2Findex.html',
  ])('preserves routing context but labels evidence as non-transport: %s', original => {
    const recorded = captureHttpRequest(request(original), 'visitor');
    expect(recorded.url).toBe(original);
    expect(recorded).toHaveProperty('urlPurpose', 'diagnostic-only');
  });
  it('retains pairing parameters while redacting unrelated credentials', () => {
    const recorded = captureHttpRequest(request('https://console.invalid/api/v1/public/snapshots/alias?projectId=p&shareAlias=1&token=secret'), 'visitor');
    const url = new URL(recorded.url);
    expect(url.searchParams.get('projectId')).toBe('p');
    expect(url.searchParams.get('shareAlias')).toBe('1');
    expect(url.searchParams.get('token')).toBe('<REDACTED>');
    expect(recorded.url).not.toContain('secret');
  });
  it('redacts credentials and arbitrary query values', () => {
    const url = new URL(evidenceUrl('https://u:secret@console.invalid/api/x?token=secret&projectId=p#secret'));
    expect(evidenceUrl('data:text/plain,secret')).toBe('data:<REDACTED>');
    expect(url.username + url.password + url.hash).toBe('');
    expect(url.searchParams.get('token')).toBe('<REDACTED>');
    expect(url.searchParams.get('projectId')).toBe('p');
  });
});
