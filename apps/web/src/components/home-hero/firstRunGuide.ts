// First-run Home guidance cascade.
//
// A brand-new user (no projects yet) gets a three-beat trail of sheen
// pulses pointing at the happy path: the Prototype type chip → the first
// example-prompt card → the Send button (the send pulse ships separately
// and fires on every pick). Each beat advances a persisted stage so the
// trail plays at most once per install:
//
//   'chip' (fresh) → user picks a type chip → 'card' → first preset card
//   pulses once → 'done'
//
// Users who already have projects never see the trail — the stage is
// silently completed for them.

export type HomeGuideStage = 'chip' | 'card' | 'done';

const STORAGE_KEY = 'open-design:home-first-run-guide';

export function readHomeGuideStage(): HomeGuideStage {
  if (typeof window === 'undefined') return 'done';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'card' || raw === 'done') return raw;
    return 'chip';
  } catch {
    return 'done';
  }
}

export function writeHomeGuideStage(stage: HomeGuideStage): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, stage);
  } catch {
    // Private-mode storage failures just skip the guide.
  }
}
