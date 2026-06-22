// Brand lookup shared by every design-system picker.
//
// A finalized brand registers a `user:<id>` design system (BrandMeta
// .designSystemId), so the pickers — which list `DesignSystemSummary` — can
// upgrade their thin preview to the rich Brand Kit card whenever the selected
// system is actually a brand. This module owns the `/api/brands` fetch and the
// `designSystemId -> BrandSummary` lookup so the wiring stays out of the
// design-system registry provider (whose module is mocked wholesale by some
// picker tests).

import { useEffect, useState } from 'react';
import type { BrandSummary } from '@open-design/contracts';

export async function fetchBrands(): Promise<BrandSummary[]> {
  try {
    const resp = await fetch('/api/brands', { cache: 'no-store' });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { brands?: BrandSummary[] };
    return Array.isArray(data?.brands) ? data.brands : [];
  } catch {
    return [];
  }
}

export type BrandsByDesignSystemId = Map<string, BrandSummary>;

// Index brands by the `user:<id>` design system each one registered. Only
// brands with a resolved kit (`brand` is non-null) are indexed, so the picker
// never tries to render a rich card for a still-extracting / failed brand and
// instead keeps its thin design-system preview.
export function buildBrandsByDesignSystemId(brands: BrandSummary[]): BrandsByDesignSystemId {
  const map: BrandsByDesignSystemId = new Map();
  for (const summary of brands) {
    const designSystemId = summary.meta.designSystemId;
    if (designSystemId && summary.brand) map.set(designSystemId, summary);
  }
  return map;
}

// Fetch brands once and expose a `designSystemId -> BrandSummary` lookup so any
// design-system picker can swap its preview pane for the rich brand card when
// the selected system is a finalized brand. Best-effort: a failed or absent
// fetch resolves to an empty map and the caller falls back to its thin preview.
// `enabled` lets a closed popover skip the request until it first opens.
export function useBrandsByDesignSystemId(enabled = true): BrandsByDesignSystemId {
  const [map, setMap] = useState<BrandsByDesignSystemId>(() => new Map());

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    void fetchBrands().then((brands) => {
      if (cancelled) return;
      setMap(buildBrandsByDesignSystemId(brands));
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return map;
}
