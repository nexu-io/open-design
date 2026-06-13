import type { MarketplaceManifest, MarketplacePluginEntry } from '@open-design/contracts';
import type {
  RegistryBackend,
  RegistryDoctorReport,
  RegistryEntry,
  RegistrySearchQuery,
  RegistrySearchResult,
  RegistryTrust,
  ResolvedRegistryEntry,
} from '@open-design/registry-protocol';
import {
  RegistryEntrySchema,
  RegistrySearchQuerySchema,
} from '@open-design/registry-protocol';
import {
  parsePluginSpecifier,
  resolveMarketplaceEntryVersion,
} from './versioning.js';

export interface StaticRegistryBackendOptions {
  id: string;
  kind?: 'github' | 'http' | 'local' | 'db';
  trust: RegistryTrust;
  manifest: MarketplaceManifest;
}

export class StaticRegistryBackend implements RegistryBackend {
  readonly id: string;
  readonly kind: 'github' | 'http' | 'local' | 'db';
  readonly trust: RegistryTrust;

  protected readonly manifestData: MarketplaceManifest;

  constructor(options: StaticRegistryBackendOptions) {
    this.id = options.id;
    this.kind = options.kind ?? 'http';
    this.trust = options.trust;
    this.manifestData = options.manifest;
  }

  async list(): Promise<RegistryEntry[]> {
    return (this.getManifest().plugins ?? [])
      .filter((entry) => !entry.yanked)
      .flatMap((entry) => {
        const parsed = toRegistryEntry(entry);
        return parsed ? [parsed] : [];
      });
  }

  async search(input: RegistrySearchQuery): Promise<RegistrySearchResult[]> {
    const query = RegistrySearchQuerySchema.parse(input);
    const terms = query.query.toLowerCase().split(/\s+/g).filter(Boolean);
    const tags = new Set((query.tags ?? []).map((tag) => tag.toLowerCase()));
    const entries = await this.list();
    const results: RegistrySearchResult[] = [];
    for (const entry of entries) {
      if (tags.size > 0) {
        const entryTags = new Set((entry.tags ?? []).map((tag) => tag.toLowerCase()));
        if (![...tags].every((tag) => entryTags.has(tag))) continue;
      }
      const haystack = [
        entry.name,
        entry.title ?? '',
        entry.description ?? '',
        ...(entry.tags ?? []),
        ...(entry.capabilitiesSummary ?? []),
        entry.publisher?.id ?? '',
        entry.publisher?.github ?? '',
      ].join(' ').toLowerCase();
      const matched = terms.filter((term) => haystack.includes(term));
      if (terms.length > 0 && matched.length === 0) continue;
      results.push({
        entry,
        score: terms.length === 0 ? 0 : matched.length / terms.length,
        matched,
      });
    }
    return results
      .sort((left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name))
      .slice(0, query.limit ?? 100);
  }

  async resolve(name: string, range?: string): Promise<ResolvedRegistryEntry | null> {
    const parsed = parsePluginSpecifier(range ? `${name}@${range}` : name);
    const entry = (this.getManifest().plugins ?? [])
      .find((plugin) => plugin.name.toLowerCase() === parsed.name.toLowerCase());
    if (!entry) return null;
    const resolvedVersion = resolveMarketplaceEntryVersion(entry, parsed.range);
    if (!resolvedVersion) return null;
    const registryEntry = toRegistryEntry(entry);
    if (!registryEntry) return null;
    return {
      backendId: this.id,
      backendKind: this.kind,
      trust: this.trust,
      entry: registryEntry,
      version: {
        version: resolvedVersion.version,
        source: resolvedVersion.source,
        ref: resolvedVersion.ref,
        integrity: resolvedVersion.archiveIntegrity,
        manifestDigest: resolvedVersion.manifestDigest,
        deprecated: resolvedVersion.deprecated,
      },
      source: resolvedVersion.source,
      ref: resolvedVersion.ref,
      integrity: resolvedVersion.archiveIntegrity,
      manifestDigest: resolvedVersion.manifestDigest,
    };
  }

  async manifest(name: string, version: string): Promise<RegistryEntry | null> {
    const resolved = await this.resolve(name, version);
    return resolved?.entry ?? null;
  }

  async doctor(): Promise<RegistryDoctorReport> {
    const issues = [];
    const plugins = this.getManifest().plugins ?? [];
    for (const entry of plugins) {
      if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(entry.name)) {
        issues.push({
          severity: 'error' as const,
          code: 'invalid-name',
          message: 'Registry plugin name must be vendor/plugin-name.',
          pluginName: entry.name,
        });
      }
      if (!entry.source && !entry.dist?.archive) {
        issues.push({
          severity: 'error' as const,
          code: 'missing-source',
          message: 'Registry entry must provide source or dist.archive.',
          pluginName: entry.name,
        });
      }
      if (!entry.license) {
        issues.push({
          severity: 'warning' as const,
          code: 'missing-license',
          message: 'Registry entry should declare a license.',
          pluginName: entry.name,
        });
      }
      if (!entry.capabilitiesSummary || entry.capabilitiesSummary.length === 0) {
        issues.push({
          severity: 'warning' as const,
          code: 'missing-capabilities',
          message: 'Registry entry should summarize plugin capabilities.',
          pluginName: entry.name,
        });
      }
      if (entry.yanked && !entry.yankReason) {
        issues.push({
          severity: 'error' as const,
          code: 'missing-yank-reason',
          message: 'Yanked entries must keep a human-readable reason.',
          pluginName: entry.name,
        });
      }
    }
    return {
      ok: !issues.some((issue) => issue.severity === 'error'),
      backendId: this.id,
      checkedAt: Date.now(),
      entriesChecked: plugins.length,
      issues,
    };
  }

  protected getManifest(): MarketplaceManifest {
    return this.manifestData;
  }
}

export function toRegistryEntry(entry: MarketplacePluginEntry): RegistryEntry | null {
  const parsed = RegistryEntrySchema.safeParse({
    ...entry,
    publisher: normalizePublisher(entry.publisher),
  });
  return parsed.success ? parsed.data : null;
}

function normalizePublisher(publisher: MarketplacePluginEntry['publisher']) {
  if (!publisher) return undefined;
  return {
    id: publisher.id,
    github: publisher.github,
    url: publisher.url,
  };
}
