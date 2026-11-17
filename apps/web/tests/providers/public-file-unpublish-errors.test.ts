import { afterEach, expect, it, vi } from 'vitest';
import { PublicFilePublishError, publicFileMutationNeedsReconciliation } from '../../src/collab/public-file-publish';
import { unpublishProjectFilePublic } from '../../src/providers/registry';

afterEach(() => { vi.unstubAllGlobals(); });

it.each([
  [403, { error: { code: 'WORKSPACE_IDENTITY_REQUIRED', message: 'Sign in again' } }, 'WORKSPACE_IDENTITY_REQUIRED'],
  [503, { error: 'stop_failed' }, 'stop_failed'],
  [503, { error: { message: 'stop unavailable' } }, undefined],
] as const)('preserves an explicit HTTP %s stop refusal without transport reconciliation', async (status, body, code) => {
  const request = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal('fetch', request);
  const error = await unpublishProjectFilePublic('p', 'index.html', 'stable').catch((value: unknown) => value);
  expect(error).toBeInstanceOf(PublicFilePublishError);
  expect(error).toMatchObject({ status, code });
  expect(publicFileMutationNeedsReconciliation(error)).toBe(false);
  expect(request).toHaveBeenCalledOnce();
});

it.each([new TypeError('Failed to fetch'), new DOMException('Request aborted', 'AbortError')])('keeps response loss ambiguous: %s', async error => {
  const request = vi.fn().mockRejectedValue(error);
  vi.stubGlobal('fetch', request);
  const received = await unpublishProjectFilePublic('p', 'index.html', 'stable').catch((value: unknown) => value);
  expect(received).toBe(error);
  expect(publicFileMutationNeedsReconciliation(received)).toBe(true);
  expect(request).toHaveBeenCalledOnce();
});
