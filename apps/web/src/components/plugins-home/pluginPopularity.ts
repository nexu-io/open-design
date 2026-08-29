// Read side of the generated template gallery data (OPEND-449).
//
// `pluginPopularity.generated.ts` is a data snapshot refreshed weekly by the
// in-repo workflow; this module is the hand-written ordering logic the gallery
// sort sites import so they stay small and testable.

import { PLUGIN_POPULARITY, PLUGIN_NO_PREVIEW } from './pluginPopularity.generated';

export { PLUGIN_POPULARITY_META, PLUGIN_NO_PREVIEW } from './pluginPopularity.generated';

// Curator force-front allowlist — ids here ALWAYS lead their facet in the listed
// order, regardless of usage (the cold-start valve for freshly launched or
// strategically promoted templates). Empty by default; keep it short.
export const ALWAYS_PINNED: readonly string[] = [];
const ALWAYS_PINNED_INDEX = new Map(ALWAYS_PINNED.map((id, i) => [id, i]));

// Manually sunk templates — dropped to the bottom of their facet (and the All
// view). Two reasons live here:
//   • generic default mode-seeds (Web Prototype, Simple Deck) — the plain blank
//     for a mode; they top usage only because they are the default, so in the
//     curated showcase they read as filler.
//   • tiles whose preview renders but reads as broken/ugly (so the auto
//     no-preview check misses them).
// Edit this list to add/remove.
export const ALWAYS_LAST: readonly string[] = [
  'example-web-prototype',
  'example-simple-deck',
  'example-trading-analysis-dashboard-template',
];

// Everything pushed to the bottom of the gallery: the plain default seeds plus
// the no-preview mode-seeds (kept visible so facet counts match production, just
// ordered last). These never lead a facet.
const SINK = new Set<string>([...ALWAYS_LAST, ...PLUGIN_NO_PREVIEW]);

export function isSunkToBottom(id: string): boolean {
  return SINK.has(id);
}

// When true, blended usage popularity orders the NON-prototype facets (Slides,
// Image, Video, …). The Prototype facet keeps its curated/editorial order — the
// caller passes `curationGoverned = true` for prototype tiles, so popularity is
// skipped there. Flip to false to disable usage ordering everywhere.
export const POPULARITY_LEADS_CURATION = true;

// Blended popularity in [0, 1] for a plugin id, or null when the template has no
// score (retired, or below the min-sample threshold).
export function pluginPopularityScore(id: string): number | null {
  const value = PLUGIN_POPULARITY[id];
  return typeof value === 'number' ? value : null;
}

// Gallery-order fragment shared by both sort sites. Returns a negative/positive
// number when it decides the order, or 0 to defer to the caller's downstream
// keys (curated priority, featured rank, visual score, title):
//   1. ALWAYS_PINNED force-front, in listed order.
//   2. SINK (default seeds + no-preview) to the very bottom.
//   3. Blended usage popularity — but only for tiles NOT governed by curation.
//      Prototype tiles are curation-governed, so popularity is skipped and they
//      fall through to the curated/visual order (the editorial showcase).
export function comparePluginGalleryOrder(
  aId: string,
  bId: string,
  aCurationGoverned: boolean,
  bCurationGoverned: boolean,
): number {
  const aPin = ALWAYS_PINNED_INDEX.get(aId);
  const bPin = ALWAYS_PINNED_INDEX.get(bId);
  if (aPin !== undefined || bPin !== undefined) {
    if (aPin !== undefined && bPin === undefined) return -1;
    if (aPin === undefined && bPin !== undefined) return 1;
    if (aPin !== bPin) return (aPin ?? 0) - (bPin ?? 0);
  }

  const aSunk = isSunkToBottom(aId);
  const bSunk = isSunkToBottom(bId);
  if (aSunk !== bSunk) return aSunk ? 1 : -1;
  if (aSunk && bSunk) return 0;

  if (POPULARITY_LEADS_CURATION) {
    const a = aCurationGoverned ? null : pluginPopularityScore(aId);
    const b = bCurationGoverned ? null : pluginPopularityScore(bId);
    if (a !== null || b !== null) {
      if (a !== null && b === null) return -1;
      if (a === null && b !== null) return 1;
      if (a !== b) return (b ?? 0) - (a ?? 0);
    }
  }
  return 0;
}
