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
import type {
  BrandExtractFromHtmlRequest,
  BrandFinalizeResponse,
  BrandSummary,
} from '@open-design/contracts';

// One-shot cross-route handoff: the design-system id a navigation wants the
// Design systems tab to preselect when it mounts. ProjectView's "design system
// ready" prompt sets this right before navigating home; `DesignSystemsTab` reads
// and clears it once. We piggyback on sessionStorage (the same pattern the brand
// create flow uses for `od:auto-send-first:*`) because `/design-systems/:id` is
// already the *detail* route, so the preselection can't ride on the URL path.
export const DESIGN_SYSTEM_FOCUS_KEY = 'od:focus-design-system';

/** Record the design system the next Design-systems tab mount should preselect.
 *  Best-effort: private-mode / SSR storage failures are swallowed (the tab just
 *  falls back to its default selection). */
export function setDesignSystemFocus(id: string): void {
  try {
    window.sessionStorage.setItem(DESIGN_SYSTEM_FOCUS_KEY, id);
  } catch {
    // sessionStorage unavailable — the tab opens on its default selection.
  }
}

/** Read and clear the one-shot Design-systems focus handoff. Returns null when
 *  nothing is pending or storage is unavailable. */
export function takeDesignSystemFocus(): string | null {
  try {
    const id = window.sessionStorage.getItem(DESIGN_SYSTEM_FOCUS_KEY);
    if (id) window.sessionStorage.removeItem(DESIGN_SYSTEM_FOCUS_KEY);
    return id || null;
  } catch {
    return null;
  }
}

export type ExtractBrandFromHtmlOutcome =
  | { ok: true; result: BrandFinalizeResponse }
  | { ok: false; error: string };

export async function finalizeBrandProject(
  brandId: string,
  projectId: string,
): Promise<ExtractBrandFromHtmlOutcome> {
  try {
    const resp = await fetch(`/api/brands/${encodeURIComponent(brandId)}/finalize`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    if (!resp.ok) {
      let error = `Brand finalize failed (${resp.status})`;
      try {
        const data = (await resp.json()) as { error?: string };
        if (data?.error) error = data.error;
      } catch {
        // Non-JSON error body — keep the status-based message.
      }
      return { ok: false, error };
    }
    const result = (await resp.json()) as BrandFinalizeResponse;
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not reach the daemon',
    };
  }
}

/** POST the DOM the web read out of the unblocked in-app browser tab so the
 *  daemon re-runs extraction against it (no fresh fetch). Resolves with the
 *  finalized brand on success, or a failure reason the assist card can show. */
export async function extractBrandFromHtml(
  brandId: string,
  body: BrandExtractFromHtmlRequest,
): Promise<ExtractBrandFromHtmlOutcome> {
  try {
    const resp = await fetch(`/api/brands/${encodeURIComponent(brandId)}/extract-from-html`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      let error = `Extraction failed (${resp.status})`;
      try {
        const data = (await resp.json()) as { error?: string };
        if (data?.error) error = data.error;
      } catch {
        // Non-JSON error body — keep the status-based message.
      }
      return { ok: false, error };
    }
    const result = (await resp.json()) as BrandFinalizeResponse;
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not reach the daemon',
    };
  }
}

export type CancelBrandExtractionOutcome =
  | { ok: true; status?: string }
  | { ok: false; error: string };

export async function cancelBrandExtraction(
  brandId: string,
): Promise<CancelBrandExtractionOutcome> {
  try {
    const resp = await fetch(`/api/brands/${encodeURIComponent(brandId)}/cancel-extraction`, {
      method: 'POST',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) {
      let error = `Extraction stop failed (${resp.status})`;
      try {
        const data = (await resp.json()) as { error?: string };
        if (data?.error) error = data.error;
      } catch {
        // Non-JSON error body — keep the status-based message.
      }
      return { ok: false, error };
    }
    const result = (await resp.json()) as { status?: string };
    return { ok: true, status: result.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not reach the daemon',
    };
  }
}

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
