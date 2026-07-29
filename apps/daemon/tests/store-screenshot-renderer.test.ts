import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import type {
  StorePlatform,
  StoreScreenshotDocument,
} from '@launch-studio/store-screenshot';
import {
  exportStoreScreenshots,
  renderStoreScreenshotPage,
  StoreScreenshotExportValidationError,
} from '../src/store-screenshots/renderer.js';

function documentFixture(): StoreScreenshotDocument {
  return {
    schemaVersion: 1,
    id: 'document-1',
    projectId: 'project-1',
    version: 7,
    product: {
      name: 'Focus',
      summary: 'Make time for meaningful work',
      audience: 'Creators',
      features: ['Plan', 'Focus', 'Review', 'Improve'],
    },
    designSystemId: 'clay',
    assets: [],
    pages: [
      {
        id: 'page-1',
        order: 0,
        templateId: 'minimal-center',
        headline: 'Plan the day',
        overrides: {},
        lockedFields: [],
      },
      {
        id: 'page-2',
        order: 1,
        templateId: 'gradient-device',
        headline: 'Stay focused',
        body: 'Block distractions',
        overrides: {},
        lockedFields: [],
      },
      {
        id: 'page-3',
        order: 2,
        templateId: 'editorial-split',
        headline: 'Review progress',
        overrides: {},
        lockedFields: [],
      },
      {
        id: 'page-4',
        order: 3,
        templateId: 'minimal-center',
        headline: 'Build momentum',
        overrides: {},
        lockedFields: [],
      },
    ],
  };
}

describe('store screenshot renderer', () => {
  it.each([
    ['appStore', 1290, 2796],
    ['googlePlay', 1080, 1920],
  ] satisfies Array<[StorePlatform, number, number]>)(
    'renders deterministic %s PNGs at the exact size without alpha',
    async (platform, width, height) => {
      const document = documentFixture();
      const first = await renderStoreScreenshotPage(document, 'page-2', platform);
      const second = await renderStoreScreenshotPage(document, 'page-2', platform);

      expect(first.equals(second)).toBe(true);
      expect(await sharp(first).metadata()).toMatchObject({
        width,
        height,
        format: 'png',
        channels: 3,
      });
    },
  );

  it('exports stable platform names with a complete manifest and safe ZIP entries', async () => {
    const document = documentFixture();
    const exportedAt = new Date('2026-07-29T08:00:00.000Z');
    const result = await exportStoreScreenshots(
      document,
      ['googlePlay', 'appStore', 'googlePlay'],
      { now: () => exportedAt },
    );

    expect(result.files).toEqual([
      'app-store/01.png',
      'app-store/02.png',
      'app-store/03.png',
      'app-store/04.png',
      'google-play/01.png',
      'google-play/02.png',
      'google-play/03.png',
      'google-play/04.png',
      'manifest.json',
    ]);
    expect(result.manifest).toMatchObject({
      schemaVersion: 1,
      documentId: 'document-1',
      documentVersion: 7,
      exportedAt: '2026-07-29T08:00:00.000Z',
      platforms: {
        appStore: {
          ruleVersion: 1,
          targetSize: { width: 1290, height: 2796 },
          pageCount: 4,
        },
        googlePlay: {
          ruleVersion: 1,
          targetSize: { width: 1080, height: 1920 },
          pageCount: 4,
        },
      },
      errors: [],
      warnings: [],
    });
    expect(result.manifest.files).toHaveLength(8);
    expect(result.manifest.files[0]).toMatchObject({
      order: 1,
      fileName: 'app-store/01.png',
      width: 1290,
      height: 2796,
      sourcePageId: 'page-1',
      templateId: 'minimal-center',
    });
    for (const entry of result.entries) {
      expect(entry.sha256).toBe(createHash('sha256').update(entry.body).digest('hex'));
      expect(entry.fileName).not.toMatch(/(^\/|\\|(?:^|\/)\.\.(?:\/|$))/);
    }

    const zip = await JSZip.loadAsync(result.zip);
    expect(Object.keys(zip.files).sort()).toEqual([...result.files].sort());
    expect(zip.file('manifest.json')).not.toBeNull();
    expect(
      JSON.parse(await zip.file('manifest.json')!.async('string')),
    ).toEqual(result.manifest);
  });

  it('rejects a platform export when visible screenshots violate its count rule', async () => {
    const document = documentFixture();
    document.pages[3]!.overrides.googlePlay = { hidden: true };

    await expect(exportStoreScreenshots(document, ['googlePlay'])).rejects.toMatchObject({
      name: 'StoreScreenshotExportValidationError',
      issues: [{
        severity: 'error',
        code: 'PAGE_COUNT_OUT_OF_RANGE',
        platform: 'googlePlay',
      }],
    } satisfies Partial<StoreScreenshotExportValidationError>);
  });
});
