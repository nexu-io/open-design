/**
 * @module analytics/events/onboarding
 * Onboarding analytics event prop types.
 */
import type { TrackingRuntimeType } from '../public-params.js';
import type { TrackingCliProviderId } from './shared-enums.js';
// ---- page_view ------------------------------------------------------------

// `source` is supplied only by the chat_panel page_view (CSV row 41), where
// it records which surface launched the studio.
export type TrackingChatPanelPageViewSource =
  | 'new_project'
  | 'chat_composer'
  | 'recent_project'
  | 'projects_list'
  | 'template'
  | 'automation'
  | 'deeplink'
  | 'reload'
  | 'unknown';

// --- Onboarding page_view (welcome flow) ---
//
// CSV row "Onboarding / page_view". Fires once per step exposure inside the
// welcome flow. The current first-run flow is Connect → About you →
// Newsletter → Design system CTA. The legacy brand-extraction literal remains
// in the contract for historical rows only.
// Each step's `step_index` / `step_name` must match the enum pairs below.
// `onboarding_session_id` is generated once per session so dashboards can
// stitch the funnel.
export type TrackingOnboardingArea =
  | 'runtime'
  | 'about_you'
  | 'newsletter'
  | 'design_system'
  /** @deprecated legacy onboarding final-step area; use `design_system`. */
  | 'brand'
  | 'generation_progress';

// Mixed string enum: numeric steps render as the strings `'1' | '2' | '3' | '4'`
// and the generation phase as `'progress'`. Mirrors the v2 doc literally.
export type TrackingOnboardingStepIndex = '1' | '2' | '3' | '4' | 'progress';

export type TrackingOnboardingStepName =
  | 'connect'
  | 'about_you'
  | 'newsletter'
  | 'design_system'
  /** @deprecated legacy onboarding final-step name; use `design_system`. */
  | 'brand_extract'
  | 'generation';

// How the user chose to connect to a model provider. `amr_cloud` is the
// hosted offering the doc references; today the UI ships only
// `local_cli` (Local Coding Agent) and `byok` (own model key). `none`
// stamps the click events fired before any runtime was picked.
// Onboarding's runtime pick is the same closed set as the global
// `runtime_type` public param; alias to the single source of truth so the
// two never drift.
export type TrackingOnboardingRuntimeType = TrackingRuntimeType;

// What kind of source material the user pinned in the design-system
// step. `text` covers the freeform design-system description; `mixed` is
// reserved for batches that combined more than one type.
export type TrackingOnboardingSourceType =
  | 'text'
  | 'github_repo'
  | 'local_code'
  | 'fig'
  | 'assets'
  | 'mixed'
  | 'none';

// `completed`: user clicked through every step (with or without a DS).
// `cancelled`: user closed the onboarding tab / navigated away without
// finishing. `failed`: terminal error before completion.
// `skipped`: DEPRECATED — the onboarding "Skip for now" affordance was
// removed (Connect is now a required gate), so this is no longer emitted.
// Kept in the union for historical data / dashboard compatibility.
export type TrackingOnboardingCompletionResult =
  | 'completed'
  /** @deprecated no longer emitted — Skip was removed from onboarding. */
  | 'skipped'
  | 'cancelled'
  | 'failed';

export type TrackingOnboardingCompletionType =
  | 'completed_with_design_system'
  | 'completed_without_design_system'
  /** @deprecated no longer emitted — Skip was removed from onboarding. */
  | 'skipped';

// CLI scan terminal state. `success`: at least one CLI was detected;
// `failed`: scan errored or detected nothing; `timeout`: scan didn't
// settle inside the budget. Daemon doesn't currently surface timeouts
// for this scan; left in the type so a future watchdog can use it
// without a contract change.
export type TrackingOnboardingScanResult = 'success' | 'failed' | 'timeout';

// About-you step values. Surfaces from `onboardingRole*` /
// `onboardingOrg*` / `onboardingUse*` / `onboardingSource*` i18n
// keys; this enum is the wire-format shape the dashboard groups on.
// Kept as `string` rather than literal union because the product
// catalogue extends (e.g. add a new role) more often than the wire
// shape: a stricter union would force a contract bump for every new
// option. `unknown` covers the "user didn't pick / picked Other"
// path explicitly.
export type TrackingOnboardingOrganizationSize = string;
export type TrackingOnboardingUseCase = string;
export type TrackingOnboardingDiscoverySource = string;
// User's self-identified role. Same wire shape and rationale as the
// other About-you survey strings — `pm`, `designer`, `engineer`,
// `marketing`, `growth`, `ops`, `founder`, `student`, `other` are the
// current options from `apps/web/src/components/EntryShell.tsx`
// (`roleOptions`); the type stays open so adding a future role doesn't
// force a contract bump.
export type TrackingOnboardingRole = string;

// The product bucket a personalized Home recommendation resolved to. Mirrors
// the `ProductType` union produced by the web recommendation mapping
// (`apps/web/src/onboarding/recommendation.ts`). Kept as a closed literal
// union — unlike the open survey strings above — because these four buckets
// are defined by the mapping, not by the user-extensible survey catalogue.
export type TrackingOnboardingProductType =
  | 'product_ui'
  | 'marketing'
  | 'internal_tool'
  | 'general';

export interface OnboardingPageViewProps {
  page_name: 'onboarding';
  area: TrackingOnboardingArea;
  step_index: TrackingOnboardingStepIndex;
  step_name: TrackingOnboardingStepName;
  onboarding_session_id: string;
}

// ---- Onboarding ui_click ------------------------------------------------
//
// One interface so every onboarding click site can write
// `trackOnboardingClick(...)`, regardless of which sub-surface. The doc
// pre-allocates a large element / action enum because the funnel needs
// to discriminate Skip from Back from Continue, runtime choice from
// source selection, etc.
export type TrackingOnboardingClickElement =
  // Runtime / connect step
  | 'amr_cloud'
  | 'local_coding_agent'
  | 'byok'
  // Action buttons
  | 'continue'
  | 'back'
  /** @deprecated no longer emitted — Skip was removed from onboarding. */
  | 'skip'
  | 'generate'
  // About you fields
  | 'role'
  | 'organization_size'
  | 'use_case'
  | 'hear_about_us'
  // Optional newsletter email captured on the About-you step
  | 'newsletter_email'
  // Fires once on Finish-setup, carrying the full survey snapshot
  // (role + organization_size + use_case + discovery_source) so the
  // funnel always has the user's final picks even when individual
  // dropdown clicks were dropped on a fast navigate.
  | 'about_you_submit'
  // Design system source options
  | 'github_repo'
  | 'local_code'
  | 'fig_upload'
  | 'assets_upload'
  | 'show_access_methods';

export type TrackingOnboardingClickAction =
  | 'select_runtime'
  | 'continue'
  | 'back'
  /** @deprecated no longer emitted — Skip was removed from onboarding. */
  | 'skip'
  | 'generate'
  | 'select_option'
  | 'add_source'
  | 'upload_source'
  | 'show_access_methods'
  | 'subscribe';

// All optional except the discriminators (area/element/action/step/
// session id). `role`/`organization_size`/`use_case`/`discovery_source`
// ride along on About-you clicks AND on the `about_you_submit` snapshot
// click. `source_type`/`has_brand_description`/`source_count` only on
// Design-system source clicks. `runtime_type`/`is_recommended` only on
// Connect clicks. Doc explicitly forbids freeform design-system description,
// GitHub URL, file name, or path values — all enum + bool + count, no free-text.
export interface OnboardingClickProps {
  page_name: 'onboarding';
  area: TrackingOnboardingArea;
  element: TrackingOnboardingClickElement;
  action: TrackingOnboardingClickAction;
  step_index: TrackingOnboardingStepIndex;
  step_name: TrackingOnboardingStepName;
  onboarding_session_id: string;
  runtime_type?: TrackingOnboardingRuntimeType;
  is_recommended?: boolean;
  role?: TrackingOnboardingRole;
  organization_size?: TrackingOnboardingOrganizationSize;
  use_case?: TrackingOnboardingUseCase;
  // Multi-pick variant of `use_case` for the survey-snapshot
  // `about_you_submit` click. Individual `use_case` picks still go
  // through the scalar field one row per option. The list captures
  // the final selection at Finish-setup time without firing N rows.
  use_cases?: TrackingOnboardingUseCase[];
  discovery_source?: TrackingOnboardingDiscoverySource;
  source_type?: TrackingOnboardingSourceType;
  has_brand_description?: boolean;
  source_count?: number;
  // True when the user left a (valid) newsletter email on the About-you
  // step. Boolean only — the email address itself is never sent here.
  newsletter_opt_in?: boolean;
}

// ---- Onboarding lifecycle result events ---------------------------------

export interface OnboardingRuntimeScanResultProps {
  page_name: 'onboarding';
  area: 'runtime';
  runtime_type: 'local_cli';
  result: TrackingOnboardingScanResult;
  detected_cli_count: number;
  available_cli_count: number;
  selected_cli_id?: TrackingCliProviderId;
  error_code?: string;
  duration_ms: number;
  onboarding_session_id: string;
}

export interface OnboardingCompleteResultProps {
  page_name: 'onboarding';
  area: 'onboarding';
  result: TrackingOnboardingCompletionResult;
  exit_step_name: TrackingOnboardingStepName;
  completion_type: TrackingOnboardingCompletionType;
  runtime_type: TrackingOnboardingRuntimeType;
  has_about_you: boolean;
  has_design_system_request: boolean;
  source_count: number;
  error_code?: string;
  duration_ms: number;
  onboarding_session_id: string;
  // Survey-snapshot fields. Mirror the values from
  // `about_you_submit` ui_click so dashboards can read the user's
  // picks even if the individual dropdown clicks were dropped on
  // navigate. `'unknown'` is the wire value for a field the user
  // never touched on the About-you step; missing field means the user
  // skipped the entire step.
  role?: TrackingOnboardingRole;
  organization_size?: TrackingOnboardingOrganizationSize;
  use_cases?: TrackingOnboardingUseCase[];
  discovery_source?: TrackingOnboardingDiscoverySource;
}

// Fired once when Studio mounts with the recommended first request pre-filled
// in the composer — the "Home → Studio handoff succeeded" step of the funnel,
// between the recommendation's `enter_studio` click and
// `onboarding_first_prompt_sent`. `role` / `use_cases` echo the survey answers
// that produced the recommendation (spec §11.1).
export interface OnboardingPromptPrefilledProps {
  entry_source: 'home_recommendation';
  product_type: TrackingOnboardingProductType;
  recommendation_id: string;
  role?: TrackingOnboardingRole;
  use_cases?: TrackingOnboardingUseCase[];
}

// Fired once, in Studio, when the user sends the first request in a project
// they started from the Home recommendation. `has_prefilled_prompt` records
// whether the composer was still carrying the recommended text at send time
// (vs the user having cleared/rewritten it). Together with the recommendation
// `enter_studio` click this gives the send-through rate.
export interface OnboardingFirstPromptSentProps {
  entry_source: 'home_recommendation';
  product_type: TrackingOnboardingProductType;
  recommendation_id: string;
  has_prefilled_prompt: boolean;
}

// Fired once when that first generation completes successfully — the
// completion rate the acceptance criteria track.
export interface OnboardingFirstGenerationCompletedProps {
  entry_source: 'home_recommendation';
  product_type: TrackingOnboardingProductType;
  recommendation_id: string;
}

// The loop-closing steps of a recommendation-started first project. Recorded
// session-side, scoped to the created project id, as the user reaches each
// moment; `onboarding_completed` fires once, when the loop actually closes with
// a delivery (export / share) IN THAT SAME project.
export type TrackingOnboardingFirstLoopStep =
  | 'prompt_sent'
  | 'generated'
  | 'artifact_viewed'
  | 'delivered';

// Fired once when the first-generation loop closes (spec §11.1: 用户完成首次
// 生成闭环时). `completed_steps` carries every loop step observed for that
// project this session, in the order they were first reached.
export interface OnboardingCompletedProps {
  entry_source: 'home_recommendation';
  product_type: TrackingOnboardingProductType;
  recommendation_id: string;
  completed_steps: TrackingOnboardingFirstLoopStep[];
}

