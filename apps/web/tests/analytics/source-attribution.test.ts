// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordAmrEntry } from '../../src/analytics/amr-attribution';
import { saveOnboardingProfile } from '../../src/state/onboarding-profile';

vi.mock('../../src/analytics/client', () => ({
  setAnalyticsPersonProperties: vi.fn(),
}));

import { setAnalyticsPersonProperties } from '../../src/analytics/client';
import {
  bindSignedInUserAttributionPersonProperties,
  setOnboardingAttributionPersonProperties,
} from '../../src/analytics/source-attribution';

describe('source attribution person properties', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(setAnalyticsPersonProperties).mockClear();
  });

  it('sets onboarding profile fields as PostHog person properties', () => {
    setOnboardingAttributionPersonProperties(
      {
        role: 'engineer',
        orgSize: 'growth',
        useCase: ['product', 'unknown', ''],
        source: 'github',
      },
      new Date('2026-07-02T08:00:00.000Z'),
    );

    expect(setAnalyticsPersonProperties).toHaveBeenCalledWith({
      od_role: 'engineer',
      od_org_size: 'growth',
      od_use_cases: ['product'],
      od_onboarding_source: 'github',
      od_source_resolved: 'github',
      od_source_resolution: 'onboarding',
      od_onboarding_at: '2026-07-02T08:00:00.000Z',
    });
  });

  it('binds a signed-in AMR user to the stored onboarding source', () => {
    const onboardingCompletedAt = new Date('2026-07-01T07:00:00.000Z');
    saveOnboardingProfile(
      {
        role: 'growth',
        orgSize: 'startup',
        useCase: ['marketing'],
        source: 'social',
      },
      onboardingCompletedAt,
    );

    bindSignedInUserAttributionPersonProperties(
      'usr_amr_42',
      new Date('2026-07-02T08:30:00.000Z'),
    );

    expect(setAnalyticsPersonProperties).toHaveBeenCalledWith(
      expect.objectContaining({
        od_app_user_id: 'usr_amr_42',
        od_source_bound_at: '2026-07-02T08:30:00.000Z',
        od_source_resolved: 'social',
        od_source_resolution: 'onboarding',
        od_role: 'growth',
        od_org_size: 'startup',
        od_use_cases: ['marketing'],
        od_onboarding_source: 'social',
        od_onboarding_at: '2026-07-01T07:00:00.000Z',
      }),
    );
  });

  it('binds the stored AMR entry attribution alongside onboarding fields', () => {
    saveOnboardingProfile(
      {
        role: 'growth',
        orgSize: 'startup',
        useCase: ['marketing'],
        source: 'social',
      },
      new Date('2026-07-01T07:00:00.000Z'),
    );
    const track = vi.fn();
    recordAmrEntry(
      track,
      'inline_model_switcher_amr_row',
      new Date('2026-07-02T08:15:00.000Z'),
    );

    bindSignedInUserAttributionPersonProperties(
      'usr_amr_42',
      new Date('2026-07-02T08:30:00.000Z'),
    );

    expect(setAnalyticsPersonProperties).toHaveBeenLastCalledWith(
      expect.objectContaining({
        od_app_user_id: 'usr_amr_42',
        od_source_resolved: 'social',
        od_source_resolution: 'onboarding',
        od_onboarding_at: '2026-07-01T07:00:00.000Z',
        od_amr_entry_id: expect.stringMatching(/^od-amr-/u),
        od_amr_entry_source: 'inline_model_switcher_amr_row',
        od_amr_entry_at: '2026-07-02T08:15:00.000Z',
      }),
    );
  });

  it('does not emit an empty bind when the signed-in user id is missing', () => {
    bindSignedInUserAttributionPersonProperties(null);

    expect(setAnalyticsPersonProperties).not.toHaveBeenCalled();
  });
});
