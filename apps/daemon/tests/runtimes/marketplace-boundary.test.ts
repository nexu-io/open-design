import { describe, expect, it } from 'vitest';
import {
  bundledPluginRegistrySource,
  defaultMarketplaceSeedConfig,
  isPathWithin,
  mergeMarketplaceEntries,
  renderPluginBriefTemplate,
} from '../../src/runtimes/marketplace-boundary.js';

describe('marketplace boundary helpers', () => {
  it('renders only known, non-empty template values', () => {
    expect(renderPluginBriefTemplate('Use {{ name }} ({{missing}})', { name: 'Acme' }))
      .toBe('Use Acme ({{missing}})');
    expect(renderPluginBriefTemplate('{{empty}}', { empty: '' })).toBe('{{empty}}');
    expect(renderPluginBriefTemplate(null)).toBe('');
  });

  it('builds seed config with official trust only for the official registry', () => {
    const urlFor = (id: string) => `https://example.test/${id}.json`;
    expect(defaultMarketplaceSeedConfig('official', 'official', urlFor))
      .toEqual({ trust: 'official', url: 'https://example.test/official.json' });
    expect(defaultMarketplaceSeedConfig('community', 'official', urlFor))
      .toEqual({ trust: 'restricted', url: 'https://example.test/community.json' });
  });

  it('keeps bundled source provenance inside the official tree', () => {
    const options = {
      bundledPluginsDir: '/repo/plugins/_official',
      projectRoot: '/repo',
      officialPluginSourceRepo: 'github:org/repo@main',
    };
    expect(isPathWithin(options.bundledPluginsDir, '/repo/plugins/_official/acme'))
      .toBe(true);
    expect(isPathWithin(options.bundledPluginsDir, '/repo/plugins/_officialized/acme'))
      .toBe(false);
    expect(bundledPluginRegistrySource('/repo/plugins/_official/acme', options))
      .toBe('github:org/repo@main/plugins/_official/acme');
    expect(bundledPluginRegistrySource('/tmp/acme', options)).toBe('/tmp/acme');
  });

  it('merges generated entries without duplicate names and fails closed on bad JSON', () => {
    const merged = JSON.parse(mergeMarketplaceEntries(
      JSON.stringify({ plugins: [{ name: 'open-design/existing' }], metadata: { source: 'seed' } }),
      [{ name: 'open-design/existing', title: 'duplicate' }, { name: 'open-design/new', title: 'new' }],
    ));
    expect(merged.plugins).toEqual([
      { name: 'open-design/existing' },
      { name: 'open-design/new', title: 'new' },
    ]);
    expect(merged.metadata).toEqual({ source: 'seed', bundledPreinstallCount: 2 });
    expect(mergeMarketplaceEntries('{bad', [{ name: 'new' }])).toBe('{bad');
  });
});
