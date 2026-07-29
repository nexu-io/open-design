import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyStoreScreenshotChangeSet,
  createStoreScreenshotDocument,
  exportStoreScreenshots,
  fetchStoreScreenshotJob,
  fetchStoreScreenshotDocument,
  fetchStoreScreenshotVersions,
  generateStoreScreenshots,
  previewStoreScreenshotChangeSet,
  restoreStoreScreenshotVersion,
  storeScreenshotAssetRawUrl,
  StoreScreenshotApiError,
  validateStoreScreenshotDocument,
} from '../../../src/features/store-screenshots/api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('store screenshot API response contracts', () => {
  it.each([
    ['create document', () => createStoreScreenshotDocument('project-1', {
      product: {
        name: 'Focus',
        summary: '',
        audience: '',
        features: [],
      },
      designSystemId: 'clay',
      templateId: 'minimal-center',
      pageCount: 4,
    })],
    ['fetch document', () => fetchStoreScreenshotDocument('project-1')],
    ['validate document', () => validateStoreScreenshotDocument('project-1', ['appStore'])],
    ['start generation', () => generateStoreScreenshots('project-1', {})],
    ['start export', () => exportStoreScreenshots('project-1', { platforms: ['appStore'] })],
    ['fetch job', () => fetchStoreScreenshotJob('project-1', 'job-1')],
    ['preview changes', () => previewStoreScreenshotChangeSet('project-1', {
      baseVersion: 1,
      operations: [],
    })],
    ['apply changes', () => applyStoreScreenshotChangeSet('project-1', {
      baseVersion: 1,
      operations: [],
    })],
    ['fetch versions', () => fetchStoreScreenshotVersions('project-1')],
    ['restore version', () => restoreStoreScreenshotVersion('project-1', 1)],
  ])('rejects a malformed 2xx response from %s', async (_label, request) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ unexpected: true }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    await expect(request()).rejects.toThrow('Invalid store screenshot API response');
  });

  it('uses the stable protocol error for non-JSON 2xx responses', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      'not-json',
      { status: 200, headers: { 'content-type': 'text/plain' } },
    )));

    await expect(fetchStoreScreenshotDocument('project-1')).rejects.toThrow(
      'Invalid store screenshot API response',
    );
  });

  it('preserves HTTP status and daemon business code on API errors', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({
        error: {
          code: 'DOCUMENT_NOT_FOUND',
          message: 'Store screenshot document not found',
        },
      }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    )));

    const error = await fetchStoreScreenshotDocument('project-1').catch(
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(StoreScreenshotApiError);
    expect(error).toMatchObject({
      status: 404,
      code: 'DOCUMENT_NOT_FOUND',
      message: 'Store screenshot document not found',
    });
  });

  it('uses encoded same-origin URLs for raw screenshot assets', () => {
    expect(storeScreenshotAssetRawUrl('project / one', 'asset/one?two')).toBe(
      '/api/projects/project%20%2F%20one/store-screenshots/assets/asset%2Fone%3Ftwo/raw',
    );
  });
});
