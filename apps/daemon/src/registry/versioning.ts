import type { MarketplacePluginEntry } from '@open-design/contracts';

export interface ParsedPluginSpecifier {
  name: string;
  range?: string;
}

export interface ResolvedMarketplaceVersion {
  version: string;
  source: string;
  ref?: string;
  manifestDigest?: string;
  archiveIntegrity?: string;
  deprecated?: boolean | string;
}

export function parsePluginSpecifier(input: string): ParsedPluginSpecifier {
  const trimmed = input.trim();
  const slash = trimmed.indexOf('/');
  const at = trimmed.lastIndexOf('@');
  if (slash > 0 && at > slash + 1) {
    const range = trimmed.slice(at + 1);
    return range
      ? { name: trimmed.slice(0, at), range }
      : { name: trimmed.slice(0, at) };
  }
  return { name: trimmed };
}

export function resolveMarketplaceEntryVersion(
  entry: MarketplacePluginEntry,
  requestedRange?: string,
): ResolvedMarketplaceVersion | null {
  if (entry.yanked) return null;

  const versions = entry.versions ?? [];
  const range = requestedRange?.trim();
  const defaultVersion =
    entry.distTags?.latest ??
    entry.version ??
    versions.find((version) => !version.yanked)?.version;
  const targetVersion = range && range !== 'latest'
    ? resolveRequestedVersion(versions, entry.distTags ?? {}, range)
    : defaultVersion;
  if (!targetVersion) return null;

  const versionRecord = versions.find((version) => version.version === targetVersion);
  if (versionRecord?.yanked) return null;

  const source = versionRecord?.source ?? entry.source;
  if (!source) return null;

  const resolved: ResolvedMarketplaceVersion = {
    version: targetVersion,
    source,
  };
  const ref = versionRecord?.ref ?? entry.ref;
  if (ref) resolved.ref = ref;
  const manifestDigest =
    versionRecord?.manifestDigest ??
    versionRecord?.dist?.manifestDigest ??
    entry.manifestDigest ??
    entry.dist?.manifestDigest;
  if (manifestDigest) resolved.manifestDigest = manifestDigest;
  const archiveIntegrity =
    versionRecord?.integrity ??
    versionRecord?.dist?.integrity ??
    entry.integrity ??
    entry.dist?.integrity;
  if (archiveIntegrity) resolved.archiveIntegrity = archiveIntegrity;
  const deprecated = versionRecord?.deprecated ?? entry.deprecated;
  if (deprecated !== undefined) resolved.deprecated = deprecated;
  return resolved;
}

function resolveRequestedVersion(
  versions: NonNullable<MarketplacePluginEntry['versions']>,
  distTags: Record<string, string>,
  range: string,
): string | null {
  const tagged = distTags[range];
  if (tagged) return tagged;
  if (!range.startsWith('^') && !range.startsWith('~')) {
    return range;
  }

  const base = parseSemver(range.slice(1));
  if (!base) return null;
  const candidates = versions
    .filter((version) => !version.yanked)
    .map((version) => version.version)
    .filter((version) => {
      const parsed = parseSemver(version);
      if (!parsed) return false;
      if (range.startsWith('^')) {
        return parsed.major === base.major && compareSemver(parsed, base) >= 0;
      }
      return parsed.major === base.major &&
        parsed.minor === base.minor &&
        compareSemver(parsed, base) >= 0;
    })
    .sort((left, right) => compareSemver(parseSemver(right)!, parseSemver(left)!));
  return candidates[0] ?? null;
}

interface SemverParts {
  major: number;
  minor: number;
  patch: number;
}

function parseSemver(value: string): SemverParts | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
  if (!match) return null;
  return {
    major: Number(match[1] ?? 0),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
  };
}

function compareSemver(left: SemverParts, right: SemverParts): number {
  return left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch;
}
