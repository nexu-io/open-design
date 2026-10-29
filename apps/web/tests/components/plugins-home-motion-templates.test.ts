// Motion design Home templates — bundled plugin contract.
//
// The motion-design chip owns an OD Next route, so picking one of its example
// cards binds the plugin's SKILL.md as a session skill at project create. A
// curated template without SKILL.md fails that bind ("example plugin has no
// readable SKILL.md to carry as a Skill"). SKILL.md must also name
// `example.html` so the frozen skill package carries the reference output.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { describe, expect, it } from 'vitest';
import { CURATED_MOTION_DESIGN_PLUGIN_IDS } from '../../src/components/plugins-home/curatedPriority';
import { examplePresetSeedPrompt } from '../../src/components/plugins-home/presetSeedPrompt';
import { homePresetCopy } from '../../src/components/plugins-home/homePresetCopy';
import { localizePluginTitle } from '../../src/components/plugins-home/localization';
import { inferPluginPreview } from '../../src/components/plugins-home/preview';
import { LOCALES } from '../../src/i18n/types';
import type { InstalledPluginRecord } from '@open-design/contracts';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const examplesRoot = path.resolve(__dirname, '../../../../plugins/_official/examples');

function exampleDirsById(): Map<string, string> {
  const dirs = new Map<string, string>();
  for (const entry of readdirSync(examplesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(examplesRoot, entry.name, 'open-design.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string };
    if (manifest.name) dirs.set(manifest.name, path.join(examplesRoot, entry.name));
  }
  return dirs;
}

describe('curated motion design templates', () => {
  const dirs = exampleDirsById();

  it.each([...CURATED_MOTION_DESIGN_PLUGIN_IDS])('%s ships an example card the OD Next route can bind', (id) => {
    const dir = dirs.get(id);
    expect(dir, `${id} has no bundled example folder`).toBeDefined();
    const skill = readFileSync(path.join(dir!, 'SKILL.md'), 'utf8');
    expect(skill).toMatch(/\bexample\.html\b/);
    expect(existsSync(path.join(dir!, 'example.html'))).toBe(true);
    const manifest = JSON.parse(readFileSync(path.join(dir!, 'open-design.json'), 'utf8'));
    expect(manifest.od.preview.poster).toBe('./assets/cover.jpg');
    expect(existsSync(path.join(dir!, 'assets/cover.jpg'))).toBe(true);
  });

  it('seeds the showreel template from Home in every locale with its original viral prompt', () => {
    const id = 'example-motion-showreel';
    const manifest = JSON.parse(readFileSync(path.join(dirs.get(id)!, 'open-design.json'), 'utf8'));
    const record = { id, manifest } as InstalledPluginRecord;
    for (const locale of LOCALES) {
      const seed = examplePresetSeedPrompt(record, locale, () => 'missing prompt');
      expect(seed.text, locale).toBe(manifest.od.useCase.query[locale]);
      expect(seed.text, locale).toMatch(/15|۱۵/);
    }
  });

  it('uses the chosen Future cover even when an older baked clip is attached', () => {
    const id = 'example-motion-future';
    const manifest = JSON.parse(readFileSync(path.join(dirs.get(id)!, 'open-design.json'), 'utf8'));
    manifest.od.bakedPreview = {
      poster: 'https://cdn.example.com/black-poster.jpg',
      video: 'https://cdn.example.com/black-preview.mp4',
      holdMs: 2500,
    };
    const record = { id, manifest } as InstalledPluginRecord;

    expect(inferPluginPreview(record, { preferBaked: true })).toMatchObject({
      kind: 'media',
      mediaType: 'image',
      poster: `/api/plugins/${id}/asset/assets/cover.jpg`,
      videoUrl: null,
      imageOnly: true,
    });
    expect(inferPluginPreview(record).kind).toBe('html');
  });

  it('uses the renamed paper story consistently across Home and Community in all supported locales', () => {
    const id = 'example-motion-visual-lesson';
    const manifest = JSON.parse(readFileSync(path.join(dirs.get(id)!, 'open-design.json'), 'utf8'));
    const record = { id, title: manifest.title, manifest } as InstalledPluginRecord;
    expect(localizePluginTitle('en', record)).toBe('Bring Ideas to Life');
    expect(localizePluginTitle('zh-CN', record)).toBe('让灵感成真');
    for (const locale of LOCALES) {
      expect(manifest.title_i18n[locale], locale).toBeTruthy();
      expect(homePresetCopy(id, locale)?.title, locale).toBe(localizePluginTitle(locale, record));
    }
  });
});
