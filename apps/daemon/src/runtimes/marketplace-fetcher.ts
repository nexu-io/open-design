export interface MarketplaceFetchResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

interface MarketplaceNetworkResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

export type MarketplaceFetchImpl = (
  input: string,
  init?: RequestInit,
) => Promise<MarketplaceNetworkResponse>;

export type MarketplaceFetcher = (url: string) => Promise<MarketplaceFetchResponse>;

export interface MarketplaceFetcherDependencies {
  registryIdFromUrl: (url: string) => string | null;
  readSeedManifest: (registryId: string) => Promise<string | null>;
  fetchImpl?: MarketplaceFetchImpl | undefined;
}

export function createMarketplaceFetcher(
  seedId: string | null,
  dependencies: MarketplaceFetcherDependencies,
): MarketplaceFetcher {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  return async (url) => {
    const registryId = dependencies.registryIdFromUrl(url);
    if (registryId && (!seedId || registryId === seedId)) {
      const manifestText = await dependencies.readSeedManifest(registryId);
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
