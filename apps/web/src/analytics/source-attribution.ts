import type { AmrEntryAttribution } from '@open-design/contracts/analytics';
import {
  readOnboardingProfile,
  type OnboardingProfile,
} from '../state/onboarding-profile';
import { readAmrAttribution } from './amr-attribution';
import { setAnalyticsPersonProperties } from './client';

const ATTRIBUTION_COOKIE = 'od_attr';

interface LandingAttributionCookie {
  s?: unknown;
  m?: unknown;
  c?: unknown;
  ct?: unknown;
  tm?: unknown;
  ref?: unknown;
  lp?: unknown;
  t?: unknown;
}

export function setOnboardingAttributionPersonProperties(
  profile: OnboardingProfile,
  now: Date = new Date(),
): void {
  const props = onboardingPersonProperties(profile, now);
  if (props) setAnalyticsPersonProperties(props);
}

export function bindSignedInUserAttributionPersonProperties(
  userId: string | null | undefined,
  now: Date = new Date(),
): void {
  const cleanUserId = cleanValue(userId);
  if (!cleanUserId) return;
  const profile = readOnboardingProfile();
  const amrAttribution = readAmrAttribution(now);
  const landingAttribution = readLandingAttributionCookie();
  const profileProps = profile ? onboardingPersonProperties(profile, now) : null;
  const landingProps = landingAttribution
    ? landingAttributionPersonProperties(landingAttribution)
    : null;
  const source = sourceResolution(landingAttribution, profile);
  setAnalyticsPersonProperties({
    od_app_user_id: cleanUserId,
    od_source_bound_at: now.toISOString(),
    ...(profileProps ?? {}),
    ...(landingProps ?? {}),
    ...(amrAttribution ? amrEntryPersonProperties(amrAttribution) : {}),
    ...(source
      ? {
          od_source_resolved: source.value,
          od_source_resolution: source.kind,
        }
      : { od_source_resolution: 'unknown' }),
  });
}

function onboardingPersonProperties(
  profile: OnboardingProfile,
  now: Date,
): Record<string, unknown> | null {
  const role = cleanValue(profile.role);
  const orgSize = cleanValue(profile.orgSize);
  const useCases = cleanList(profile.useCase);
  const source = cleanValue(profile.source);
  // The raw "Other" free-text is deliberately NOT surfaced as a person
  // property: analytics profile state must stay free-text/PII-free, and the
  // scrubber does not sanitize person-property payloads. Only the enumerated
  // bucket is bound; the typed detail lives solely in the app-owned Memory note.
  if (!role && !orgSize && useCases.length === 0 && !source) return null;
  return {
    ...(role ? { od_role: role } : {}),
    ...(orgSize ? { od_org_size: orgSize } : {}),
    ...(useCases.length > 0 ? { od_use_cases: useCases } : {}),
    ...(source
      ? {
          od_onboarding_source: source,
          od_source_resolved: source,
          od_source_resolution: 'onboarding',
        }
      : {}),
    od_onboarding_at: onboardingCompletedAt(profile, now),
  };
}

function onboardingCompletedAt(profile: OnboardingProfile, fallback: Date): string {
  if (profile.completedAt) {
    const completedAt = Date.parse(profile.completedAt);
    if (Number.isFinite(completedAt)) return new Date(completedAt).toISOString();
  }
  return fallback.toISOString();
}

function amrEntryPersonProperties(
  attribution: AmrEntryAttribution,
): Record<string, unknown> {
  return {
    od_amr_entry_id: attribution.entryId,
    od_amr_entry_source: attribution.sourceDetail,
    od_amr_entry_at: attribution.occurredAt,
  };
}

function landingAttributionPersonProperties(
  attribution: LandingAttributionCookie,
): Record<string, unknown> | null {
  const utmSource = cleanValue(attribution.s);
  const utmMedium = cleanValue(attribution.m);
  const utmCampaign = cleanValue(attribution.c);
  const utmContent = cleanValue(attribution.ct);
  const utmTerm = cleanValue(attribution.tm);
  const referrer = cleanValue(attribution.ref);
  const landingPath = cleanValue(attribution.lp);
  const firstTouchAt = firstTouchTime(attribution.t);
  if (
    !utmSource &&
    !utmMedium &&
    !utmCampaign &&
    !utmContent &&
    !utmTerm &&
    !referrer &&
    !landingPath &&
    !firstTouchAt
  ) {
    return null;
  }
  return {
    ...(utmSource ? { od_utm_source: utmSource } : {}),
    ...(utmMedium ? { od_utm_medium: utmMedium } : {}),
    ...(utmCampaign ? { od_utm_campaign: utmCampaign } : {}),
    ...(utmContent ? { od_utm_content: utmContent } : {}),
    ...(utmTerm ? { od_utm_term: utmTerm } : {}),
    ...(referrer ? { od_referrer: referrer } : {}),
    ...(landingPath ? { od_landing_path: landingPath } : {}),
    ...(firstTouchAt ? { od_utm_first_touch_at: firstTouchAt } : {}),
  };
}

function sourceResolution(
  attribution: LandingAttributionCookie | null,
  profile: OnboardingProfile | null,
): { kind: 'utm' | 'referrer' | 'onboarding'; value: string } | null {
  const utmSource = cleanValue(attribution?.s);
  if (utmSource) return { kind: 'utm', value: utmSource };
  const referrer = cleanValue(attribution?.ref);
  if (referrer) return { kind: 'referrer', value: referrer };
  const source = cleanValue(profile?.source);
  return source ? { kind: 'onboarding', value: source } : null;
}

function readLandingAttributionCookie(): LandingAttributionCookie | null {
  if (typeof document === 'undefined') return null;
  const encoded = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ATTRIBUTION_COOKIE}=`))
    ?.slice(ATTRIBUTION_COOKIE.length + 1);
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(encoded)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as LandingAttributionCookie;
  } catch {
    return null;
  }
}

function firstTouchTime(value: unknown): string | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const timestamp =
    typeof value === 'number' ? value : Number.parseFloat(value.trim());
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function cleanValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'unknown') return null;
  return trimmed;
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(cleanValue)
    .filter((entry): entry is string => Boolean(entry));
}
