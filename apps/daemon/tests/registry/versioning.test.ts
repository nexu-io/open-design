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
