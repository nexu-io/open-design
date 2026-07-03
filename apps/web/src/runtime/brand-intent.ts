// Transient cross-component intent for the Brand Kit tab.
//
// The entry shell keeps every sub-view (home / brands / plugins / …) mounted
// at once and only toggles visibility, so a surface like the Home chip rail
// cannot rely on BrandsTab re-mounting to pick up a one-shot instruction. The
// router is path-only and intentionally carries no transient state, so we use a
// tiny module-level latch plus a DOM event — the same pattern as
// `home-intent.ts`: the producer (the "Create Brand Kit" home chip) sets a
// pending flag and fires the event; the mounted BrandsTab opens its New Brand
// Kit modal in response, and a fresh mount drains the latch as a fallback.

export const NEW_BRAND_KIT_INTENT_EVENT = 'od:new-brand-kit-intent';

let pending = false;

// Queue the New Brand Kit modal to open on the next Brands tab render, then
// notify any mounted BrandsTab. Safe to call before BrandsTab exists — the
// pending flag survives until consumed.
export function requestNewBrandKit(): void {
  pending = true;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NEW_BRAND_KIT_INTENT_EVENT));
  }
}

// Read and clear the pending flag. Returns false when nothing is queued.
export function consumePendingNewBrandKit(): boolean {
  const wasPending = pending;
  pending = false;
  return wasPending;
}

// Peek without consuming.
export function hasPendingNewBrandKit(): boolean {
  return pending;
}
