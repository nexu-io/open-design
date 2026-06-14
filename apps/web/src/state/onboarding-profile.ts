// Persisted snapshot of the onboarding "About you" survey (role, org size).
//
// Onboarding collects these in component state that is discarded once the flow
// ends. We persist a tiny copy so any later AMR entry — from the chat error
// card, settings, the model switcher, etc., long after onboarding — can forward
// the visitor's self-reported profile to AMR for paid-conversion segmentation.
// Without this, only a visitor who jumps to AMR during onboarding itself would
// carry a profile.
//
// Values are kept as open strings (mirroring onboarding's own open-string
// options), trimmed and length-capped defensively.

const STORAGE_KEY = 'open-design:onboarding-profile:v1';
const MAX_VALUE_LENGTH = 64;

export interface OnboardingProfile {
  role?: string;
  orgSize?: string;
}

function sanitize(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'unknown') return undefined;
  return trimmed.slice(0, MAX_VALUE_LENGTH);
}

export function saveOnboardingProfile(profile: OnboardingProfile): void {
  if (typeof window === 'undefined') return;
  const role = sanitize(profile.role);
  const orgSize = sanitize(profile.orgSize);
  if (!role && !orgSize) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...(role ? { role } : {}), ...(orgSize ? { orgSize } : {}) }),
    );
  } catch {
    // Persistence is best-effort; never block onboarding completion.
  }
}

export function readOnboardingProfile(): OnboardingProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingProfile>;
    const role = sanitize(parsed.role);
    const orgSize = sanitize(parsed.orgSize);
    if (!role && !orgSize) return null;
    return { ...(role ? { role } : {}), ...(orgSize ? { orgSize } : {}) };
  } catch {
    return null;
  }
}
