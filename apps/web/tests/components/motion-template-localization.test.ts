import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { InputFieldSpecSchema, type InstalledPluginRecord } from '@open-design/contracts';
import { LOCALES } from '../../src/i18n/types';
import { localizePluginInputLabel } from '../../src/i18n/plugin-content';
import { localizePluginTitle, localizePluginDescription } from '../../src/components/plugins-home/localization';
import { pluginPresetQuery } from '../../src/components/plugins-home/presetSeedPrompt';

const slugs = [
  'semantic-color-stripes', 'sky-water-tessellation', 'prompt-motion-gallery',
  'mind-clarity-journey', 'windows-studio-launch',
  'claude-agent-lab', 'opus-design-lab', 'superx-audience-growth',
  'kinetic-motion-designer', 'tixfox-ticket-promo', 'flowdrive-motion-reel',
  'distilbook-explainer', 'claude-design-team',
];
const variables = (text: string) => [...new Set(text.match(/\{\{[^{}]+\}\}/g) ?? [])].sort();

describe('replicated Motion template localization', () => {
  it.each(slugs)('%s covers every client locale without dropping prompt variables', slug => {
    const path = fileURLToPath(new URL(`../../../../plugins/_official/examples/motion-${slug}/open-design.json`, import.meta.url));
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    const record = { id: manifest.name, title: manifest.title, manifest } as InstalledPluginRecord;
    const query = manifest.od.useCase.query;
    for (const locale of LOCALES) {
      for (const values of [manifest.title_i18n, manifest.description_i18n, query]) {
        expect(values[locale]?.trim(), `${slug}: missing ${locale}`).toBeTruthy();
      }
      expect(variables(query[locale]), `${slug}: prompt variables in ${locale}`).toEqual(variables(query.en));
      expect(localizePluginTitle(locale, record)).toBe(manifest.title_i18n[locale]);
      expect(localizePluginDescription(locale, record)).toBe(manifest.description_i18n[locale]);
      expect(pluginPresetQuery(record, locale)).toBe(query[locale]);
      if (locale !== 'en') {
        expect(manifest.description_i18n[locale], `${slug}: English description fallback in ${locale}`).not.toBe(manifest.description_i18n.en);
        expect(query[locale], `${slug}: English prompt fallback in ${locale}`).not.toBe(query.en);
      }
      for (const input of manifest.od.inputs) {
        const field = InputFieldSpecSchema.parse(input);
        expect(field.label_i18n?.[locale]?.trim(), `${slug}/${field.name}: ${locale}`).toBeTruthy();
        expect(localizePluginInputLabel(locale, field)).toBe(field.label_i18n?.[locale]);
      }
    }
  });

  it('translates Ukrainian instructions completely and names the mascot color clearly', () => {
    const read = (slug: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../plugins/_official/examples/motion-${slug}/open-design.json`, import.meta.url)), 'utf8'));
    expect(read('opus-design-lab').od.useCase.query.uk).not.toMatch(/Finish on a light stage|Keep the six-control/);
    expect(read('claude-agent-lab').od.useCase.query.uk).not.toContain('end inside the live interface');
    const primary = read('windows-studio-launch').od.inputs.find((field: { name: string }) => field.name === 'primary');
    expect(primary.label).toBe('Primary color');
    expect(primary.label_i18n['zh-CN']).toBe('主色');
    expect(primary.label_i18n['zh-TW']).toBe('主色');
  });

  it('preserves legacy labels and uses localized labels when supplied', () => {
    expect(localizePluginInputLabel('fr', { name: 'brand', label: 'Brand' })).toBe('Brand');
    expect(localizePluginInputLabel('fr', { name: 'brand', label: 'Brand', label_i18n: { en: 'Brand', fr: 'Marque' } })).toBe('Marque');
  });
});
