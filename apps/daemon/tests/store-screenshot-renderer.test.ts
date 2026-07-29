import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  StorePlatform,
  StoreScreenshotDocument,
} from '@launch-studio/store-screenshot';
import {
  exportStoreScreenshots,
  renderStoreScreenshotPage,
  StoreScreenshotExportValidationError,
} from '../src/store-screenshots/renderer.js';
import { LocalProjectStorage } from '../src/storage/project-storage.js';

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
  let root: string;
  let storage: LocalProjectStorage;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'od-store-renderer-assets-'));
    storage = new LocalProjectStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

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

  it.each([
    ['png', 'image/png', '#E02020', 'red'],
    ['jpeg', 'image/jpeg', '#20C040', 'green'],
    ['webp', 'image/webp', '#2040E0', 'blue'],
  ] as const)(
    'composites real %s screenshot pixels into the expected page region',
    async (format, mime, color, dominantChannel) => {
      const document = documentFixture();
      document.assets = [{ id: 'screen-1' }];
      document.pages[0] = {
        ...document.pages[0]!,
        screenshotAssetId: 'screen-1',
      };
      const body = await sharp({
        create: {
          width: 240,
          height: 480,
          channels: 3,
          background: color,
        },
      })[format]().toBuffer();
      const relativePath = `store-screenshots/assets/screen-1.${format === 'jpeg' ? 'jpg' : format}`;
      await storage.writeFile('project-1', relativePath, body);
      const renderOptions = {
        projectStorage: storage,
        lookupAsset: async () => ({
          id: 'screen-1',
          projectId: 'project-1',
          documentId: 'document-1',
          relativePath,
          mime,
          width: 240,
          height: 480,
          contentHash: createHash('sha256').update(body).digest('hex'),
        }),
      };

      const first = await renderStoreScreenshotPage(
        document,
        'page-1',
        'appStore',
        renderOptions,
      );
      const second = await renderStoreScreenshotPage(
        document,
        'page-1',
        'appStore',
        renderOptions,
      );
      expect(first.equals(second)).toBe(true);
      const pixel = await sharp(first)
        .extract({ left: 640, top: 1800, width: 1, height: 1 })
        .raw()
        .toBuffer();
      const means = {
        red: pixel[0]!,
        green: pixel[1]!,
        blue: pixel[2]!,
      };
      expect(means[dominantChannel]).toBeGreaterThan(180);
      expect(means[dominantChannel]).toBeGreaterThan(
        Math.max(...Object.entries(means)
          .filter(([channel]) => channel !== dominantChannel)
          .map(([, value]) => value)) + 80,
      );
    },
  );

  it('produces different final PNGs for different uploaded screenshot pixels', async () => {
    const document = documentFixture();
    document.assets = [{ id: 'screen-1' }];
    document.pages[0] = {
      ...document.pages[0]!,
      screenshotAssetId: 'screen-1',
    };
    const red = await sharp({
      create: { width: 20, height: 40, channels: 3, background: '#ff0000' },
    }).png().toBuffer();
    const blue = await sharp({
      create: { width: 20, height: 40, channels: 3, background: '#0000ff' },
    }).png().toBuffer();
    const pathA = 'store-screenshots/assets/red.png';
    const pathB = 'store-screenshots/assets/blue.png';
    await storage.writeFile('project-1', pathA, red);
    await storage.writeFile('project-1', pathB, blue);
    const render = (relativePath: string) => renderStoreScreenshotPage(
      document,
      'page-1',
      'appStore',
      {
        projectStorage: storage,
        lookupAsset: async () => ({
          id: 'screen-1',
          projectId: 'project-1',
          documentId: 'document-1',
          relativePath,
          mime: 'image/png' as const,
          width: 20,
          height: 40,
          contentHash: createHash('sha256')
            .update(relativePath === pathA ? red : blue)
            .digest('hex'),
        }),
      },
    );

    expect((await render(pathA)).equals(await render(pathB))).toBe(false);
  });

  it('flattens transparent uploaded pixels deterministically into a three-channel PNG', async () => {
    const document = documentFixture();
    document.assets = [{ id: 'screen-1' }];
    document.pages[0] = {
      ...document.pages[0]!,
      screenshotAssetId: 'screen-1',
    };
    const body = await sharp({
      create: {
        width: 20,
        height: 40,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0.5 },
      },
    }).png().toBuffer();
    const relativePath = 'store-screenshots/assets/transparent.png';
    await storage.writeFile('project-1', relativePath, body);
    const options = {
      projectStorage: storage,
      lookupAsset: async () => ({
        id: 'screen-1',
        projectId: 'project-1',
        documentId: 'document-1',
        relativePath,
        mime: 'image/png' as const,
        width: 20,
        height: 40,
        contentHash: createHash('sha256').update(body).digest('hex'),
      }),
    };

    const first = await renderStoreScreenshotPage(document, 'page-1', 'appStore', options);
    const second = await renderStoreScreenshotPage(document, 'page-1', 'appStore', options);
    expect(first.equals(second)).toBe(true);
    expect(await sharp(first).metadata()).toMatchObject({ channels: 3 });
    const pixel = await sharp(first)
      .extract({ left: 640, top: 1800, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect(pixel[0]).toBeGreaterThan(120);
    expect(pixel[0]).toBeLessThan(230);
    expect(pixel[2]).toBeGreaterThan(70);
  });

  it('composites logoAssetId pixels into the deterministic logo region', async () => {
    const document = documentFixture();
    document.assets = [{ id: 'logo-1' }];
    document.pages[0] = {
      ...document.pages[0]!,
      logoAssetId: 'logo-1',
    };
    const logo = await sharp({
      create: {
        width: 200,
        height: 80,
        channels: 3,
        background: '#FF00CC',
      },
    }).png().toBuffer();
    const relativePath = 'store-screenshots/assets/logo.png';
    await storage.writeFile('project-1', relativePath, logo);

    const withLogo = await renderStoreScreenshotPage(
      document,
      'page-1',
      'appStore',
      {
        projectStorage: storage,
        lookupAsset: async () => ({
          id: 'logo-1',
          projectId: 'project-1',
          documentId: 'document-1',
          relativePath,
          mime: 'image/png' as const,
          width: 200,
          height: 80,
          contentHash: createHash('sha256').update(logo).digest('hex'),
        }),
      },
    );
    const withoutLogoDocument = {
      ...document,
      pages: [{ ...document.pages[0]!, logoAssetId: undefined }],
    };
    const withoutLogo = await renderStoreScreenshotPage(
      withoutLogoDocument,
      'page-1',
      'appStore',
    );
    expect(withLogo.equals(withoutLogo)).toBe(false);
    const pixel = await sharp(withLogo)
      .extract({ left: 200, top: 160, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect(pixel[0]).toBeGreaterThan(220);
    expect(pixel[2]).toBeGreaterThan(160);
    expect(pixel[1]).toBeLessThan(60);
  });
});
