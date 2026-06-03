export const RELEASE_METADATA_URL = '/release-metadata';
export const RELEASE_METADATA_UPSTREAM_URL = 'https://releases.open-design.ai/stable/latest/metadata.json';

export function formatStableReleaseVersion(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const record = metadata as {
    baseVersion?: unknown;
    releaseVersion?: unknown;
    stableVersion?: unknown;
    versionTag?: unknown;
  };

  const fromVersion = (version: unknown) => {
    if (typeof version !== 'string') return null;
    const match = version.match(/(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/);
    return match ? `v${match[1]}` : null;
  };

  const fromTag = (tag: unknown) => {
    if (typeof tag !== 'string') return null;
    const cleaned = tag.replace(/^open-design[-_]?v?/i, '').trim();
    return cleaned ? `v${cleaned.replace(/^v/, '')}` : null;
  };

  return (
    fromVersion(record.releaseVersion) ??
    fromVersion(record.stableVersion) ??
    fromVersion(record.baseVersion) ??
    fromTag(record.versionTag)
  );
}
