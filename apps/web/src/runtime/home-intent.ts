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

let pendingChipId: string | null = null;
let pendingNotice: string | null = null;

export interface HomeChipOptions {
  /** A one-shot confirmation banner HomeView shows once it consumes the chip —
   *  e.g. "Using Ramp Brand Kit" after "Use in new chat". Makes an otherwise
   *  invisible navigate+apply visibly verifiable to the user. */
  notice?: string;
}

// Queue a Home composer chip to auto-select on the next Home render, then
// notify any mounted HomeView. Safe to call before HomeView exists — the
// pending id (and optional confirmation notice) survives until consumed.
export function requestHomeChip(chipId: string, options?: HomeChipOptions): void {
  pendingChipId = chipId;
  pendingNotice = options?.notice ?? null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(HOME_CHIP_INTENT_EVENT, { detail: { chipId } }));
  }
}

// Read and clear the pending chip id. Returns null when nothing is queued.
export function consumePendingHomeChip(): string | null {
  const chipId = pendingChipId;
  pendingChipId = null;
  return chipId;
}

// Read and clear the pending confirmation notice queued alongside the chip.
// Returns null when none is queued. Consume AFTER consumePendingHomeChip.
export function consumePendingHomeNotice(): string | null {
  const notice = pendingNotice;
  pendingNotice = null;
  return notice;
}

// Peek without consuming — lets a consumer bail early (e.g. plugins not yet
// loaded) without dropping the pending intent.
export function hasPendingHomeChip(): boolean {
  return pendingChipId !== null;
}
