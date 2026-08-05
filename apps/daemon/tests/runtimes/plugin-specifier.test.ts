import { describe, expect, it } from 'vitest';
import { parsePluginSpecifier, resolvePluginVersion } from '../../src/runtimes/plugin-specifier.js';

describe('plugin specifier helpers', () => {
  it('splits scoped plugin names from explicit versions or tags', () => {
    expect(parsePluginSpecifier('@acme/landing@2.1.0')).toEqual({
      name: '@acme/landing',
      range: '2.1.0',
    });
    expect(parsePluginSpecifier('official-plugin')).toEqual({
      name: 'official-plugin',
      range: undefined,
    });
    expect(parsePluginSpecifier('  plugin@latest  ')).toEqual({
      name: 'plugin@latest',
      range: undefined,
    });
  });

  it('resolves latest, dist tags, and explicit versions with version-level metadata', () => {
    const entry = {
      version: '1.0.0',
      source: 'entry-source',
      ref: 'main',
      distTags: { latest: '1.2.0', stable: '1.1.0' },
      versions: [
        { version: '1.1.0', source: 'version-source', integrity: 'sha256-version' },
        { version: '1.2.0', manifestDigest: 'digest-latest' },
      ],
    };
    expect(resolvePluginVersion(entry, undefined)).toEqual({
      version: '1.2.0',
      source: 'entry-source',
      ref: 'main',
      integrity: undefined,
      manifestDigest: 'digest-latest',
    });
    expect(resolvePluginVersion(entry, 'stable')).toEqual({
      version: '1.1.0',
      source: 'version-source',
      ref: 'main',
      integrity: 'sha256-version',
      manifestDigest: undefined,
    });
  });

  it('rejects yanked entries, yanked versions, and entries with no target version', () => {
    expect(resolvePluginVersion({ yanked: true, version: '1.0.0' }, undefined)).toBeNull();
    expect(resolvePluginVersion({
      version: '1.0.0',
      versions: [{ version: '1.0.0', yanked: true }],
    }, undefined)).toBeNull();
    expect(resolvePluginVersion({ versions: [] }, undefined)).toBeNull();
  });
});
