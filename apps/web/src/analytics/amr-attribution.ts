import type {
  AmrEntryAttribution,
  TrackingAmrEntrySource,
  TrackingPageName,
} from '@open-design/contracts/analytics';
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

export function recordAmrEntry(
  track: Track,
  sourceDetail: TrackingAmrEntrySource,
  now: Date = new Date(),
  options: RecordAmrEntryOptions = {},
): AmrEntryAttribution {
  const existing = readReusableAmrAttribution(now, options.reuseExistingFrom);
  if (existing) return existing;

  const attribution: AmrEntryAttribution = {
    entryId: `od-amr-${randomId()}`,
    sourceProduct: 'open_design',
    sourceDetail,
    occurredAt: now.toISOString(),
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

export function attributedAmrUrl(baseUrl: string, attribution: AmrEntryAttribution): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('od_origin', attribution.sourceProduct);
    url.searchParams.set('od_entry_id', attribution.entryId);
    url.searchParams.set('od_entry_source', attribution.sourceDetail);
    url.searchParams.set('od_entry_at', attribution.occurredAt);
    return url.toString();
  } catch {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${new URLSearchParams({
      od_origin: attribution.sourceProduct,
      od_entry_id: attribution.entryId,
      od_entry_source: attribution.sourceDetail,
      od_entry_at: attribution.occurredAt,
    }).toString()}`;
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
