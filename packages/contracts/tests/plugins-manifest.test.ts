import { describe, expect, it } from 'vitest';
import {
  OPEN_DESIGN_PLUGIN_SPEC_VERSION,
  PluginManifestSchema,
  resolveLocalizedText,
} from '../src/plugins/manifest.js';

describe('plugin manifest localized text', () => {
  it('exports the current plugin spec version for manifests and registries', () => {
    expect(OPEN_DESIGN_PLUGIN_SPEC_VERSION).toBe('1.0.0');
  });

  it('accepts legacy string use-case queries', () => {
    const manifest = PluginManifestSchema.parse({
      name: 'sample-plugin',
      version: '1.0.0',
      od: {
        useCase: {
          query: 'Make a {{topic}} brief.',
        },
      },
    });

    expect(manifest.od?.useCase?.query).toBe('Make a {{topic}} brief.');
  });

  it('accepts locale-map use-case queries', () => {
    const manifest = PluginManifestSchema.parse({
      name: 'sample-plugin',
      version: '1.0.0',
      od: {
        useCase: {
          query: {
            en: 'Make a {{topic}} brief.',
            'zh-CN': '围绕 {{topic}} 写一份简报。',
          },
        },
      },
    });

    expect(resolveLocalizedText(manifest.od?.useCase?.query, 'zh-CN')).toBe(
      '围绕 {{topic}} 写一份简报。',
    );
  });

  it('falls back from exact locale to base language, English, then first value', () => {
    expect(resolveLocalizedText({ en: 'English', zh: '中文' }, 'zh-CN')).toBe('中文');
    expect(resolveLocalizedText({ 'zh-CN': '中文' }, 'fr')).toBe('中文');
  });
});
