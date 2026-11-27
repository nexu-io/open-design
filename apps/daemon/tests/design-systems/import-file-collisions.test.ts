import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'vitest';

import { importLocalDesignSystemProject, type LocalDesignSystemImportResult } from '../../src/design-systems/import.js';

async function withImportedProject(
  files: Record<string, string>,
  check: (result: LocalDesignSystemImportResult) => Promise<void>,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-import-copy-names-'));
  try {
    const sourceRoot = path.join(root, 'source');
    await mkdir(sourceRoot);
    await writeFile(path.join(sourceRoot, 'package.json'), JSON.stringify({ name: 'copy-name-fixture' }));
    for (const [relative, content] of Object.entries(files)) {
      const filename = path.join(sourceRoot, relative);
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, content);
    }
    await check(await importLocalDesignSystemProject(sourceRoot, path.join(root, 'imports'), {
      now: new Date('2026-05-18T10:00:00.000Z'),
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function copiedContents(result: LocalDesignSystemImportResult, directory: 'assets' | 'fonts') {
  const extensions = directory === 'fonts'
    ? new Set(['.woff', '.woff2', '.ttf', '.otf'])
    : new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico']);
  const files = result.files.filter((file) => file.startsWith(`${directory}/`) && extensions.has(path.extname(file)));
  assert.equal(new Set(files).size, files.length, 'each selected source needs a distinct output path');
  return new Map(await Promise.all(files.map(async (file) => [file, await readFile(path.join(result.dir, file), 'utf8')] as const)));
}

async function fontManifest(result: LocalDesignSystemImportResult) {
  return JSON.parse(await readFile(path.join(result.dir, 'manifest.json'), 'utf8')) as {
    fonts: Array<{ family: string; file: string }>;
  };
}

describe('local design-system import copy names', () => {
  it('preserves both assets when different source directories use the same basename', async () => {
    await withImportedProject({
      'public/light/logo.svg': '<svg>light logo</svg>',
      'src/assets/dark/logo.svg': '<svg>dark logo</svg>',
    }, async (result) => {
      const copied = await copiedContents(result, 'assets');
      assert.deepEqual([...copied.values()].sort(), ['<svg>dark logo</svg>', '<svg>light logo</svg>']);
      assert.ok(copied.has('assets/logo.svg'));
    });
  });

  it('preserves same-basename font bytes and points each manifest entry at its copied file', async () => {
    await withImportedProject({
      'fonts/latin/Regular.woff2': 'latin font bytes',
      'fonts/cjk/Regular.woff2': 'cjk font bytes',
    }, async (result) => {
      const copied = await copiedContents(result, 'fonts');
      const manifest = await fontManifest(result);
      assert.deepEqual([...copied.values()].sort(), ['cjk font bytes', 'latin font bytes']);
      assert.equal(manifest.fonts.length, 2);
      assert.deepEqual(manifest.fonts.map((font) => font.file).sort(), [...copied.keys()].sort());
      assert.ok(manifest.fonts.every((font) => font.family === 'Regular'));
    });
  });

  it('handles slug and extension-case collisions without taking an existing suffixed name', async () => {
    await withImportedProject({
      'assets/a/Brand Logo.svg': 'first logo',
      'assets/b/brand_logo.SVG': 'second logo',
      'assets/z/brand-logo-2.svg': 'natural logo suffix',
      'fonts/a/BrandFont.woff2': 'first font',
      'fonts/b/brandfont.WOFF2': 'second font',
      'fonts/z/brandfont-2.woff2': 'natural font suffix',
    }, async (result) => {
      const assets = await copiedContents(result, 'assets');
      const fonts = await copiedContents(result, 'fonts');
      assert.deepEqual([...assets.keys()].sort(), ['assets/brand-logo-2.svg', 'assets/brand-logo-3.svg', 'assets/brand-logo.svg']);
      assert.deepEqual([...fonts.keys()].sort(), ['fonts/brandfont-2.woff2', 'fonts/brandfont-3.woff2', 'fonts/brandfont.woff2']);
      assert.equal(assets.get('assets/brand-logo-2.svg'), 'natural logo suffix');
      assert.equal(fonts.get('fonts/brandfont-2.woff2'), 'natural font suffix');
      assert.deepEqual([...assets.values()].sort(), ['first logo', 'natural logo suffix', 'second logo']);
      assert.deepEqual([...fonts.values()].sort(), ['first font', 'natural font suffix', 'second font']);
      const manifest = await fontManifest(result);
      assert.deepEqual(manifest.fonts.map((font) => font.file).sort(), [...fonts.keys()].sort());
    });
  });

  it('keeps distinct font families when non-Latin names share the slug fallback', async () => {
    await withImportedProject({
      'fonts/a/甲.woff2': 'font for 甲',
      'fonts/b/乙.woff2': 'font for 乙',
      'fonts/z/imported-design-system-2.woff2': 'natural fallback suffix',
    }, async (result) => {
      const copied = await copiedContents(result, 'fonts');
      const manifest = await fontManifest(result);
      assert.equal(copied.size, 3);
      assert.equal(copied.get('fonts/imported-design-system-2.woff2'), 'natural fallback suffix');
      for (const family of ['甲', '乙']) {
        const font = manifest.fonts.find((entry) => entry.family === family);
        assert.ok(font);
        assert.equal(copied.get(font.file), `font for ${family}`);
      }
    });
  });

  it('keeps a suffixed filename within the filesystem component limit', async () => {
    const filename = `logo${'x'.repeat(247)}.svg`;
    assert.equal(Buffer.byteLength(filename), 255);
    await withImportedProject({
      [`assets/a/${filename}`]: 'first long-name logo',
      [`assets/b/${filename}`]: 'second long-name logo',
    }, async (result) => {
      const copied = await copiedContents(result, 'assets');
      assert.deepEqual([...copied.values()].sort(), ['first long-name logo', 'second long-name logo']);
      for (const relative of copied.keys()) assert.ok(Buffer.byteLength(path.basename(relative)) <= 255);
    });
  });

  it('retains non-colliding names, distinct extensions and representative snippets', async () => {
    await withImportedProject({
      'assets/logo.svg': 'vector logo',
      'assets/logo.png': 'raster logo',
      'fonts/AcmeSans-Regular.woff2': 'web font',
      'fonts/AcmeSans-Regular.ttf': 'desktop font',
      'src/components/Button.tsx': 'export function Button() {}',
    }, async (result) => {
      const assets = await copiedContents(result, 'assets');
      const fonts = await copiedContents(result, 'fonts');
      assert.deepEqual([...assets.keys()].sort(), ['assets/logo.png', 'assets/logo.svg']);
      assert.deepEqual([...fonts.keys()].sort(), ['fonts/acmesans-regular.ttf', 'fonts/acmesans-regular.woff2']);
      assert.deepEqual((await fontManifest(result)).fonts.map((font) => font.file).sort(), [...fonts.keys()].sort());
      assert.equal(await readFile(path.join(result.dir, 'source/snippets/button.tsx'), 'utf8'), 'export function Button() {}');
      const index = JSON.parse(await readFile(path.join(result.dir, 'source/snippets/INDEX.json'), 'utf8')) as {
        snippets: Array<{ path: string; sourcePath: string }>;
      };
      assert.equal(index.snippets[0]?.path, 'source/snippets/button.tsx');
      assert.equal(index.snippets[0]?.sourcePath, 'src/components/Button.tsx');
      assert.equal(new Set(result.files).size, result.files.length);
    });
  });
});
