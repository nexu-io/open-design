import { describe, expect, it } from 'vitest';
import {
  MARKETING_AX_PLUGIN_SPEC_VERSION,
  MarketplacePluginEntrySchema,
  PluginManifestSchema,
  resolveLocalizedText,
} from '../src/plugins/index.js';

describe('plugin manifest localized text', () => {
  it('exports the current plugin spec version for manifests and registries', () => {
    expect(MARKETING_AX_PLUGIN_SPEC_VERSION).toBe('1.0.0');
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

  it('accepts a valid preview motion and rejects an invalid one', () => {
    const manifest = PluginManifestSchema.parse({
      name: 'sample-plugin',
      version: '1.0.0',
      od: {
        preview: { type: 'html', entry: './index.html', motion: 'deck' },
      },
    });
    expect(manifest.od?.preview?.motion).toBe('deck');

    expect(() =>
      PluginManifestSchema.parse({
        name: 'sample-plugin',
        version: '1.0.0',
        od: { preview: { type: 'html', motion: 'sideways' } },
      }),
    ).toThrow();
  });

  it('accepts localized title and description metadata', () => {
    const manifest = PluginManifestSchema.parse({
      name: 'sample-plugin',
      version: '1.0.0',
      title: 'Sample Plugin',
      title_i18n: {
        en: 'Sample Plugin',
        'zh-CN': '示例插件',
      },
      description: 'English fallback.',
      description_i18n: {
        en: 'English fallback.',
        'zh-CN': '中文描述。',
      },
    });

    expect(resolveLocalizedText(manifest.title_i18n, 'zh-CN')).toBe('示例插件');
    expect(resolveLocalizedText(manifest.description_i18n, 'zh-CN')).toBe('中文描述。');
  });

  it('accepts localized marketplace entry metadata', () => {
    const entry = MarketplacePluginEntrySchema.parse({
      name: 'open-design/example-sample',
      source: 'github:open-design/plugins/examples/sample',
      version: '1.0.0',
      title: 'Sample',
      title_i18n: {
        en: 'Sample',
        'zh-CN': '示例',
      },
      description: 'English fallback.',
      description_i18n: {
        en: 'English fallback.',
        'zh-CN': '中文描述。',
      },
    });

    expect(resolveLocalizedText(entry.title_i18n, 'zh-CN')).toBe('示例');
    expect(resolveLocalizedText(entry.description_i18n, 'zh-CN')).toBe('中文描述。');
  });

  it('falls back from exact locale to base language, English, then first value', () => {
    expect(resolveLocalizedText({ en: 'English', zh: '中文' }, 'zh-CN')).toBe('中文');
    expect(resolveLocalizedText({ 'zh-CN': '中文' }, 'fr')).toBe('中文');
  });
});

describe('plugin manifest od.routing', () => {
  it('parses triggers / router / fallbackRoute and keeps them typed', () => {
    const manifest = PluginManifestSchema.parse({
      name: 'sample-routed',
      version: '1.0.0',
      od: {
        routing: {
          triggers: ['네이버 블로그', 'naver blog'],
          router: false,
        },
      },
    });
    expect(manifest.od?.routing?.triggers).toEqual(['네이버 블로그', 'naver blog']);
    expect(manifest.od?.routing?.router).toBe(false);
  });

  it('accepts a router manifest with fallbackRoute and manifests without routing', () => {
    const router = PluginManifestSchema.parse({
      name: 'sample-router',
      version: '1.0.0',
      od: { routing: { router: true, fallbackRoute: 'od-default' } },
    });
    expect(router.od?.routing?.router).toBe(true);
    expect(router.od?.routing?.fallbackRoute).toBe('od-default');

    const plain = PluginManifestSchema.parse({ name: 'plain', version: '1.0.0', od: {} });
    expect(plain.od?.routing).toBeUndefined();
  });
});
