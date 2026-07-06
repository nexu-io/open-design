import type { AmrEntryAttribution } from '@open-design/contracts/analytics';
import {
  readOnboardingProfile,
  type OnboardingProfile,
} from '../state/onboarding-profile';
import { readAmrAttribution } from './amr-attribution';
import { setAnalyticsPersonProperties } from './client';

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
  const profileProps = profile ? onboardingPersonProperties(profile, now) : null;
  const source = sourceResolution(profile);
  setAnalyticsPersonProperties({
    od_app_user_id: cleanUserId,
    od_source_bound_at: now.toISOString(),
    ...(source
      ? {
          od_source_resolved: source.value,
          od_source_resolution: source.kind,
        }
      : { od_source_resolution: 'unknown' }),
    ...(profileProps ?? {}),
    ...(amrAttribution ? amrEntryPersonProperties(amrAttribution) : {}),
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

function sourceResolution(
  profile: OnboardingProfile | null,
): { kind: 'onboarding'; value: string } | null {
  const source = cleanValue(profile?.source);
  return source ? { kind: 'onboarding', value: source } : null;
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
