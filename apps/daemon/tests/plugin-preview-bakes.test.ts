import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyBakedPreviews,
  bakedPreviewBlock,
  PLUGIN_PREVIEWS_ROUTE,
} from '../src/plugin-preview-bakes.js';

const PUBLIC_BASE = 'https://repo-assets.open-design.ai/plugin-previews';

interface ManifestEntry {
  video: string;
  poster: string;
  durationMs: number;
  holdMs: number;
  hash: string;
}

interface PluginRecord {
  id: string;
  manifest: {
    name: string;
    od: Record<string, unknown>;
  };
}

function repoRoot(): string {
  return path.resolve(import.meta.dirname, '../../..');
}

function checkedInManifest(): Record<string, ManifestEntry> {
  const manifestPath = path.join(repoRoot(), 'data', 'plugin-previews', 'manifest.json');
  expect(existsSync(manifestPath)).toBe(true);
  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    previews?: Record<string, ManifestEntry>;
  };
  return parsed.previews ?? {};
}

function assertRelativeAssetPath(assetPath: string): void {
  expect(assetPath).not.toBe('');
  expect(path.posix.isAbsolute(assetPath)).toBe(false);
  const segments = assetPath.split('/');
  expect(segments.every((segment) => segment && segment !== '.' && segment !== '..')).toBe(true);
}

async function writeManifest(
  dir: string,
  previews: Record<string, Partial<ManifestEntry>>,
): Promise<void> {
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ previews }, null, 2));
}

let tmpDir: string | undefined;
let previousBaseUrl: string | undefined;

afterEach(async () => {
  if (previousBaseUrl === undefined) {
    delete process.env.OD_PLUGIN_PREVIEWS_BASE_URL;
  } else {
    process.env.OD_PLUGIN_PREVIEWS_BASE_URL = previousBaseUrl;
  }
  previousBaseUrl = undefined;
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

describe('plugin preview bake manifest', () => {
  it('keeps every checked-in preview entry fetchable and path-safe', () => {
    const previews = checkedInManifest();
    expect(Object.keys(previews).length).toBeGreaterThan(0);

    for (const [id, entry] of Object.entries(previews)) {
      expect(entry.video, `${id} video`).toMatch(/\.mp4$/);
      expect(entry.poster, `${id} poster`).toMatch(/\.jpg$/);
      expect(entry.hash, `${id} hash`).toMatch(/^[a-f0-9]{16}$/);
      expect(entry.durationMs, `${id} durationMs`).toBeGreaterThan(0);
      expect(entry.holdMs, `${id} holdMs`).toBeGreaterThanOrEqual(0);

      assertRelativeAssetPath(entry.video);
      assertRelativeAssetPath(entry.poster);
      expect(entry.video, `${id} video hash`).toContain(entry.hash);
      expect(entry.poster, `${id} poster hash`).toContain(entry.hash);

      const videoDir = path.posix.dirname(entry.video);
      const posterDir = path.posix.dirname(entry.poster);
      expect(posterDir, `${id} poster/video directory`).toBe(videoDir);
      if (entry.video.includes('/')) {
        expect(entry.video, `${id} nested video name`).toBe(`${id}/${entry.hash}/preview.mp4`);
        expect(entry.poster, `${id} nested poster name`).toBe(`${id}/${entry.hash}/poster.jpg`);
      }
    }
  });
});

describe('bakedPreviewBlock', () => {
  it('uses the public preview origin when the manifest points to remote-only nested assets', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-baked-preview-'));
    await writeManifest(tmpDir, {
      'html-plugin': {
        video: 'html-plugin/abc123abc123abcd/preview.mp4',
        poster: 'html-plugin/abc123abc123abcd/poster.jpg',
        durationMs: 7500,
        holdMs: 2500,
        hash: 'abc123abc123abcd',
      },
    });

    expect(bakedPreviewBlock('html-plugin', tmpDir)).toEqual({
      video: `${PUBLIC_BASE}/html-plugin/abc123abc123abcd/preview.mp4`,
      poster: `${PUBLIC_BASE}/html-plugin/abc123abc123abcd/poster.jpg`,
      holdMs: 2500,
    });
  });

  it('uses the daemon static route when nested preview assets exist on disk', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-baked-preview-'));
    const nested = path.join(tmpDir, 'html-plugin', 'def456def456abcd');
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(nested, 'preview.mp4'), 'clip');
    await writeFile(path.join(nested, 'poster.jpg'), 'poster');
    await writeManifest(tmpDir, {
      'html-plugin': {
        video: 'html-plugin/def456def456abcd/preview.mp4',
        poster: 'html-plugin/def456def456abcd/poster.jpg',
        durationMs: 7500,
        holdMs: 2500,
        hash: 'def456def456abcd',
      },
    });

    expect(bakedPreviewBlock('html-plugin', tmpDir)).toEqual({
      video: `${PLUGIN_PREVIEWS_ROUTE}/html-plugin/def456def456abcd/preview.mp4`,
      poster: `${PLUGIN_PREVIEWS_ROUTE}/html-plugin/def456def456abcd/poster.jpg`,
      holdMs: 2500,
    });
  });

  it('lets an explicit preview base override both local and public origins', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-baked-preview-'));
    previousBaseUrl = process.env.OD_PLUGIN_PREVIEWS_BASE_URL;
    process.env.OD_PLUGIN_PREVIEWS_BASE_URL = 'https://cdn.example.test/previews/';
    await writeManifest(tmpDir, {
      'html-plugin': {
        video: 'html-plugin/fed987fed987abcd/preview.mp4',
        poster: 'html-plugin/fed987fed987abcd/poster.jpg',
        durationMs: 7500,
        hash: 'fed987fed987abcd',
      },
    });

    expect(bakedPreviewBlock('html-plugin', tmpDir)).toEqual({
      video: 'https://cdn.example.test/previews/html-plugin/fed987fed987abcd/preview.mp4',
      poster: 'https://cdn.example.test/previews/html-plugin/fed987fed987abcd/poster.jpg',
    });
  });
});

describe('applyBakedPreviews', () => {
  it('attaches baked previews without overwriting authored preview blocks', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-baked-preview-'));
    await writeManifest(tmpDir, {
      'html-plugin': {
        video: 'html-plugin/aaaabbbbccccdddd/preview.mp4',
        poster: 'html-plugin/aaaabbbbccccdddd/poster.jpg',
        durationMs: 7500,
        holdMs: 2500,
        hash: 'aaaabbbbccccdddd',
      },
    });
    const records: PluginRecord[] = [
      {
        id: 'html-plugin',
        manifest: {
          name: 'html-plugin',
          od: { preview: { type: 'html', entry: './index.html' } },
        },
      },
      {
        id: 'plain-plugin',
        manifest: { name: 'plain-plugin', od: { preview: { type: 'image', poster: '/p.jpg' } } },
      },
    ];

    const out = applyBakedPreviews(records, tmpDir);

    const bakedRecord = out[0];
    expect(bakedRecord).toBeDefined();
    expect(bakedRecord).not.toBe(records[0]);
    expect(bakedRecord?.manifest.od.preview).toEqual({ type: 'html', entry: './index.html' });
    expect(bakedRecord?.manifest.od.bakedPreview).toEqual({
      video: `${PUBLIC_BASE}/html-plugin/aaaabbbbccccdddd/preview.mp4`,
      poster: `${PUBLIC_BASE}/html-plugin/aaaabbbbccccdddd/poster.jpg`,
      holdMs: 2500,
    });
    expect(out[1]).toBe(records[1]);
  });
});
