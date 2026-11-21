import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'vitest';

import { renderDeck } from '../../design-templates/open-design-landing-deck/scripts/compose.js';
import type { OpenDesignLandingDeckInputs } from '../../design-templates/open-design-landing-deck/schema.js';
import { renderPage } from '../../design-templates/open-design-landing/scripts/compose.js';
import { writePlaceholders } from '../../design-templates/open-design-landing/scripts/placeholder.js';
import type {
  EditorialCollageInputs,
  ImageStrategy,
} from '../../design-templates/open-design-landing/schema.js';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LANDING_ROOT = path.join(REPO_ROOT, 'design-templates', 'open-design-landing');
const DECK_ROOT = path.join(REPO_ROOT, 'design-templates', 'open-design-landing-deck');
const workDirs: string[] = [];

afterEach(async () => {
  await Promise.all(workDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

function imageSources(html: string): string[] {
  return Array.from(html.matchAll(/<img\s+[^>]*src=['"]([^'"]+)['"]/g), (match) => match[1]!);
}

function withLandingStrategy(
  inputs: EditorialCollageInputs,
  strategy: ImageStrategy,
  assetsPath: string,
): EditorialCollageInputs {
  return {
    ...inputs,
    imagery: { ...inputs.imagery, strategy, assets_path: assetsPath },
  };
}

function withDeckStrategy(
  inputs: OpenDesignLandingDeckInputs,
  strategy: ImageStrategy,
  assetsPath: string,
): OpenDesignLandingDeckInputs {
  return {
    ...inputs,
    imagery: { ...inputs.imagery, strategy, assets_path: assetsPath },
  };
}

describe('open-design landing asset formats', () => {
  test('placeholder generation writes one valid SVG per manifest slot and no PNG aliases', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'open-design-placeholders-'));
    workDirs.push(outputDir);
    const manifest = await readJson<{
      slots: Array<{ id: string; width: number; height: number }>;
    }>(path.join(LANDING_ROOT, 'assets', 'image-manifest.json'));

    const written = await writePlaceholders(outputDir);
    const files = (await readdir(outputDir)).sort();

    expect(written).toHaveLength(manifest.slots.length);
    expect(files).toEqual(manifest.slots.map((slot) => `${slot.id}.svg`).sort());
    expect(files.some((file) => file.endsWith('.png'))).toBe(false);

    for (const slot of manifest.slots) {
      const svg = await readFile(path.join(outputDir, `${slot.id}.svg`), 'utf8');
      expect(svg).toMatch(/^<\?xml version='1\.0' encoding='UTF-8'\?>\s*<svg/);
      expect(svg).toContain(`viewBox='0 0 ${slot.width} ${slot.height}'`);
      expect(svg).toContain(`width='${slot.width}' height='${slot.height}'`);
    }
  });

  test.each([
    ['placeholder', 'svg'],
    ['generate', 'png'],
    ['bring-your-own', 'png'],
  ] as const)('landing %s strategy references %s assets', async (strategy, extension) => {
    const inputs = await readJson<EditorialCollageInputs>(
      path.join(LANDING_ROOT, 'inputs.example.json'),
    );
    const sources = imageSources(
      renderPage(withLandingStrategy(inputs, strategy, './custom-assets'), ''),
    );

    expect(sources).toHaveLength(16);
    expect(sources.every((source) => source.startsWith('./custom-assets/'))).toBe(true);
    expect(sources.every((source) => source.endsWith(`.${extension}`))).toBe(true);
    expect(sources.every((source) => !source.includes('custom-assets//'))).toBe(true);
  });

  test.each([
    ['placeholder', 'svg'],
    ['generate', 'png'],
    ['bring-your-own', 'png'],
  ] as const)('deck %s strategy references %s assets', async (strategy, extension) => {
    const inputs = await readJson<OpenDesignLandingDeckInputs>(
      path.join(DECK_ROOT, 'inputs.example.json'),
    );
    const sources = imageSources(
      renderDeck(withDeckStrategy(inputs, strategy, './shared-assets/'), ''),
    );

    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((source) => source.startsWith('./shared-assets/'))).toBe(true);
    expect(sources.every((source) => source.endsWith(`.${extension}`))).toBe(true);
    expect(sources.every((source) => !source.includes('shared-assets//'))).toBe(true);
  });

  test('every placeholder landing reference has a generated SVG', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'open-design-placeholder-refs-'));
    workDirs.push(outputDir);
    const generated = new Set((await writePlaceholders(outputDir)).map((file) => path.basename(file)));
    const inputs = await readJson<EditorialCollageInputs>(
      path.join(LANDING_ROOT, 'inputs.example.json'),
    );
    const referenced = imageSources(
      renderPage(withLandingStrategy(inputs, 'placeholder', './assets/'), ''),
    ).map((source) => path.posix.basename(source));

    expect(new Set(referenced)).toEqual(generated);
  });
});
