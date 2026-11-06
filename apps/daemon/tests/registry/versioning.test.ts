import type { MarketplacePluginEntry } from '@open-design/contracts';
import { describe, expect, it } from 'vitest';

import {
  parsePluginSpecifier,
  resolveMarketplaceEntryVersion,
} from '../../src/registry/versioning.js';

describe('parsePluginSpecifier', () => {
  it('returns the name alone when no range suffix is present (vendor/name form)', () => {
    expect(parsePluginSpecifier('vendor/name')).toEqual({ name: 'vendor/name' });
  });

  it('splits a vendor/name@version specifier into name + range', () => {
    expect(parsePluginSpecifier('vendor/name@1.0.0')).toEqual({
      name: 'vendor/name',
      range: '1.0.0',
    });
  });

  it('preserves caret/tilde range markers in the range field', () => {
    expect(parsePluginSpecifier('vendor/name@^1.0.0')).toEqual({
      name: 'vendor/name',
      range: '^1.0.0',
    });
    expect(parsePluginSpecifier('vendor/name@~1.2.3')).toEqual({
      name: 'vendor/name',
      range: '~1.2.3',
    });
  });

  it('preserves dist-tag style ranges like "latest"', () => {
    expect(parsePluginSpecifier('vendor/name@latest')).toEqual({
      name: 'vendor/name',
      range: 'latest',
    });
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(parsePluginSpecifier('  vendor/name@1.0.0  ')).toEqual({
      name: 'vendor/name',
      range: '1.0.0',
    });
  });

  it('treats a bare name without a slash as the whole specifier (no range split)', () => {
    // Without a `vendor/` segment, the `@` is interpreted as part of the name
    // (e.g. an org-scoped namespace), not a version separator.
    expect(parsePluginSpecifier('name@1.0.0')).toEqual({ name: 'name@1.0.0' });
  });
});

function entry(overrides: Partial<MarketplacePluginEntry> = {}): MarketplacePluginEntry {
  return {
    name: 'vendor/example',
    source: 'github:vendor/example@v1.0.0/plugin',
    version: '1.0.0',
    ...overrides,
  } as MarketplacePluginEntry;
}

describe('resolveMarketplaceEntryVersion', () => {
  it('returns null for a yanked entry regardless of requested range', () => {
    const e = entry({ yanked: true, version: '1.0.0' });
    expect(resolveMarketplaceEntryVersion(e)).toBeNull();
    expect(resolveMarketplaceEntryVersion(e, '1.0.0')).toBeNull();
  });

  it('defaults to distTags.latest when no range is requested', () => {
    const e = entry({
      version: '1.0.0',
      distTags: { latest: '1.2.0' },
      versions: [
        { version: '1.0.0', source: 'github:vendor/example@v1.0.0/plugin' },
        { version: '1.2.0', source: 'github:vendor/example@v1.2.0/plugin' },
      ],
    });
    expect(resolveMarketplaceEntryVersion(e)?.version).toBe('1.2.0');
  });

  it('picks the highest matching version for a caret range, ignoring out-of-major candidates', () => {
    const e = entry({
      version: '2.0.0',
      versions: [
        { version: '1.0.0', source: 's1' },
        { version: '1.1.5', source: 's115' },
        { version: '1.2.0', source: 's120' },
        { version: '2.0.0', source: 's200' },
      ],
    });
    const resolved = resolveMarketplaceEntryVersion(e, '^1.0.0');
    expect(resolved?.version).toBe('1.2.0');
    expect(resolved?.source).toBe('s120');
  });

  it('locks the minor for a 0.x caret range (^0.2.0 excludes 0.3.0)', () => {
    // npm caret semantics special-case a zero major: `^0.2.0` means
    // `>=0.2.0 <0.3.0`, so 0.3.0 is a breaking release that must be excluded.
    const e = entry({
      version: '0.3.0',
      versions: [
        { version: '0.2.0', source: 's020' },
        { version: '0.2.5', source: 's025' },
        { version: '0.3.0', source: 's030' },
      ],
    });
    const resolved = resolveMarketplaceEntryVersion(e, '^0.2.0');
    expect(resolved?.version).toBe('0.2.5');
    expect(resolved?.source).toBe('s025');
  });

  it('locks the patch for a 0.0.x caret range (^0.0.3 excludes 0.0.4)', () => {
    // For `^0.0.3` npm resolves `>=0.0.3 <0.0.4`, i.e. only 0.0.3.
    const e = entry({
      version: '0.0.4',
      versions: [
        { version: '0.0.3', source: 's003' },
        { version: '0.0.4', source: 's004' },
      ],
    });
    expect(resolveMarketplaceEntryVersion(e, '^0.0.3')?.version).toBe('0.0.3');
  });

  it('excludes prerelease candidates from a non-prerelease caret range', () => {
    // npm excludes prereleases from `^0.2.0` / `^0.0.3` unless the range itself
    // carries a prerelease, so a `-beta` entry must not satisfy them.
    const e = entry({
      version: '0.2.1-beta.1',
      versions: [
        { version: '0.2.0', source: 's020' },
        { version: '0.2.1-beta.1', source: 's021b' },
      ],
    });
    // Highest satisfying is the stable 0.2.0, not the newer 0.2.1-beta.1.
    expect(resolveMarketplaceEntryVersion(e, '^0.2.0')?.version).toBe('0.2.0');

    const patch = entry({
      version: '0.0.3-beta.1',
      versions: [{ version: '0.0.3-beta.1', source: 's003b' }],
    });
    // Only a prerelease exists and the range is stable, so nothing matches.
    expect(resolveMarketplaceEntryVersion(patch, '^0.0.3')).toBeNull();
  });

  it('matches same-tuple prereleases when the caret range is itself a prerelease', () => {
    // `^0.2.1-beta.1` => `>=0.2.1-beta.1 <0.3.0`: same-tuple prereleases and the
    // 0.2.1 release match (release outranks its prereleases), but 0.2.5-beta.1
    // (a different tuple) does not.
    const e = entry({
      version: '0.2.1',
      versions: [
        { version: '0.2.1-beta.1', source: 'sb1' },
        { version: '0.2.1-beta.2', source: 'sb2' },
        { version: '0.2.1', source: 's021' },
        { version: '0.2.5-beta.1', source: 's025b' },
      ],
    });
    expect(resolveMarketplaceEntryVersion(e, '^0.2.1-beta.1')?.version).toBe('0.2.1');
  });

  it('respects tilde ranges (locks minor)', () => {
    const e = entry({
      version: '1.2.5',
      versions: [
        { version: '1.2.0', source: 's' },
        { version: '1.2.5', source: 's' },
        { version: '1.3.0', source: 's' },
      ],
    });
    expect(resolveMarketplaceEntryVersion(e, '~1.2.0')?.version).toBe('1.2.5');
  });

  it('filters yanked version records from caret matches', () => {
    const e = entry({
      version: '1.2.0',
      versions: [
        { version: '1.0.0', source: 's1' },
        { version: '1.2.0', source: 's12', yanked: true },
      ],
    });
    // 1.2.0 is yanked, so the highest non-yanked match is 1.0.0.
    expect(resolveMarketplaceEntryVersion(e, '^1.0.0')?.version).toBe('1.0.0');
  });

  it('returns null when a specific yanked version is requested directly', () => {
    const e = entry({
      version: '1.0.0',
      versions: [
        { version: '1.0.0', source: 's1', yanked: true },
      ],
    });
    expect(resolveMarketplaceEntryVersion(e, '1.0.0')).toBeNull();
  });

  it('returns null when no version matches the caret range', () => {
    const e = entry({
      version: '2.0.0',
      versions: [{ version: '2.0.0', source: 's2' }],
    });
    expect(resolveMarketplaceEntryVersion(e, '^1.0.0')).toBeNull();
  });

  it('resolves a dist-tag (non-latest) name to its pinned version', () => {
    const e = entry({
      version: '1.0.0',
      distTags: { latest: '1.0.0', beta: '2.0.0-beta.1' },
      versions: [
        { version: '1.0.0', source: 's1' },
        { version: '2.0.0-beta.1', source: 'sb' },
      ],
    });
    expect(resolveMarketplaceEntryVersion(e, 'beta')?.version).toBe('2.0.0-beta.1');
  });

  it('carries through integrity / manifestDigest / ref / deprecated when present on the version record', () => {
    const e = entry({
      version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          source: 's1',
          ref: 'refs/tags/v1.0.0',
          integrity: 'sha256:abc',
          manifestDigest: 'sha256:def',
          deprecated: 'use 2.x',
        },
      ],
    });
    const r = resolveMarketplaceEntryVersion(e, '1.0.0');
    expect(r).toMatchObject({
      version: '1.0.0',
      source: 's1',
      ref: 'refs/tags/v1.0.0',
      archiveIntegrity: 'sha256:abc',
      manifestDigest: 'sha256:def',
      deprecated: 'use 2.x',
    });
  });

  it('returns null when neither version record nor entry has a source', () => {
    const e = {
      name: 'vendor/example',
      version: '1.0.0',
      versions: [{ version: '1.0.0' }],
    } as unknown as MarketplacePluginEntry;
    expect(resolveMarketplaceEntryVersion(e, '1.0.0')).toBeNull();
  });
});
