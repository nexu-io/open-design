import type {
  AmrEntryAttribution,
  TrackingAmrEntrySource,
  TrackingPageName,
} from '@open-design/contracts/analytics';
import { readOnboardingProfile } from '../state/onboarding-profile';
import { trackAmrEntryClick } from './events';

type Track = (
  event: string,
  properties: Record<string, unknown>,
  options?: { requestId?: string; insertId?: string },
) => void;

interface RecordAmrEntryOptions {
  reuseExistingFrom?: readonly TrackingAmrEntrySource[];
}

const AMR_ATTRIBUTION_STORAGE_KEY = 'open-design:amr-entry-attribution:v1';
const AMR_ATTRIBUTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ENTRY_PAGE_BY_SOURCE: Record<TrackingAmrEntrySource, TrackingPageName> = {
  onboarding_amr_card: 'onboarding',
  onboarding_amr_sign_in_continue: 'onboarding',
  inline_model_switcher_amr_row: 'chat_panel',
  settings_amr_agent_card: 'settings',
  settings_amr_authorize: 'settings',
  chat_error_authorize_retry: 'chat_panel',
  chat_error_recharge: 'chat_panel',
  chat_error_switch_retry_card: 'chat_panel',
  generation_preview_authorize_retry: 'file_manager',
  generation_preview_recharge: 'file_manager',
  generation_preview_switch_retry_card: 'file_manager',
};

export type { AmrEntryAttribution, TrackingAmrEntrySource };

// Where an amr_entry source surfaces in the product. amr-auth.ts reuses
// this to stamp `page_name` on amr_auth_result from the attribution alone.
export function amrEntryPageForSource(
  source: TrackingAmrEntrySource,
): TrackingPageName {
  return ENTRY_PAGE_BY_SOURCE[source];
}

export function recordAmrEntry(
  track: Track,
  sourceDetail: TrackingAmrEntrySource,
  now: Date = new Date(),
  options: RecordAmrEntryOptions = {},
): AmrEntryAttribution {
  const existing = readReusableAmrAttribution(now, options.reuseExistingFrom);
  if (existing) return existing;

  const profile = readOnboardingProfile();
  const attribution: AmrEntryAttribution = {
    entryId: `od-amr-${randomId()}`,
    sourceProduct: 'open_design',
    sourceDetail,
    occurredAt: now.toISOString(),
    ...(profile?.role ? { odRole: profile.role } : {}),
    ...(profile?.orgSize ? { odOrgSize: profile.orgSize } : {}),
    ...(profile?.useCase && profile.useCase.length > 0
      ? { odUseCase: profile.useCase }
      : {}),
    ...(profile?.source ? { odSource: profile.source } : {}),
  };
  writeAmrAttribution(attribution);
  trackAmrEntryClick(track, {
    page_name: ENTRY_PAGE_BY_SOURCE[sourceDetail],
    area: 'amr_entry',
    element: sourceDetail,
    action: 'click_amr_entry',
    entry_id: attribution.entryId,
    source_product: attribution.sourceProduct,
    source_detail: attribution.sourceDetail,
    entry_occurred_at: attribution.occurredAt,
  });
  void mirrorAmrEntryToAmrAnalytics(attribution);
  return attribution;
}

export function readAmrAttribution(now: Date = new Date()): AmrEntryAttribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AMR_ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AmrEntryAttribution>;
    if (!isValidAmrAttribution(parsed)) return null;
    if (now.getTime() - Date.parse(parsed.occurredAt) > AMR_ATTRIBUTION_TTL_MS) {
      window.localStorage.removeItem(AMR_ATTRIBUTION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// Resolves the device id to forward to AMR on a handoff, ONLY when the user has
// opted into metrics; otherwise null. Prefers `config.installationId` from the
// current render, falling back to the resolved telemetry device id, then null.
//
// In steady state these two are the same value (the analytics client seeds its
// resolved id from `cfg.installationId`), so the AMR join key still matches the
// telemetry / PostHog / Langfuse device identity. The precedence matters only
// during a `Delete my data` rotation: `config.installationId` is the fresh
// source-of-truth in the current render, while `resolvedDeviceId` (a module
// global in the analytics client) only catches up later when the App-level
// `setIdentity(...)` effect runs `applyIdentity()`. Reading `installationId`
// first forwards the rotated id immediately instead of the stale pre-rotation
// one, so the cross-product join never points at a deleted identity. Neither
// input is the mount-time bootstrap UUID, so this never regresses to that.
export function amrHandoffDeviceId(input: {
  metricsConsent: boolean;
  resolvedDeviceId: string | null;
  installationId: string | null | undefined;
}): string | null {
  if (!input.metricsConsent) return null;
  return input.installationId ?? input.resolvedDeviceId ?? null;
}

// Builds the AMR handoff URL with Open Design attribution params. When
// `deviceId` is provided it is added as `od_device_id`, so AMR can link the
// landing/registration directly back to this Open Design install instead of
// only through the one-shot entry id. The caller passes it ONLY when the user
// has consented to metrics: AMR is Open Design's official model service, so
// this is a same-owner cross-product link, but it still respects the telemetry
// opt-in. Pass null/undefined to omit it.
export function attributedAmrUrl(
  baseUrl: string,
  attribution: AmrEntryAttribution,
  deviceId?: string | null,
): string {
  const params: Record<string, string> = {
    od_origin: attribution.sourceProduct,
    od_entry_id: attribution.entryId,
    od_entry_source: attribution.sourceDetail,
    od_entry_at: attribution.occurredAt,
  };
  if (deviceId) params.od_device_id = deviceId;
  try {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${new URLSearchParams(params).toString()}`;
  }
}

function writeAmrAttribution(attribution: AmrEntryAttribution): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AMR_ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Analytics persistence must never block the primary action.
  }
}

function readReusableAmrAttribution(
  now: Date,
  reuseExistingFrom: readonly TrackingAmrEntrySource[] | undefined,
): AmrEntryAttribution | null {
  if (!reuseExistingFrom || reuseExistingFrom.length === 0) return null;
  const existing = readAmrAttribution(now);
  if (!existing) return null;
  return reuseExistingFrom.includes(existing.sourceDetail) ? existing : null;
}

async function mirrorAmrEntryToAmrAnalytics(
  attribution: AmrEntryAttribution,
): Promise<void> {
  if (typeof fetch !== 'function') return;
  const sourcePageName = ENTRY_PAGE_BY_SOURCE[attribution.sourceDetail];
  try {
    await fetch('/api/integrations/vela/analytics-entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: {
          pageName: 'open_design',
          sourcePageName,
          area: 'amr_entry',
          element: attribution.sourceDetail,
          action: 'click_amr_entry',
          entryId: attribution.entryId,
          sourceProduct: attribution.sourceProduct,
          sourceDetail: attribution.sourceDetail,
          entryOccurredAt: attribution.occurredAt,
          // Self-reported onboarding profile (optional). Anchored to entryId on
          // the AMR side for paid-conversion segmentation. Not added to the
          // redirect URL — kept to the consent-gated mirror channel only.
          ...(attribution.odRole ? { odRole: attribution.odRole } : {}),
          ...(attribution.odOrgSize ? { odOrgSize: attribution.odOrgSize } : {}),
          ...(attribution.odUseCase && attribution.odUseCase.length > 0
            ? { odUseCase: attribution.odUseCase }
            : {}),
          ...(attribution.odSource ? { odSource: attribution.odSource } : {}),
        },
      }),
    });
  } catch {
    // AMR analytics mirroring must never block the primary Open Design action.
  }
}

function isValidAmrAttribution(value: Partial<AmrEntryAttribution>): value is AmrEntryAttribution {
  return value.sourceProduct === 'open_design'
    && typeof value.entryId === 'string'
    && value.entryId.length > 0
    && typeof value.sourceDetail === 'string'
    && value.sourceDetail in ENTRY_PAGE_BY_SOURCE
    && typeof value.occurredAt === 'string'
    && Number.isFinite(Date.parse(value.occurredAt));
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
