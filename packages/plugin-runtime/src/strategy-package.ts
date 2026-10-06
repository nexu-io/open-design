import { createHash } from 'node:crypto';

const STRATEGY_PACKAGE_IDENTITY_SCHEMA = 'open-design.strategy-package-identity/v1';
const SHA256_HEX = /^[a-f0-9]{64}$/;

export interface StrategyPackageAssetInput {
  path: string;
  bytes: Uint8Array;
}

export interface StrategyPackageAssetDigest {
  path: string;
  sha256: string;
}

export interface StrategyPackageIdentity {
  packageHash: string;
  assetDigests: StrategyPackageAssetDigest[];
}

/**
 * Canonicalize a plugin-relative strategy asset path without consulting the
 * filesystem. The result always uses a `./` prefix and POSIX separators so
 * package identity is stable across hosts.
 */
export function normalizeStrategyAssetPath(input: string): string {
  if (typeof input !== 'string' || input.length === 0 || input.includes('\0')) {
    throw new Error('Strategy asset path must be a non-empty relative path.');
  }
  if (input.includes('\\')) {
    throw new Error('Strategy asset path must use POSIX separators; backslashes are not allowed.');
  }
  if (input.startsWith('/') || /^[A-Za-z]:/.test(input)) {
    throw new Error('Strategy asset path must be relative to the plugin root.');
  }

  const parts: string[] = [];
  for (const part of input.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      throw new Error('Strategy asset path may not traverse outside the plugin root.');
    }
    parts.push(part);
  }
  if (parts.length === 0) {
    throw new Error('Strategy asset path must identify a file below the plugin root.');
  }
  return `./${parts.join('/')}`;
}

/**
 * Compute content digests from an explicit asset roster. This helper performs
 * no directory discovery or filesystem I/O; callers own which bytes enter the
 * strategy identity.
 */
export function buildStrategyPackageIdentity(input: {
  assets: readonly StrategyPackageAssetInput[];
}): StrategyPackageIdentity {
  if (input.assets.length === 0) {
    throw new Error('Strategy package identity requires at least one declared asset.');
  }

  const seen = new Set<string>();
  const assetDigests = input.assets.map((asset) => {
    const normalizedPath = normalizeStrategyAssetPath(asset.path);
    if (seen.has(normalizedPath)) {
      throw new Error(`Duplicate strategy asset path after normalization: ${normalizedPath}`);
    }
    seen.add(normalizedPath);
    if (!(asset.bytes instanceof Uint8Array)) {
      throw new Error(`Strategy asset bytes are required for ${normalizedPath}.`);
    }
    return {
      path: normalizedPath,
      sha256: createHash('sha256').update(asset.bytes).digest('hex'),
    };
  }).sort((a, b) => compareCodeUnits(a.path, b.path));

  return {
    packageHash: strategyPackageHashFromDigests(assetDigests),
    assetDigests,
  };
}

/** Recompute the package hash from the persisted digest roster. */
export function strategyPackageHashFromDigests(
  input: readonly StrategyPackageAssetDigest[],
): string {
  if (input.length === 0) {
    throw new Error('Strategy package digest roster must not be empty.');
  }
  const seen = new Set<string>();
  const assets = input.map((asset) => {
    const normalizedPath = normalizeStrategyAssetPath(asset.path);
    if (seen.has(normalizedPath)) {
      throw new Error(`Duplicate strategy asset digest path: ${normalizedPath}`);
    }
    seen.add(normalizedPath);
    if (!SHA256_HEX.test(asset.sha256)) {
      throw new Error(`Invalid SHA-256 digest for strategy asset ${normalizedPath}.`);
    }
    return { path: normalizedPath, sha256: asset.sha256 };
  }).sort((a, b) => compareCodeUnits(a.path, b.path));

  const canonical = JSON.stringify({
    schema: STRATEGY_PACKAGE_IDENTITY_SCHEMA,
    assets,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
