import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HtmlHeadScanResult } from '../../src/http/html-stream-injection.js';
import { HtmlPreviewPolicyIndex } from '../../src/http/html-preview-policy-index.js';
import {
  prewarmHtmlPreviewPolicyFile,
  previewSnapshotPolicyCacheKey,
} from '../../src/http/html-preview-policy-prewarm.js';
import { PreviewDocumentSnapshotStore } from '../../src/http/preview-document-snapshot.js';

function scanResult(): HtmlHeadScanResult {
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
    scannedBytes: 32,
    complete: true,
  };
}

describe('HTML preview policy watcher prewarm', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function fixture() {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-preview-policy-prewarm-'));
    roots.push(root);
    const sourcePath = path.join(root, 'index.html');
    const snapshots = new PreviewDocumentSnapshotStore({
      rootDir: path.join(root, 'snapshots'),
    });
    return { root, sourcePath, snapshots };
  }

  it('shares one immutable exact-version scan from watcher prewarm to preview-url', async () => {
    const { sourcePath, snapshots } = await fixture();
    const source = '<!doctype html><main>exact version</main>';
    await writeFile(sourcePath, source);
    const scannedSources: string[] = [];
    const scan = vi.fn(async (filePath: string) => {
      scannedSources.push(await readFile(filePath, 'utf8'));
      return scanResult();
    });
    const index = new HtmlPreviewPolicyIndex({ scan });

    await prewarmHtmlPreviewPolicyFile(
      index,
      'index.html',
      { filePath: sourcePath, mime: 'text/html' },
      snapshots,
    );

    const foreground = await snapshots.captureFile(sourcePath);
    try {
      await index.get({
        filePath: foreground.filePath,
        cacheKey: previewSnapshotPolicyCacheKey(sourcePath),
        documentVersion: foreground.documentVersion,
      });
    } finally {
      await foreground.release();
    }

    expect(scan).toHaveBeenCalledTimes(1);
    expect(scan.mock.calls[0]?.[0]).not.toBe(sourcePath);
    expect(scannedSources).toEqual([source]);
  });

  it('does not reuse authored policy for a transformed Vite representation', async () => {
    const { sourcePath, snapshots } = await fixture();
    const authored = '<!doctype html><script type="module" src="/src/main.ts"></script>';
    const transformed = '<!doctype html><main>built dist</main>';
    await writeFile(sourcePath, authored);
    const scan = vi.fn(async () => scanResult());
    const index = new HtmlPreviewPolicyIndex({ scan });

    await prewarmHtmlPreviewPolicyFile(
      index,
      'index.html',
      { filePath: sourcePath, mime: 'text/html' },
      snapshots,
    );

    const foreground = await snapshots.captureBuffer(async () => transformed);
    try {
      await index.get({
        filePath: foreground.filePath,
        cacheKey: previewSnapshotPolicyCacheKey(sourcePath),
        documentVersion: foreground.documentVersion,
      });
    } finally {
      await foreground.release();
    }

    expect(scan).toHaveBeenCalledTimes(2);
  });
});
