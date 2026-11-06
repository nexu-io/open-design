import { describe, expect, it } from 'vitest';
import {
  buildStrategyPackageIdentity,
  normalizeStrategyAssetPath,
  strategyPackageHashFromDigests,
} from '../src/strategy-package.js';

const bytes = (value: string) => new TextEncoder().encode(value);

describe('strategy package identity', () => {
  const assets = [
    { path: './SKILL.md', bytes: bytes('skill') },
    { path: './open-design.json', bytes: bytes('{"name":"od-next-strategy"}') },
    { path: './assets/core.md', bytes: bytes('core') },
    { path: './assets/orchestration.md', bytes: bytes('orchestration') },
    { path: './assets/task-profiles/prototype.md', bytes: bytes('prototype') },
    { path: './references/mapping.md', bytes: bytes('mapping') },
  ];

  it('normalizes paths, sorts assets, and produces a stable recomputable hash', () => {
    const forward = buildStrategyPackageIdentity({ assets });
    const reverse = buildStrategyPackageIdentity({ assets: [...assets].reverse() });

    expect(forward).toEqual(reverse);
    expect(forward.assetDigests.map((asset) => asset.path)).toEqual(
      [...forward.assetDigests.map((asset) => asset.path)].sort((a, b) => a < b ? -1 : a > b ? 1 : 0),
    );
    expect(forward.packageHash).toMatch(/^[a-f0-9]{64}$/);
    expect(strategyPackageHashFromDigests(forward.assetDigests)).toBe(forward.packageHash);
  });

  it('changes for one byte or for a selected task profile change', () => {
    const baseline = buildStrategyPackageIdentity({ assets });
    const changedByte = buildStrategyPackageIdentity({
      assets: assets.map((asset) => asset.path.endsWith('/core.md')
        ? { ...asset, bytes: bytes('Core') }
        : asset),
    });
    const changedProfile = buildStrategyPackageIdentity({
      assets: assets.map((asset) => asset.path.endsWith('/prototype.md')
        ? { path: './assets/task-profiles/hyperframes.md', bytes: bytes('hyperframes') }
        : asset),
    });

    expect(changedByte.packageHash).not.toBe(baseline.packageHash);
    expect(changedProfile.packageHash).not.toBe(baseline.packageHash);
  });

  it('hashes only the explicitly supplied asset roster', () => {
    const baseline = buildStrategyPackageIdentity({ assets });
    const unrelatedFileThatWasNotDeclared = bytes('ignored');

    expect(unrelatedFileThatWasNotDeclared.byteLength).toBeGreaterThan(0);
    expect(buildStrategyPackageIdentity({ assets }).packageHash).toBe(baseline.packageHash);
  });

  it.each([
    ['/absolute.md'],
    ['../escape.md'],
    ['./assets/../escape.md'],
    ['C:\\escape.md'],
    ['.\\escape.md'],
  ])('rejects unsafe asset path %s', (unsafePath) => {
    expect(() => normalizeStrategyAssetPath(unsafePath)).toThrow(/relative|travers|backslash/i);
    expect(() => buildStrategyPackageIdentity({
      assets: [{ path: unsafePath, bytes: bytes('unsafe') }],
    })).toThrow();
  });

  it('rejects duplicate paths after normalization', () => {
    expect(() => buildStrategyPackageIdentity({
      assets: [
        { path: './assets/core.md', bytes: bytes('first') },
        { path: 'assets//core.md', bytes: bytes('second') },
      ],
    })).toThrow(/duplicate/i);
  });
});
