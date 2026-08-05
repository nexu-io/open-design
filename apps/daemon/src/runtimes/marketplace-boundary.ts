export interface MarketplaceEntry {
  name?: unknown;
  [key: string]: unknown;
}

export interface MarketplaceSeedConfig {
  trust: 'official' | 'restricted';
  url: string;
}

export function renderPluginBriefTemplate(
  template: unknown,
  inputs: Record<string, unknown> = {},
): string {
  if (typeof template !== 'string' || template.length === 0) return '';
  return template.replace(/\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g, (full, key: string) => {
    if (!Object.hasOwn(inputs, key)) return full;
    const value = inputs[key];
    if (value === undefined || value === null || value === '') return full;
    return String(value);
  });
}

export function defaultMarketplaceSeedConfig(
  id: string,
  officialMarketplaceId: string,
  manifestUrlForRegistry: (registryId: string) => string,
): MarketplaceSeedConfig {
  return {
    trust: id === officialMarketplaceId ? 'official' : 'restricted',
    url: manifestUrlForRegistry(id),
  };
}

export function isPathWithin(base: string, target: string): boolean {
  const relativePath = path.relative(path.resolve(base), path.resolve(target));
  return (
    relativePath === '' ||
    (relativePath.length > 0 &&
      !relativePath.startsWith('..') &&
      !path.isAbsolute(relativePath))
  );
}

export function bundledPluginRegistrySource(
  sourcePath: string,
  options: {
    bundledPluginsDir: string;
    projectRoot: string;
    officialPluginSourceRepo: string;
  },
): string {
  if (isPathWithin(options.bundledPluginsDir, sourcePath)) {
    const relativePath = path.relative(options.bundledPluginsDir, sourcePath).split(path.sep).join('/');
    return `${options.officialPluginSourceRepo}/plugins/_official/${relativePath}`;
  }
  const relativePath = path.relative(options.projectRoot, sourcePath).split(path.sep).join('/');
  if (!relativePath || relativePath.startsWith('..')) {
    return sourcePath;
  }
  return `${options.officialPluginSourceRepo}/${relativePath}`;
}

export function mergeMarketplaceEntries(
  manifestText: string,
  entries: readonly MarketplaceEntry[],
): string {
  try {
    const parsed = JSON.parse(manifestText) as Record<string, unknown>;
    const plugins = Array.isArray(parsed.plugins) ? parsed.plugins : [];
    const seen = new Set(
      plugins.map((entry) => String((entry as MarketplaceEntry | null)?.name ?? '').toLowerCase()),
    );
    const generated = entries.filter((entry) => {
      const key = String(entry.name ?? '').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const metadata = parsed.metadata && typeof parsed.metadata === 'object' && !Array.isArray(parsed.metadata)
      ? parsed.metadata as Record<string, unknown>
      : {};
    return JSON.stringify({
      ...parsed,
      metadata: {
        ...metadata,
        bundledPreinstallCount: entries.length,
      },
      plugins: [...plugins, ...generated],
    });
  } catch {
    return manifestText;
  }
}
import path from 'node:path';
