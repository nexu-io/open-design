// Transient cross-component intent for the Home composer.
//
// The entry shell keeps every sub-view (home / brands / plugins / …) mounted
// at once and only toggles visibility, so a surface like the Brands tab cannot
// rely on HomeView re-mounting to pick up a one-shot instruction. The router is
// path-only and intentionally carries no transient state, so we use a tiny
// module-level latch plus a DOM event: the producer sets a pending chip id and
// fires the event; HomeView consumes it once, guarded on its plugin catalog
// being loaded so chip dispatch (which resolves a bundled plugin) cannot race
// an empty list.

export const HOME_CHIP_INTENT_EVENT = 'od:home-chip-intent';

/**
 * Which composer an intent is for. There can be two on screen: Home's page
 * composer and a docked one (the community view puts one at its foot), and an
 * untargeted latch would be consumed by whichever happened to run its effect
 * first — the community type tabs would sometimes bind Home's composer and
 * leave the dock's alone. One slot per target, so neither can eat the other's.
 */
export type HomeChipIntentTarget = 'page' | 'dock';

const pendingChipIds: Record<HomeChipIntentTarget, string | null> = {
  page: null,
  dock: null,
};

// Queue a composer chip to auto-select on the next render of the targeted
// composer, then notify any mounted HomeView. Safe to call before HomeView
// exists — the pending id survives until consumed.
export function requestHomeChip(
  chipId: string,
  target: HomeChipIntentTarget = 'page',
): void {
  pendingChipIds[target] = chipId;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(HOME_CHIP_INTENT_EVENT, { detail: { chipId, target } }),
    );
  }
}

// Read and clear the pending chip id for one target. Returns null when nothing
// is queued for it.
export function consumePendingHomeChip(
  target: HomeChipIntentTarget = 'page',
): string | null {
  const chipId = pendingChipIds[target];
  pendingChipIds[target] = null;
  return chipId;
}

// Peek without consuming — lets a consumer bail early (e.g. plugins not yet
// loaded) without dropping the pending intent.
export function hasPendingHomeChip(target: HomeChipIntentTarget = 'page'): boolean {
  return pendingChipIds[target] !== null;
}
