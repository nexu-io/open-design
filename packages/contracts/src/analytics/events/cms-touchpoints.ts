/** CMS runtime facts only; public identity and consent belong to AnalyticsProvider. */
export type CmsTouchpointPlacement =
  | 'opend.home.campaign-modal'
  | 'opend.home.account-badge'
  | 'opend.home.hover-entry'
  | 'opend.home.hover-layer';

export interface CmsTouchpointContext {
  host_product: 'opend';
  host_family: 'open-design-desktop';
  mode: 'production' | 'test';
  placement_key: CmsTouchpointPlacement;
  activity_id: string;
  deployment_id: string;
  content_version_id: string;
  load_attempt_id: string;
  decision_id: string | null;
  locale: string;
  /** Canonical V3 provenance of the verified rendered content, when available. */
  template_id?: string;
  template_version?: number;
  material_version_id?: string;
}

export type CmsTouchpointSurfaceViewProps = CmsTouchpointContext & (
  | { page_name: 'home'; area: 'cms_campaign_modal'; element: 'modal'; placement_key: 'opend.home.campaign-modal' }
  | { page_name: 'home'; area: 'cms_account_badge'; element: 'badge'; placement_key: 'opend.home.account-badge' | 'opend.home.hover-entry' }
  | { page_name: 'home'; area: 'cms_hover_layer'; element: 'layer'; placement_key: 'opend.home.hover-layer' }
);

export interface CmsPrimaryAttribution {
  entry_id?: string;
  source_product?: 'open_design';
  source_detail?: 'cms_campaign_primary_cta';
  entry_occurred_at?: string;
}
/** Resolved registered action facts; identity is preserved verbatim and URLs are excluded. */
export type CmsTouchpointActionFacts =
  | { action_id: string; target_kind: 'https' | 'internal' }
  | { action_id: string; target_kind: 'console_pricing' | 'vela_personal_subscription' };

type CmsNonButton = {
  action_id?: never;
  target_kind?: never;
  button_role?: never;
};

type CmsTargetClick =
  | ({ element: "primary_cta" } & CmsPrimaryAttribution &
      (
        | { action_id?: never; target_kind?: never; button_role?: never }
        | {
            action_id: string;
            target_kind: "console_pricing" | "vela_personal_subscription";
            button_role: "primary" | "secondary";
          }
      ))
  | {
      element: "link_cta";
      action_id: string;
      target_kind: "https" | "internal";
      button_role?: "primary" | "secondary";
      entry_id?: never;
      source_product?: never;
      source_detail?: never;
      entry_occurred_at?: never;
    };

export type CmsTouchpointClickProps = CmsTouchpointContext &
  (
    | ({
        page_name: "home";
        area: "cms_campaign_modal";
        placement_key: "opend.home.campaign-modal";
      } & CmsTargetClick)
    | ({
        page_name: "home";
        area: "cms_campaign_modal";
        element: "secondary_close" | "close";
        placement_key: "opend.home.campaign-modal";
      } & CmsNonButton)
    | ({
        page_name: "home";
        area: "cms_hover_layer";
        element: "close";
        placement_key: "opend.home.hover-layer";
      } & CmsNonButton)
    | ({
        page_name: "home";
        area: "cms_hover_layer";
        placement_key: "opend.home.hover-layer";
      } & CmsTargetClick)
  );
