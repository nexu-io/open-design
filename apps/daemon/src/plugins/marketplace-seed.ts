import fs from 'node:fs';
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
      const response = await fetchImpl(url, { redirect: 'follow' });
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
    const parsed = JSON.parse(manifestText) as { metadata?: unknown; plugins?: unknown };
    const plugins = Array.isArray(parsed.plugins) ? parsed.plugins : [];
    const seen = new Set(plugins.map((entry) => String(asRecord(entry)?.name ?? '').toLowerCase()));
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
      plugins: [...plugins, ...generated],
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
