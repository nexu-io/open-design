/**
 * @module analytics/events/page-view
 * page_view event prop types and their union.
 */
import type { DesignSystemsPageViewProps } from './design-systems.js';
import type { TrackingPageName } from './event-names.js';
import type { OnboardingPageViewProps, TrackingChatPanelPageViewSource } from './onboarding.js';
// --- Generic page_view (existing surfaces) ---
//
// Covers all page-level page_views that don't carry surface-specific
// fields. `chat_panel` is the only one that uses the optional `source`.
export interface GenericPageViewProps {
  page_name: Exclude<
    TrackingPageName,
    'onboarding' | 'design_system_project' | 'studio'
  >;
  source?: TrackingChatPanelPageViewSource;
}

// Discriminated union by `page_name`. `home` and `design_systems` belong
// to BOTH `GenericPageViewProps` (page-level visit) and
// `DesignSystemsPageViewProps` (DS module / picker exposure on those
// pages); call sites that pass `area` get narrowed to the DS shape.
export type PageViewProps =
  | GenericPageViewProps
  | OnboardingPageViewProps
  | DesignSystemsPageViewProps;

