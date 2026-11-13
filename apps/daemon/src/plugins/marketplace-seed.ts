import fs from 'node:fs';
import { safeExternalFetch } from './plugin-asset-cache.js';
import path from 'node:path';

export const OFFICIAL_MARKETPLACE_ID = 'official';
export const OFFICIAL_PLUGIN_SOURCE_REPO = 'github:nexu-io/open-design@main';

export interface MarketplaceSeedEntry {
  name: string;
  [key: string]: unknown;
}

export interface MarketplaceSeedConfig {
  trust: 'official' | 'restricted';
  url: string;
}

export interface MarketplaceSeedFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export interface MarketplaceSeedHelpers {
  defaultMarketplaceSeedConfig(id: string): MarketplaceSeedConfig;
  bundledPluginRegistrySource(sourcePath: string): string;
  marketplaceSeedManifestText(id: string, bundledMarketplaceEntries: readonly MarketplaceSeedEntry[]): Promise<string | null>;
  createMarketplaceFetcher(
    seedId: string | null | undefined,
    bundledMarketplaceEntries: readonly MarketplaceSeedEntry[],
  ): (url: string) => Promise<MarketplaceSeedFetchResponse>;
}

export interface MarketplaceSeedHelperDeps {
  bundledPluginsDir: string;
  projectRoot: string;
  pluginRegistryDir: string;
  marketplaceManifestUrlForRegistry(id: string): string;
  marketplaceRegistryIdFromUrl(url: string): string | null;
  fetchImpl?: typeof fetch;
}

export function createMarketplaceSeedHelpers(deps: MarketplaceSeedHelperDeps): MarketplaceSeedHelpers {
  const fetchImpl = deps.fetchImpl ?? fetch;

  function defaultMarketplaceSeedConfig(id: string): MarketplaceSeedConfig {
    return {
      trust: id === OFFICIAL_MARKETPLACE_ID ? 'official' : 'restricted',
      url: deps.marketplaceManifestUrlForRegistry(id),
    };
  }

  function bundledPluginRegistrySource(sourcePath: string): string {
    if (isPathWithin(deps.bundledPluginsDir, sourcePath)) {
      const rel = path.relative(deps.bundledPluginsDir, sourcePath).split(path.sep).join('/');
      return `${OFFICIAL_PLUGIN_SOURCE_REPO}/plugins/_official/${rel}`;
    }
    const rel = path.relative(deps.projectRoot, sourcePath).split(path.sep).join('/');
    if (!rel || rel.startsWith('..')) return sourcePath;
    return `${OFFICIAL_PLUGIN_SOURCE_REPO}/${rel}`;
  }

  async function marketplaceSeedManifestText(
    id: string,
    bundledMarketplaceEntries: readonly MarketplaceSeedEntry[],
  ): Promise<string | null> {
    const manifestPath = path.join(deps.pluginRegistryDir, id, 'open-design-marketplace.json');
    if (!fs.existsSync(manifestPath)) return null;
    let manifestText = await fs.promises.readFile(manifestPath, 'utf8');
    if (id === OFFICIAL_MARKETPLACE_ID && bundledMarketplaceEntries.length > 0) {
      manifestText = mergeMarketplaceEntries(manifestText, bundledMarketplaceEntries);
    }
    return manifestText;
  }

  function createMarketplaceFetcher(
    seedId: string | null | undefined,
    bundledMarketplaceEntries: readonly MarketplaceSeedEntry[],
  ): (url: string) => Promise<MarketplaceSeedFetchResponse> {
    return async (url) => {
      const registryId = deps.marketplaceRegistryIdFromUrl(url);
      if (registryId && (!seedId || registryId === seedId)) {
        const manifestText = await marketplaceSeedManifestText(registryId, bundledMarketplaceEntries);
        if (manifestText != null) {
          return {
            ok: true,
            status: 200,
            text: async () => manifestText,
          };
        }
      }
      const response = await safeExternalFetch(url, {}, fetchImpl);
      return {
        ok: response.ok,
        status: response.status,
        text: () => response.text(),
      };
    };
  }

  return {
    defaultMarketplaceSeedConfig,
    bundledPluginRegistrySource,
    marketplaceSeedManifestText,
    createMarketplaceFetcher,
  };
}

function isPathWithin(base: string, target: string): boolean {
  const relativePath = path.relative(path.resolve(base), path.resolve(target));
  return (
    relativePath === '' ||
    (relativePath.length > 0 &&
      !relativePath.startsWith('..') &&
      !path.isAbsolute(relativePath))
  );
}

function mergeMarketplaceEntries(
  manifestText: string,
  entries: readonly MarketplaceSeedEntry[],
): string {
  try {
    const parsed = JSON.parse(manifestText) as {
      metadata?: unknown;
      plugins?: unknown;
    };

    const plugins = Array.isArray(parsed.plugins) ? parsed.plugins : [];

    const bundledByName = new Map(
      entries.map((entry) => [entry.name.toLowerCase(), entry]),
    );

    const seen = new Set(
      plugins.map((entry) =>
        String(asRecord(entry)?.name ?? '').toLowerCase(),
      ),
    );

    // Add bundled translations to existing marketplace entries, merging
    // locale by locale: catalog translations win where present, and the
    // catalog's English display text is always preserved.
    const mergedPlugins = plugins.map((plugin) => {
      const existing = asRecord(plugin);
      if (!existing) return plugin;

      const name = String(existing.name ?? '').toLowerCase();
      const bundled = bundledByName.get(name);

      if (!bundled) return plugin;

      const titleI18n = mergeI18n(
        existing.title_i18n,
        bundled.title_i18n,
        existing.title,
      );
      const descriptionI18n = mergeI18n(
        existing.description_i18n,
        bundled.description_i18n,
        existing.description,
      );

      return {
        ...existing,
        ...(titleI18n !== undefined ? { title_i18n: titleI18n } : {}),
        ...(descriptionI18n !== undefined
          ? { description_i18n: descriptionI18n }
          : {}),
      };
    });

    // Keep adding bundled plugins that are not already registered.
    const generated = entries.filter((entry) => {
      const key = String(entry.name ?? '').toLowerCase();

      if (!key || seen.has(key)) return false;

      seen.add(key);
      return true;
    });

    return JSON.stringify({
      ...parsed,
      metadata: {
        ...(isRecord(parsed.metadata) ? parsed.metadata : {}),
        bundledPreinstallCount: entries.length,
      },
      plugins: [...mergedPlugins, ...generated],
    });
  } catch {
    return manifestText;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// Merge a bundled translation map into a catalog entry's map, one locale at
// a time. Existing catalog translations win where present; bundled values
// only fill locales the catalog lacks. The catalog's English display text
// is authoritative: the merged 'en' is the catalog map's 'en' when present,
// else the catalog's plain title/description, and only falls back to the
// bundled 'en' when the catalog has no English text at all. Anchoring 'en'
// matters because resolveLocalizedText falls back to the first map value
// when 'en' is absent, which would show e.g. Chinese text in the English UI.
function mergeI18n(
  existing: unknown,
  bundled: unknown,
  englishText: unknown,
): Record<string, string> | undefined {
  const existingMap = asRecord(existing);
  const bundledMap = asRecord(bundled);
  if (!existingMap && !bundledMap) return undefined;

  const merged: Record<string, string> = {};
  for (const [locale, value] of Object.entries(bundledMap ?? {})) {
    const text = asNonEmptyString(value);
    if (text !== undefined) merged[locale] = text;
  }
  for (const [locale, value] of Object.entries(existingMap ?? {})) {
    const text = asNonEmptyString(value);
    if (text !== undefined) merged[locale] = text;
  }

  const catalogEnglish =
    asNonEmptyString(existingMap?.en) ?? asNonEmptyString(englishText);
  if (catalogEnglish !== undefined) merged.en = catalogEnglish;

  return Object.keys(merged).length > 0 ? merged : undefined;
}
