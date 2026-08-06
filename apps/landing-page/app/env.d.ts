/// <reference path="../.astro/types.d.ts" />

// Compile-time constant injected by `vite.define` in astro.config.ts. True on
// staging / PR-preview builds (OD_LANDING_NOINDEX=1), false in production.
declare const __OD_LANDING_NOINDEX__: boolean;

interface ImportMetaEnv {
  readonly PUBLIC_GA_MEASUREMENT_ID?: string;
  readonly PUBLIC_POSTHOG_KEY?: string;
  readonly PUBLIC_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  // Defined by posthog-analytics.astro; no-op shim until PostHog loads.
  __odTrack?: (name: string, props?: Record<string, unknown>) => void;
  // QA-only handle exposed by the engagement download prompt.
  __odDownloadPrompt?: { show: (trigger?: string) => boolean };
  __odRecordCampaignEntry?: (sourceDetail: string, campaignId?: string) => {
    entry_id: string;
    source_product: 'open_design';
    source_detail: string;
    entry_occurred_at: string;
    conversion_source: string;
    campaign_id?: string;
    device_id?: string;
  };
  __odAttributedUrl?: (
    href: string,
    attribution?: ReturnType<NonNullable<Window['__odRecordCampaignEntry']>>,
  ) => string;
}
