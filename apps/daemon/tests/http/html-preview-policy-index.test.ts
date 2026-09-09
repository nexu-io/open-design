import { describe, expect, it, vi } from 'vitest';

import type { HtmlHeadScanResult } from '../../src/http/html-stream-injection.js';
import { HtmlPreviewPolicyIndex } from '../../src/http/html-preview-policy-index.js';

function result(overrides: Partial<HtmlHeadScanResult> = {}): HtmlHeadScanResult {
  return {
    insertionOffset: 0,
    hasAuthoredBase: false,
    hasLoadTimeLocationNavigation: false,
    hasViteDevEntry: false,
    needsSandboxShim: false,
    needsFocusGuard: false,
    needsRedirectGuard: false,
    needsPoweredPreview: false,
    hasDeckStageElement: false,
    hasFrameworkDeckId: false,
    hasExplicitDeckSlideElement: false,
    hasLegacyDeckScreenSlides: false,
    hasInlineSlideMessageListener: false,
    artifactDeckProtocolVersion: 0,
    hasInlineKeydownNavigation: false,
    hasInlineHashNavigation: false,
    inlineHashIndexPrefix: '#',
    scannedBytes: 10,
    complete: true,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('HtmlPreviewPolicyIndex', () => {
  it('deduplicates concurrent and repeated reads of the same exact version', async () => {
    const pending = deferred<HtmlHeadScanResult>();
    const scan = vi.fn(() => pending.promise);
    const index = new HtmlPreviewPolicyIndex({ scan });
    const request = { filePath: '/project/index.html', documentVersion: 'v1' };

    const first = index.get(request);
    const second = index.get(request);
    expect(scan).toHaveBeenCalledTimes(1);

    pending.resolve(result({ needsFocusGuard: true }));
    await expect(first).resolves.toMatchObject({ documentVersion: 'v1', guards: { focus: true } });
    await expect(second).resolves.toMatchObject({ documentVersion: 'v1', guards: { focus: true } });
    await index.get(request);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('reuses exact-version policy across request-local snapshot paths', async () => {
    const scan = vi.fn(async () => result({ needsFocusGuard: true }));
    const index = new HtmlPreviewPolicyIndex({ scan });

    await index.get({
      filePath: '/tmp/request-a.html',
      cacheKey: '/project/index.html',
      documentVersion: 'v1',
    });
    await index.get({
      filePath: '/tmp/request-b.html',
      cacheKey: '/project/index.html',
      documentVersion: 'v1',
    });

    expect(scan).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledWith('/tmp/request-a.html');
  });

  it('prewarms a version without making callers own the scan promise', async () => {
    const pending = deferred<HtmlHeadScanResult>();
    const scan = vi.fn(() => pending.promise);
    const index = new HtmlPreviewPolicyIndex({ scan });
    const request = { filePath: '/project/index.html', documentVersion: 'v1' };

    index.prewarm(request);
    expect(scan).toHaveBeenCalledTimes(1);

    const foreground = index.get(request);
    expect(scan).toHaveBeenCalledTimes(1);
    pending.resolve(result({ needsPoweredPreview: true }));

    await expect(foreground).resolves.toMatchObject({
      documentVersion: 'v1',
      sandboxProfile: 'powered',
    });
  });

  it('allows a foreground retry after a failed background prewarm', async () => {
    const first = deferred<HtmlHeadScanResult>();
    const scan = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(result());
    const index = new HtmlPreviewPolicyIndex({ scan });
    const request = { filePath: '/project/index.html', documentVersion: 'v1' };

    index.prewarm(request);
    first.reject(new Error('temporary read failure'));
    await first.promise.catch(() => undefined);
    await Promise.resolve();

    await expect(index.get(request)).resolves.toMatchObject({ documentVersion: 'v1' });
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('classifies Deck navigation from the exact daemon-scanned document', async () => {
    const index = new HtmlPreviewPolicyIndex({
      scan: vi.fn(async () => result({ hasDeckStageElement: true })),
    });

    await expect(index.get({
      filePath: '/project/deck.html',
      documentVersion: 'deck-v1',
    })).resolves.toMatchObject({
      documentVersion: 'deck-v1',
      deck: true,
    });
  });

  it('does not let an older in-flight version replace the current entry', async () => {
    const oldScan = deferred<HtmlHeadScanResult>();
    const newScan = deferred<HtmlHeadScanResult>();
    const scan = vi.fn()
      .mockReturnValueOnce(oldScan.promise)
      .mockReturnValueOnce(newScan.promise);
    const index = new HtmlPreviewPolicyIndex({ scan });
    const filePath = '/project/index.html';

    const oldRequest = index.get({ filePath, documentVersion: 'v1' });
    const newRequest = index.get({ filePath, documentVersion: 'v2' });
    newScan.resolve(result({ needsPoweredPreview: true }));
    await expect(newRequest).resolves.toMatchObject({
      documentVersion: 'v2',
      sandboxProfile: 'powered',
    });
    oldScan.resolve(result({ needsPoweredPreview: false }));
    await expect(oldRequest).resolves.toMatchObject({ documentVersion: 'v1' });

    await index.get({ filePath, documentVersion: 'v2' });
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('removes a rejected scan so the same version can retry', async () => {
    const scan = vi.fn()
      .mockRejectedValueOnce(new Error('temporary read failure'))
      .mockResolvedValueOnce(result());
    const index = new HtmlPreviewPolicyIndex({ scan });
    const request = { filePath: '/project/index.html', documentVersion: 'v1' };

    await expect(index.get(request)).rejects.toThrow('temporary read failure');
    await expect(index.get(request)).resolves.toMatchObject({ documentVersion: 'v1' });
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('evicts least-recently-used settled entries without evicting the active one', async () => {
    const scan = vi.fn(async () => result());
    const index = new HtmlPreviewPolicyIndex({ scan, maxEntries: 2 });

    await index.get({ filePath: '/project/a.html', documentVersion: 'a1' });
    await index.get({ filePath: '/project/b.html', documentVersion: 'b1' });
    await index.get({ filePath: '/project/a.html', documentVersion: 'a1' });
    await index.get({ filePath: '/project/c.html', documentVersion: 'c1' });
    await index.get({ filePath: '/project/a.html', documentVersion: 'a1' });
    await index.get({ filePath: '/project/b.html', documentVersion: 'b1' });

    expect(scan).toHaveBeenCalledTimes(4);
  });
});
