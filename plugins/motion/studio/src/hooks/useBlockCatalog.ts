import { useState, useEffect, useMemo } from "react";
import type { RegistryItem } from "@hyperframes/core/registry";
import {
  BLOCK_CATEGORIES,
  type BlockCategory,
  resolveBlockCategory,
} from "../utils/blockCategories";
import { studioApiFetch } from "../utils/studioApiFetch";

type CatalogItem = RegistryItem & {
  category: BlockCategory;
};

let catalogCache: CatalogItem[] | null = null;
let catalogRequest: Promise<CatalogItem[]> | null = null;

function loadCatalog(): Promise<CatalogItem[]> {
  catalogRequest ??= studioApiFetch("/api/registry/blocks")
    .then((response) => {
      if (!response.ok) throw new Error("Failed to load catalog");
      return response.json() as Promise<RegistryItem[]>;
    })
    .then((items) => {
      catalogCache = items
        .map((item) => ({ ...item, category: resolveBlockCategory(item.tags) }))
        .sort((a, b) => {
          const aIndex = BLOCK_CATEGORIES.findIndex((category) => category.id === a.category);
          const bIndex = BLOCK_CATEGORIES.findIndex((category) => category.id === b.category);
          return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
        });
      return catalogCache;
    })
    .catch((error: unknown) => {
      catalogRequest = null;
      throw error;
    });
  return catalogRequest;
}

export function useBlockCatalog() {
  const [blocks, setBlocks] = useState<CatalogItem[]>(() => catalogCache ?? []);
  const [loading, setLoading] = useState(catalogCache === null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<BlockCategory | null>(null);

  // fallow-ignore-next-line complexity
  useEffect(() => {
    if (catalogCache) return;
    let cancelled = false;
    (async () => {
      try {
        const items = await loadCatalog();
        if (cancelled) return;
        setBlocks(items);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load catalog");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredBlocks = useMemo(() => {
    let result = blocks;
    if (category) {
      result = result.filter((b) => b.category === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q) ||
          b.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [blocks, category, search]);

  return {
    blocks,
    loading,
    error,
    search,
    setSearch,
    category,
    setCategory,
    filteredBlocks,
  };
}
