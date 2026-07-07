// Persisted snapshot of the onboarding "About you" survey: role, org size,
// use case(s), and how they heard about us.
//
// Onboarding collects these in component state that is discarded once the flow
// ends. We persist a tiny copy so any later AMR entry — from the chat error
// card, settings, the model switcher, etc., long after onboarding — can forward
// the visitor's self-reported profile to AMR for paid-conversion segmentation.
// Without this, only a visitor who jumps to AMR during onboarding itself would
// carry a profile.
//
// Values are kept as open strings (mirroring onboarding's own open-string
// options), trimmed and length/count-capped defensively.

const STORAGE_KEY = 'open-design:onboarding-profile:v1';
const MAX_VALUE_LENGTH = 64;
const MAX_USE_CASES = 20;

export interface OnboardingProfile {
  role?: string;
  orgSize?: string;
  useCase?: string[];
  source?: string;
  completedAt?: string;
}

function sanitize(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'unknown') return undefined;
  return trimmed.slice(0, MAX_VALUE_LENGTH);
}

function sanitizeList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .map((entry) => sanitize(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, MAX_USE_CASES);
  return cleaned.length > 0 ? cleaned : undefined;
}

function sanitizeTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp).toISOString();
}

function compact(
  profile: OnboardingProfile,
  options: { defaultCompletedAt?: Date } = {},
): OnboardingProfile | null {
  const role = sanitize(profile.role);
  const orgSize = sanitize(profile.orgSize);
  const useCase = sanitizeList(profile.useCase);
  const source = sanitize(profile.source);
  const completedAt =
    sanitizeTimestamp(profile.completedAt) ??
    options.defaultCompletedAt?.toISOString();
  if (!role && !orgSize && !useCase && !source) return null;
  return {
    ...(role ? { role } : {}),
    ...(orgSize ? { orgSize } : {}),
    ...(useCase ? { useCase } : {}),
    ...(source ? { source } : {}),
    ...(completedAt ? { completedAt } : {}),
  };
}

export function saveOnboardingProfile(
  profile: OnboardingProfile,
  completedAt: Date = new Date(),
): void {
  if (typeof window === 'undefined') return;
  const compacted = compact(profile, { defaultCompletedAt: completedAt });
  if (!compacted) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(compacted));
  } catch {
    // Persistence is best-effort; never block onboarding completion.
  }
}

export function readOnboardingProfile(): OnboardingProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return compact(JSON.parse(raw) as Partial<OnboardingProfile>);
  } catch {
    return null;
  }
}
