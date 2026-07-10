// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordAmrEntry } from '../../src/analytics/amr-attribution';
import {
  readOnboardingProfile,
  saveOnboardingProfile,
  type OnboardingProfile,
} from '../../src/state/onboarding-profile';

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
    document.cookie = 'od_attr=;path=/;max-age=0';
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

  it('never persists raw "other" free-text to the stored profile', () => {
    // Even if a caller supplies a free-text detail, it must never be written to
    // the persisted attribution profile — only the enumerated bucket survives.
    saveOnboardingProfile(
      { source: 'other', sourceOther: 'Design podcast' } as unknown as OnboardingProfile,
      new Date('2026-07-02T08:00:00.000Z'),
    );
    const stored = readOnboardingProfile();
    expect(stored).toMatchObject({ source: 'other' });
    expect(stored).not.toHaveProperty('sourceOther');
  });

  it('never carries raw "other" free-text into analytics person properties', () => {
    // Analytics profile state must stay free-text/PII-free: the enumerated
    // bucket is bound, but the raw channel the user typed is never surfaced.
    setOnboardingAttributionPersonProperties(
      { source: 'other', sourceOther: 'Design podcast' } as unknown as OnboardingProfile,
      new Date('2026-07-02T08:00:00.000Z'),
    );

    const props = vi.mocked(setAnalyticsPersonProperties).mock.calls[0]?.[0] ?? {};
    expect(props).toMatchObject({ od_onboarding_source: 'other' });
    expect(props).not.toHaveProperty('od_onboarding_source_other');
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

  it('binds landing UTM attribution to the signed-in AMR user', () => {
    writeLandingAttributionCookie({
      s: 'twitter',
      m: 'organic_social',
      c: '202606_story',
      ct: 'official',
      tm: 'design_agent',
      ref: 'x.com',
      lp: '/stories/ikigai-one/',
      t: Date.parse('2026-06-30T12:00:00.000Z'),
    });

    bindSignedInUserAttributionPersonProperties(
      'usr_amr_42',
      new Date('2026-07-02T08:30:00.000Z'),
    );

    expect(setAnalyticsPersonProperties).toHaveBeenCalledWith(
      expect.objectContaining({
        od_app_user_id: 'usr_amr_42',
        od_source_bound_at: '2026-07-02T08:30:00.000Z',
        od_utm_source: 'twitter',
        od_utm_medium: 'organic_social',
        od_utm_campaign: '202606_story',
        od_utm_content: 'official',
        od_utm_term: 'design_agent',
        od_referrer: 'x.com',
        od_landing_path: '/stories/ikigai-one/',
        od_utm_first_touch_at: '2026-06-30T12:00:00.000Z',
        od_source_resolved: 'twitter',
        od_source_resolution: 'utm',
      }),
    );
  });

  it('keeps UTM and onboarding separate while resolving source from UTM first', () => {
    writeLandingAttributionCookie({
      s: 'linkedin',
      m: 'paid_social',
      c: 'launch',
      ct: 'founder_post',
      lp: '/download',
      t: Date.parse('2026-06-30T12:00:00.000Z'),
    });
    saveOnboardingProfile(
      {
        role: 'founder',
        orgSize: 'solo',
        useCase: ['landing_pages'],
        source: 'github',
      },
      new Date('2026-07-01T07:00:00.000Z'),
    );

    bindSignedInUserAttributionPersonProperties(
      'usr_amr_42',
      new Date('2026-07-02T08:30:00.000Z'),
    );

    expect(setAnalyticsPersonProperties).toHaveBeenCalledWith(
      expect.objectContaining({
        od_utm_source: 'linkedin',
        od_utm_medium: 'paid_social',
        od_utm_campaign: 'launch',
        od_utm_content: 'founder_post',
        od_landing_path: '/download',
        od_utm_first_touch_at: '2026-06-30T12:00:00.000Z',
        od_onboarding_source: 'github',
        od_onboarding_at: '2026-07-01T07:00:00.000Z',
        od_source_resolved: 'linkedin',
        od_source_resolution: 'utm',
      }),
    );
  });

  it('falls back to referrer attribution when od_attr has no UTM source', () => {
    writeLandingAttributionCookie({
      ref: 'google.com',
      lp: '/download',
      t: Date.parse('2026-06-30T12:00:00.000Z'),
    });

    bindSignedInUserAttributionPersonProperties(
      'usr_amr_42',
      new Date('2026-07-02T08:30:00.000Z'),
    );

    expect(setAnalyticsPersonProperties).toHaveBeenCalledWith(
      expect.objectContaining({
        od_referrer: 'google.com',
        od_landing_path: '/download',
        od_utm_first_touch_at: '2026-06-30T12:00:00.000Z',
        od_source_resolved: 'google.com',
        od_source_resolution: 'referrer',
      }),
    );
  });

  it('ignores malformed landing attribution cookies and falls back to onboarding', () => {
    document.cookie = 'od_attr=%7Bbad-json;path=/';
    saveOnboardingProfile(
      {
        role: 'designer',
        orgSize: 'startup',
        useCase: ['product'],
        source: 'friend',
      },
      new Date('2026-07-01T07:00:00.000Z'),
    );

    bindSignedInUserAttributionPersonProperties(
      'usr_amr_42',
      new Date('2026-07-02T08:30:00.000Z'),
    );

    expect(setAnalyticsPersonProperties).toHaveBeenCalledWith(
      expect.objectContaining({
        od_onboarding_source: 'friend',
        od_source_resolved: 'friend',
        od_source_resolution: 'onboarding',
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

function writeLandingAttributionCookie(value: Record<string, unknown>): void {
  document.cookie = `od_attr=${encodeURIComponent(JSON.stringify(value))};path=/`;
}
