// One-time "your first design is ready" hint (onboarding spec §8.3).
//
// A new user's first generation drops them into Studio with a produced
// artifact and no idea that it's viewable / editable / exportable. This module
// tracks whether the single lightweight first-artifact hint has already been
// shown, so it appears at most once — ever — per browser.
//
// Deliberately localStorage (persists across sessions), unlike the Home
// recommendation which is memory-only: the first-artifact moment happens once
// in a user's lifetime, and re-showing it on a later project would be noise.
// The hint is gated at the call site to the first generation loop; this module
// only owns the "seen" bit. Storage-denied contexts degrade to "not seen"
// (the hint may show once and then silently fail to persist — acceptable).

const STORAGE_KEY = 'open-design:seen-first-artifact-hint';

export function hasSeenFirstArtifactHint(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markFirstArtifactHintSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Ignore storage-denied contexts (private mode / disabled storage).
  }
}
