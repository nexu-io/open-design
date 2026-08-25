// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetSharedCancellableGet } from '../src/lib/shared-cancellable-get';
import {
  fetchDesignSystem,
  fetchDesignSystemPreview,
  fetchDesignSystemShowcase,
  updateDesignSystemDraft,
} from '../src/providers/registry';
import { workspaceContextFixture } from './helpers/workspace-context';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function detailResponse(id: string, body = `# ${id}`): Response {
  return {
    ok: true,
    json: async () => ({
      id,
      title: id,
      summary: 'Bundled preset.',
      category: 'Product',
      source: 'built-in',
      body,
    }),
  } as Response;
}

describe('design-system preview detail reads', () => {
  const fetchStub = vi.fn();

  beforeEach(() => {
    fetchStub.mockReset();
    vi.stubGlobal('fetch', fetchStub);
    resetSharedCancellableGet();
  });

  afterEach(() => {
    resetSharedCancellableGet();
    vi.unstubAllGlobals();
  });

  it('shares one request, detaches an abandoned preview, and reuses the bundled result', async () => {
    const response = deferred<Response>();
    let sharedSignal: AbortSignal | undefined;
    fetchStub.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      sharedSignal = init?.signal ?? undefined;
      return response.promise;
    });

    const abandoned = new AbortController();
    const active = new AbortController();
    const abandonedRead = fetchDesignSystem('airbnb', null, { signal: abandoned.signal });
    const activeRead = fetchDesignSystem('airbnb', null, { signal: active.signal });

    expect(fetchStub).toHaveBeenCalledTimes(1);
    abandoned.abort();
    await expect(abandonedRead).resolves.toBeNull();
    expect(sharedSignal?.aborted).toBe(false);

    response.resolve(detailResponse('airbnb'));
    await expect(activeRead).resolves.toMatchObject({ id: 'airbnb', body: '# airbnb' });

    await expect(fetchDesignSystem('airbnb')).resolves.toMatchObject({ id: 'airbnb' });
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('does not share detail reads across Workspace identities', async () => {
    fetchStub.mockImplementation(async (input: RequestInfo | URL) =>
      detailResponse(decodeURIComponent(String(input).split('/').at(-1) ?? 'unknown')));
    await Promise.all([
      fetchDesignSystem('airtable', workspaceContextFixture({
        workspaceId: 'workspace-a',
        workspaceMemberId: 'member-a',
        workspaceType: 'team',
      })),
      fetchDesignSystem('airtable', workspaceContextFixture({
        workspaceId: 'workspace-b',
        workspaceMemberId: 'member-b',
        workspaceType: 'team',
      })),
    ]);

    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('forces one fresh read burst and fences an older in-flight preset read', async () => {
    const staleResponse = deferred<Response>();
    const freshResponse = deferred<Response>();
    fetchStub
      .mockImplementationOnce(() => staleResponse.promise)
      .mockImplementationOnce(() => freshResponse.promise);

    const staleRead = fetchDesignSystem('airbnb');
    const freshReads = [
      fetchDesignSystem('airbnb', null, { fresh: true }),
      fetchDesignSystem('airbnb', null, { fresh: true }),
    ];

    expect(fetchStub).toHaveBeenCalledTimes(2);
    staleResponse.resolve(detailResponse('airbnb', '# Before generation'));
    freshResponse.resolve(detailResponse('airbnb', '# After generation'));

    await expect(Promise.all([staleRead, ...freshReads])).resolves.toEqual([
      expect.objectContaining({ body: '# After generation' }),
      expect.objectContaining({ body: '# After generation' }),
      expect.objectContaining({ body: '# After generation' }),
    ]);
  });

  it('does not retain a settled editable user-system detail', async () => {
    fetchStub.mockResolvedValue(detailResponse('user:brand'));

    await fetchDesignSystem('user:brand');
    await fetchDesignSystem('user:brand');

    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('does not cache an HTTP failure for a bundled preset', async () => {
    fetchStub
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce(detailResponse('apple'));

    await expect(fetchDesignSystem('apple')).resolves.toBeNull();
    await expect(fetchDesignSystem('apple')).resolves.toMatchObject({ id: 'apple' });
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('fences an in-flight pre-write detail after a successful update', async () => {
    const staleResponse = deferred<Response>();
    fetchStub
      .mockImplementationOnce(() => staleResponse.promise)
      .mockResolvedValueOnce(detailResponse('user:brand', '# Updated by PATCH'))
      .mockResolvedValueOnce(detailResponse('user:brand', '# Fresh after PATCH'));

    const readStartedBeforeWrite = fetchDesignSystem('user:brand');
    await expect(updateDesignSystemDraft('user:brand', { body: '# Updated by PATCH' }))
      .resolves.toMatchObject({ body: '# Updated by PATCH' });
    const readStartedAfterWrite = fetchDesignSystem('user:brand');

    expect(fetchStub).toHaveBeenCalledTimes(3);
    staleResponse.resolve(detailResponse('user:brand', '# Stale before PATCH'));

    await expect(readStartedAfterWrite).resolves.toMatchObject({ body: '# Fresh after PATCH' });
    await expect(readStartedBeforeWrite).resolves.toMatchObject({ body: '# Fresh after PATCH' });
  });

  it('coalesces overlapping preview and showcase reads independently', async () => {
    const previewResponse = deferred<Response>();
    const showcaseResponse = deferred<Response>();
    fetchStub
      .mockImplementationOnce(() => previewResponse.promise)
      .mockImplementationOnce(() => showcaseResponse.promise);

    const previewReads = [
      fetchDesignSystemPreview('airtable'),
      fetchDesignSystemPreview('airtable'),
    ];
    expect(fetchStub).toHaveBeenCalledTimes(1);
    previewResponse.resolve({
      ok: true,
      text: async () => '<html>preview</html>',
    } as Response);
    await expect(Promise.all(previewReads)).resolves.toEqual([
      '<html>preview</html>',
      '<html>preview</html>',
    ]);

    const showcaseReads = [
      fetchDesignSystemShowcase('airtable'),
      fetchDesignSystemShowcase('airtable'),
    ];
    expect(fetchStub).toHaveBeenCalledTimes(2);
    showcaseResponse.resolve({
      ok: true,
      text: async () => '<html>showcase</html>',
    } as Response);
    await expect(Promise.all(showcaseReads)).resolves.toEqual([
      '<html>showcase</html>',
      '<html>showcase</html>',
    ]);
  });
});
