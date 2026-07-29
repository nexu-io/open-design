import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  consumeOnboardingEntryForProject,
  hasCompletedFirstOnboardingGeneration,
  hasSentFirstOnboardingPrompt,
  markFirstOnboardingGenerationCompleted,
  markFirstOnboardingPromptSent,
  stashOnboardingEntryForProject,
} from '../src/onboarding/onboarding-entry';

function createStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}

// The helper keeps a module-level parsed-entry cache (StrictMode safety), so
// tests use a unique project id each to stay independent of one another.
let seq = 0;
function nextProjectId(): string {
  seq += 1;
  return `proj-${seq}`;
}

describe('onboarding entry (id-keyed session hand-off)', () => {
  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = {
      sessionStorage: createStorageStub(),
    };
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('round-trips a stashed entry for its project id', () => {
    const id = nextProjectId();
    stashOnboardingEntryForProject(id, {
      source: 'home_recommendation',
      productType: 'product_ui',
      recommendationId: 'product_ui_prototype',
    });
    expect(consumeOnboardingEntryForProject(id)).toEqual({
      source: 'home_recommendation',
      productType: 'product_ui',
      recommendationId: 'product_ui_prototype',
    });
  });

  // Reopen-before-send regression (PR #5111 review): the seed prompt is cached
  // WITH the entry, so a later remount of the same project (project.pendingPrompt
  // already wiped) keeps the original comparison base for has_prefilled_prompt.
  it('carries the seed prompt across a remount (reopen-before-send)', () => {
    const id = nextProjectId();
    stashOnboardingEntryForProject(id, {
      source: 'home_recommendation',
      productType: 'product_ui',
      recommendationId: 'product_ui_prototype',
      seedPrompt: 'Design a pricing page',
    });
    // First mount consumes and caches.
    expect(consumeOnboardingEntryForProject(id)).toMatchObject({
      seedPrompt: 'Design a pricing page',
    });
    // Reopen (remount): the seed is still present from the cache even though the
    // sessionStorage slot (and project.pendingPrompt) are gone.
    expect(consumeOnboardingEntryForProject(id)).toMatchObject({
      seedPrompt: 'Design a pricing page',
    });
  });

  it('carries the survey answers when present', () => {
    const id = nextProjectId();
    stashOnboardingEntryForProject(id, {
      source: 'home_recommendation',
      productType: 'marketing',
      recommendationId: 'marketing_landing',
      role: 'growth',
      useCases: ['landing', 'ads'],
    });
    expect(consumeOnboardingEntryForProject(id)).toEqual({
      source: 'home_recommendation',
      productType: 'marketing',
      recommendationId: 'marketing_landing',
      role: 'growth',
      useCases: ['landing', 'ads'],
    });
  });

  // StrictMode regression (PR #5111 review): the consume is a destructive read
  // called from ProjectView render. Under React StrictMode the throwaway first
  // mount consumes the slot; the committed remount must still see the entry.
  // The module cache serves the same value on the second consume even though
  // the sessionStorage slot was already removed by the first.
  it('survives a StrictMode double-consume for the same project id', () => {
    const id = nextProjectId();
    stashOnboardingEntryForProject(id, {
      source: 'home_recommendation',
      productType: 'product_ui',
      recommendationId: 'product_ui_prototype',
    });
    // First (throwaway) mount consumes and clears the storage slot.
    const first = consumeOnboardingEntryForProject(id);
    expect(first).toMatchObject({ recommendationId: 'product_ui_prototype' });
    // The storage slot is gone...
    expect(window.sessionStorage.getItem(`open-design:onboarding-entry:${id}`)).toBeNull();
    // ...but the committed remount still gets the entry from the cache.
    expect(consumeOnboardingEntryForProject(id)).toEqual(first);
  });

  it('returns null when nothing was stashed for that id', () => {
    expect(consumeOnboardingEntryForProject(nextProjectId())).toBeNull();
  });

  // The race the id-keyed slot fixes (PR #5111 review): clicking "进入 Studio"
  // and then opening an UNRELATED project before the recommended one finished
  // creating must not let that unrelated project steal the personalized context.
  // The entry is keyed by the created project id, so a concurrent mount for a
  // different id consumes nothing, and the intended project still gets it.
  it('is isolated per project id — a concurrent unrelated project cannot steal it', () => {
    const recommended = nextProjectId();
    const other = nextProjectId();
    stashOnboardingEntryForProject(recommended, {
      source: 'home_recommendation',
      productType: 'product_ui',
      recommendationId: 'product_ui_prototype',
    });
    // An unrelated project mounts first (mid-create navigation) and reads its
    // own key — nothing there.
    expect(consumeOnboardingEntryForProject(other)).toBeNull();
    // The recommendation-started project still finds its context intact.
    expect(consumeOnboardingEntryForProject(recommended)).toMatchObject({
      source: 'home_recommendation',
      recommendationId: 'product_ui_prototype',
    });
  });

  it('ignores a malformed stored value', () => {
    const id = nextProjectId();
    window.sessionStorage.setItem(
      `open-design:onboarding-entry:${id}`,
      '{"source":"nope"}',
    );
    expect(consumeOnboardingEntryForProject(id)).toBeNull();
  });

  it('treats a missing project id as a no-op', () => {
    expect(() =>
      stashOnboardingEntryForProject('', {
        source: 'home_recommendation',
        productType: 'general',
        recommendationId: 'general_menu',
      }),
    ).not.toThrow();
    expect(consumeOnboardingEntryForProject('')).toBeNull();
  });
});

// The two onboarding funnel events must fire once per recommendation-started
// project. ProjectView remounts on every leave/reopen and the entry survives
// via the cache, so mount-local guards would let them re-fire on a later
// conversation/run. These project-scoped flags (PR #5111 review) hold across
// those remounts.
describe('onboarding funnel once-per-project guards', () => {
  it('first-prompt-sent guard stays set across ProjectView remounts', () => {
    const id = nextProjectId();
    expect(hasSentFirstOnboardingPrompt(id)).toBe(false);
    // First conversation's first send.
    markFirstOnboardingPromptSent(id);
    expect(hasSentFirstOnboardingPrompt(id)).toBe(true);
    // A later remount (fresh conversation on the same project) still sees the
    // guard set, so the send-through event does not re-fire.
    expect(hasSentFirstOnboardingPrompt(id)).toBe(true);
  });

  it('first-generation-completed guard stays set across ProjectView remounts', () => {
    const id = nextProjectId();
    expect(hasCompletedFirstOnboardingGeneration(id)).toBe(false);
    markFirstOnboardingGenerationCompleted(id);
    expect(hasCompletedFirstOnboardingGeneration(id)).toBe(true);
    // A later HTML-producing run on a remounted project stays suppressed.
    expect(hasCompletedFirstOnboardingGeneration(id)).toBe(true);
  });

  it('guards are isolated per project id', () => {
    const a = nextProjectId();
    const b = nextProjectId();
    markFirstOnboardingPromptSent(a);
    markFirstOnboardingGenerationCompleted(a);
    expect(hasSentFirstOnboardingPrompt(b)).toBe(false);
    expect(hasCompletedFirstOnboardingGeneration(b)).toBe(false);
  });

  it('treats a missing project id as never-marked', () => {
    expect(hasSentFirstOnboardingPrompt('')).toBe(false);
    markFirstOnboardingPromptSent('');
    expect(hasSentFirstOnboardingPrompt('')).toBe(false);
  });
});
