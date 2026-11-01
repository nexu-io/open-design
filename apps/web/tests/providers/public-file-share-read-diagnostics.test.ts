import { afterEach, expect, it, vi } from 'vitest';
import { fetchProjectFilePublicShareState } from '../../src/providers/registry';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(['SHARE_STATE_UNAVAILABLE', { code: 'WORKSPACE_PROJECT_SHARE_DENIED', message: 'secret-token https://signed.invalid/path' }])('preserves bounded state-read failure and correlates it without logging payloads: %s', async error => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fetch = vi.fn().mockResolvedValue(Response.json({ error }, { status: 503 }));
  vi.stubGlobal('fetch', fetch);
  const failure = await fetchProjectFilePublicShareState('private-project', 'private-file.html').catch(value => value);
  const requestId = new Headers(fetch.mock.calls[0]?.[1]?.headers).get('x-od-request-id');
  expect(requestId).toBeTruthy();
  expect(failure).toMatchObject({ status: 503, requestId, reason: 'http', code: typeof error === 'string' ? error : error.code });
  expect(warn).toHaveBeenCalledTimes(1);
  const diagnostic = JSON.parse(warn.mock.calls[0]?.[1]);
  expect(diagnostic).toMatchObject({ operation: 'state_read', reason: 'http', status: 503, requestId });
  expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret-token|signed.invalid|private-project|private-file/);
});

it.each([new TypeError('network secret-token'), new DOMException('private-file abort', 'AbortError')])('logs transport failure once without retry or raw error text: %s', async error => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fetch = vi.fn().mockRejectedValue(error);
  vi.stubGlobal('fetch', fetch);
  const failure = await fetchProjectFilePublicShareState('p', 'index.html').catch(value => value);
  expect(failure).toMatchObject({ reason: error.name === 'AbortError' ? 'aborted' : 'network' });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret-token|private-file/);
});

it('does not log arbitrary upstream text even when token-shaped', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'secret_token' }, { status: 502 })));
  const failure = await fetchProjectFilePublicShareState('p', 'index.html').catch(value => value);
  expect(failure.code).toBe('UNCLASSIFIED_SHARE_STATE_ERROR');
  expect(JSON.stringify(warn.mock.calls)).not.toContain('secret_token');
});

it('preserves successful state reads without failure-log noise', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const state = { status: 'stopped', publication: null, freshness: 'unknown' };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(state)));
  await expect(fetchProjectFilePublicShareState('p', 'index.html')).resolves.toEqual(state);
  expect(warn).not.toHaveBeenCalled();
});
