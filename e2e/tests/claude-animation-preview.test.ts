import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect, it } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';

const previewModule = Object.values(import.meta.glob<{
  inferPluginPreview: (record: InstalledPluginRecord, opts: { preferBaked: boolean }) => unknown;
}>('../../apps/web/src/components/plugins-home/preview.ts', { eager: true }))[0]!;
const facetsModule = Object.values(import.meta.glob<{
  extractCategories: (record: InstalledPluginRecord) => string[];
}>('../../apps/web/src/components/plugins-home/facets.ts', { eager: true }))[0]!;

const modelCatalogues = import.meta.glob<{
  VIDEO_MODELS: { id: string }[];
}>('../../apps/{daemon,web}/src/media/models.ts', { eager: true });

const pluginRoot = fileURLToPath(new URL('../../plugins/_official/examples/claude-animation/', import.meta.url));

it('offers hand-painted animation as a Motion template, not a standalone video model in the web picker', () => {
  const entries = Object.entries(modelCatalogues);
  const web = entries.find(([file]) => file.includes('/apps/web/'))![1];
  const daemon = entries.find(([file]) => file.includes('/apps/daemon/'))![1];
  expect(web.VIDEO_MODELS.some(({ id }) => id === 'claude-animation-p5')).toBe(false);
  // The daemon keeps the compatible internal renderer id for scaffolded sources.
  expect(daemon.VIDEO_MODELS.some(({ id }) => id === 'claude-animation-p5')).toBe(true);
});

it('shows the bundled hand-painted sample under Motion design with its own poster and video', async () => {
  const manifest = JSON.parse(await readFile(path.join(pluginRoot, 'open-design.json'), 'utf8'));
  const record = { id: manifest.name, title: manifest.title, manifest } as InstalledPluginRecord;
  expect(previewModule.inferPluginPreview(record, { preferBaked: true })).toMatchObject({
    kind: 'media',
    mediaType: 'video',
    poster: '/api/plugins/example-claude-animation/asset/assets/cover.jpg',
    videoUrl: '/api/plugins/example-claude-animation/asset/assets/example.mp4',
  });
  expect(facetsModule.extractCategories(record)).toEqual(['motion-design']);
  for (const asset of [manifest.od.preview.poster, manifest.od.preview.video]) {
    expect((await stat(path.join(pluginRoot, asset))).size).toBeGreaterThan(0);
  }
});

it('ships the original-character starter and separate p5 license/source notices', async () => {
  const runtime = path.join(pluginRoot, 'runtime');
  const starter = await readFile(path.join(runtime, 'template.html'), 'utf8');
  expect(starter).toContain('function bird(t)');
  expect(starter).not.toMatch(/clawd\(|Clawd/);
  await expect(stat(path.join(runtime, 'clawd.js'))).rejects.toThrow();
  expect(await readFile(path.join(runtime, 'LICENSE'), 'utf8')).toContain('Copyright (c) 2026 John Heibel');
  expect(await readFile(path.join(runtime, 'licenses/p5-LGPL-2.1.txt'), 'utf8')).toContain('Version 2.1, February 1999');
  expect(await readFile(path.join(runtime, 'licenses/p5.brush-MIT.txt'), 'utf8')).toContain('Alejandro Campos Uribe');
  const archivePath = path.join(runtime, 'licenses/p5-2.3.3-source.tar.xz');
  const source = await readFile(archivePath);
  // Kept under the CI per-file blob limit (1 MiB) by xz compression.
  expect(source.length).toBeLessThan(1024 * 1024);
  expect(createHash('sha256').update(source).digest('hex'))
    .toBe('bffcfc91b8742de2368d32b19892ba43af2e83559c534ab6851bf4c0e5bbefd9');
  const entries = execFileSync('tar', ['-tJf', archivePath], { encoding: 'utf8' }).split('\n');
  expect(entries).toContain('p5.js-2.3.3/src/');
  expect(entries).toContain('p5.js-2.3.3/package-lock.json');
  expect(entries).toContain('p5.js-2.3.3/rollup.config.mjs');
});
