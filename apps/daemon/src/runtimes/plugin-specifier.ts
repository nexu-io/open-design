export interface PluginVersionCandidate {
  version: string;
  source?: string;
  ref?: string;
  integrity?: string;
  manifestDigest?: string;
  dist?: {
    integrity?: string;
    manifestDigest?: string;
  };
  yanked?: boolean;
}

export interface PluginSpecifierEntry {
  name?: string;
  version?: string;
  source?: string;
  ref?: string;
  integrity?: string;
  manifestDigest?: string;
  dist?: {
    integrity?: string;
    manifestDigest?: string;
  };
  distTags?: Record<string, string>;
  versions?: PluginVersionCandidate[];
  yanked?: boolean;
}

export interface ParsedPluginSpecifier {
  name: string;
  range: string | undefined;
}

export interface ResolvedPluginVersion {
  version: string;
  source: string | undefined;
  ref: string | undefined;
  integrity: string | undefined;
  manifestDigest: string | undefined;
}

export function parsePluginSpecifier(input: unknown): ParsedPluginSpecifier {
  const trimmed = String(input ?? '').trim();
  const slash = trimmed.indexOf('/');
  const at = trimmed.lastIndexOf('@');
  if (slash > 0 && at > slash + 1) {
    return { name: trimmed.slice(0, at), range: trimmed.slice(at + 1) };
  }
  return { name: trimmed, range: undefined };
}

export function resolvePluginVersion(
  entry: PluginSpecifierEntry | null | undefined,
  range: string | undefined,
): ResolvedPluginVersion | null {
  if (!entry || entry.yanked) return null;
  const versions = Array.isArray(entry.versions) ? entry.versions : [];
  const target = range && range !== 'latest'
    ? (entry.distTags?.[range] ?? range)
    : (entry.distTags?.latest ?? entry.version);
  if (!target) return null;
  const version = versions.find((item) => item.version === target) ?? null;
  if (version?.yanked) return null;
  return {
    version: target,
    source: version?.source ?? entry.source,
    ref: version?.ref ?? entry.ref,
    integrity: version?.integrity ?? version?.dist?.integrity ?? entry.integrity ?? entry.dist?.integrity,
    manifestDigest: version?.manifestDigest ?? version?.dist?.manifestDigest ?? entry.manifestDigest ?? entry.dist?.manifestDigest,
  };
}
