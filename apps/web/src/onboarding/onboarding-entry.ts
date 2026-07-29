// Session-only carrier for the onboarding entry that started a project.
//
// The Home recommendation knows the entry context (which product path, which
// starter) but the funnel events that measure whether the user followed through
// — first prompt sent, first generation completed — fire later, in Studio,
// where that context isn't otherwise available. Rather than persist role /
// use-case / product_type to the project (the onboarding spec §9.2 forbids
// 落库), we hand the context across the Home→Studio navigation through
// sessionStorage.
//
// The slot is keyed by the CREATED project id, not a single global slot. The id
// is only known after the create request succeeds, so the stash happens in the
// create success path (`App.handleCreateProject`) once the target project is
// known, and the next Studio to mount for THAT project consumes it (read-once).
// Keying by id removes the race the single global slot had: clicking "进入
// Studio" and then opening an unrelated project before the recommended one
// finished creating could let the unrelated project steal the personalized
// context. It is intentionally lost on refresh — the first-prompt /
// first-generation moment happens in the same session immediately after the
// click.

import type { ProductType } from './recommendation';

export interface OnboardingEntry {
  source: 'home_recommendation';
  productType: ProductType;
  recommendationId: string;
  // Survey answers that produced the recommendation, echoed on the
  // `onboarding_prompt_prefilled` funnel event (spec §11.1). Analysis-only —
  // they live in this session slot, never in project data.
  role?: string;
  useCases?: string[];
  // The prompt the recommendation prefilled into the Studio composer, captured
  // at create time. Cached WITH the entry so it survives ProjectView remounts:
  // `project.pendingPrompt` is wiped by `onClearPendingPrompt()` on the first
  // mount, so a reopen-before-send would otherwise lose the comparison base and
  // report `has_prefilled_prompt=false` even when the user sends the original
  // recommended draft unchanged (spec §7.4 / §8.2).
  seedPrompt?: string;
}

const KEY_PREFIX = 'open-design:onboarding-entry:';

function keyForProject(projectId: string): string {
  return `${KEY_PREFIX}${projectId}`;
}

// StrictMode safety: `consumeOnboardingEntryForProject` is a destructive read
// (it removes the sessionStorage slot). Under React StrictMode the throwaway
// first mount would consume the slot and the committed remount would then see
// `null`, silently dropping every recommendation-only behavior in dev (funnel
// attribution, path-scoped starter cards, first-artifact hint). We cache the
// first successfully parsed entry per project id in this module so repeated
// consumes for the SAME id (both mount passes, or any later remount in the same
// session) return the same value, while the sessionStorage slot is still
// cleared on the first read so it never leaks to an unrelated project. The
// cache only holds real entries — a project with no handoff never populates it,
// so it stays bounded to the handful of recommendation-started projects a
// session actually creates.
const parsedEntryCache = new Map<string, OnboardingEntry>();

// Once-per-project funnel guards, kept beside the entry cache so they share its
// exact lifetime. The two onboarding funnel events (`onboarding_first_prompt_sent`,
// `onboarding_first_generation_completed`) are meant to fire once per
// recommendation-started project, but ProjectView remounts whenever the user
// leaves and reopens a project, resetting mount-local refs while the entry keeps
// coming back from `parsedEntryCache`. Project-scoped module flags make the
// once-only guard survive those remounts. A page refresh clears both the entry
// cache and these flags together, but that also clears the (consumed)
// sessionStorage slot, so the entry itself is gone and the events can't fire
// anyway — the guards only need to hold within a session.
const firstPromptSentProjects = new Set<string>();
const firstGenerationCompletedProjects = new Set<string>();

export function hasSentFirstOnboardingPrompt(projectId: string): boolean {
  return Boolean(projectId) && firstPromptSentProjects.has(projectId);
}

export function markFirstOnboardingPromptSent(projectId: string): void {
  if (projectId) firstPromptSentProjects.add(projectId);
}

export function hasCompletedFirstOnboardingGeneration(projectId: string): boolean {
  return Boolean(projectId) && firstGenerationCompletedProjects.has(projectId);
}

export function markFirstOnboardingGenerationCompleted(projectId: string): void {
  if (projectId) firstGenerationCompletedProjects.add(projectId);
}

// Stash the entry for a specific created project. Called from the create
// success path, where the project id is finally known — never before, so an
// unrelated project mount cannot consume it.
export function stashOnboardingEntryForProject(
  projectId: string,
  entry: OnboardingEntry,
): void {
  if (!projectId) return;
  try {
    window.sessionStorage.setItem(keyForProject(projectId), JSON.stringify(entry));
  } catch {
    // Storage-denied contexts just lose the funnel attribution — never throw.
  }
}

// Read and remove the entry for a specific project. Returns null when none is
// set (the common case: any project not started from a recommendation, or a
// concurrent project whose own key was never written).
export function consumeOnboardingEntryForProject(
  projectId: string,
): OnboardingEntry | null {
  if (!projectId) return null;
  // StrictMode-safe: a value read once (and removed from storage) is served
  // from the module cache on every later consume for the same id, so the
  // throwaway StrictMode mount can't strand the committed remount with `null`.
  const cached = parsedEntryCache.get(projectId);
  if (cached) return cached;
  const key = keyForProject(projectId);
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    window.sessionStorage.removeItem(key);
    const parsed = JSON.parse(raw) as Partial<OnboardingEntry>;
    if (
      parsed &&
      parsed.source === 'home_recommendation' &&
      typeof parsed.productType === 'string' &&
      typeof parsed.recommendationId === 'string'
    ) {
      const entry: OnboardingEntry = {
        source: 'home_recommendation',
        productType: parsed.productType,
        recommendationId: parsed.recommendationId,
        ...(typeof parsed.role === 'string' && parsed.role ? { role: parsed.role } : {}),
        ...(Array.isArray(parsed.useCases) &&
        parsed.useCases.every((u) => typeof u === 'string')
          ? { useCases: parsed.useCases }
          : {}),
        ...(typeof parsed.seedPrompt === 'string' ? { seedPrompt: parsed.seedPrompt } : {}),
      };
      parsedEntryCache.set(projectId, entry);
      return entry;
    }
    return null;
  } catch {
    return null;
  }
}
