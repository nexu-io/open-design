// Braze in-app message (IAM) authoring. M-AX produces Custom HTML IAM artifacts
// through a fixed flow: request → interview → plan(draft) → confirm gate →
// produce → edit loop → done. The HTML output is a produced project file
// (deck/prototype-style, iframe-rendered), NOT a live-artifact — see
// DATA-MODEL-BRAZE.md §2. REST send is out of scope (경로1): delivery is a
// manual dashboard hand-off. These DTOs are the shared web/daemon contract;
// the daemon mirrors them with runtime validation.

import type { JsonValue } from '../common.js';

// IAM creative format. email_capture / web_modal_css are web-only and
// deferred (BRAZE-DOMAIN §1.1) — not part of the initial union.
export type BrazeIamFormat = 'slideup' | 'modal' | 'fullscreen' | 'custom_html';

// action_based = SDK custom-event trigger; scheduled = local-timezone delivery
// (BRAZE-DOMAIN §5.4). IAM is never API-sent — both models resolve on-device.
export type BrazeDeliveryModel = 'action_based' | 'scheduled';

// SDK-loggable firing events (BRAZE-DOMAIN §5.2). `custom_event` drills into a
// catalog event name (BRAZE-BODOC-CATALOG §3, 128 events).
export type BrazeTriggerEvent =
  | 'session_start'
  | 'push_click'
  | 'any_purchase'
  | 'specific_purchase'
  | 'custom_event';

// Message-level flow state (DATA-MODEL-BRAZE §1). Rejection of a plan returns
// to `plan_draft` (no separate state); the rejection reason accumulates in the
// plan. Per-variant production state lives on BrazeVariant.status.
export type BrazeMessageStatus =
  | 'interviewing'
  | 'plan_draft'
  | 'plan_confirmed'
  | 'producing'
  | 'produced'
  | 'editing'
  | 'done';

export type BrazeVariantStatus = 'pending' | 'produced' | 'editing' | 'done';

// One plan variant angle, expanded into a produced HTML variant at production.
export interface BrazePlanVariant {
  label: string; // 'A' | 'B' | ...
  angle: string; // creative direction for this variant
}

export interface BrazePlanTargeting {
  segment?: string; // attribute condition (BRAZE-BODOC-CATALOG §2)
  triggerEvent?: BrazeTriggerEvent;
  customEventName?: string; // when triggerEvent === 'custom_event'
  deliveryModel?: BrazeDeliveryModel;
}

export interface BrazePlanCta {
  label: string;
  deeplink?: string; // bodoc://... (BRAZE-BODOC-CATALOG §1)
}

export interface BrazePlanImageSpec {
  needed: boolean;
  ratio?: string; // per-format aspect ratio (BRAZE-DOMAIN §1.4)
  format?: 'PNG' | 'JPEG' | 'GIF'; // no WebP (BRAZE-DOMAIN §1.3)
}

export interface BrazePlanRejection {
  at: string; // ISO-8601
  reason: string;
}

// The 기획안 (braze_plan_v1). Persisted as braze_messages.plan_json; rendered
// to the user as a markdown card at the confirm gate.
export interface BrazePlan {
  version: 'braze_plan_v1';
  summary: string;
  iamFormat: BrazeIamFormat;
  tone?: string;
  emphasis: string[];
  variants: BrazePlanVariant[];
  targeting: BrazePlanTargeting;
  cta: BrazePlanCta[];
  image?: BrazePlanImageSpec;
  rejections: BrazePlanRejection[]; // appended on each rejection → rewrite
}

// A single produced IAM variant. artifactPath points at the produced HTML file
// in the project (null until produced).
export interface BrazeVariant {
  id: string;
  messageId: string;
  label: string;
  artifactPath: string | null;
  status: BrazeVariantStatus;
  position: number;
  createdAt: string; // ISO-8601
  updatedAt: string;
}

// One IAM authoring unit (one user request / campaign).
export interface BrazeMessage {
  id: string;
  projectId: string;
  conversationId: string;
  // Brand = design system. null → inherit project.design_system_id; non-null
  // overrides per message (DATA-MODEL-BRAZE §7-C).
  brandId: string | null;
  title: string;
  goal: string | null;
  iamFormat: BrazeIamFormat;
  deliveryModel: BrazeDeliveryModel | null;
  triggerEvent: string | null; // 5종 / custom-event name
  triggerProps: JsonValue | null; // trigger filter properties
  segment: JsonValue | null; // target attribute condition
  tone: string | null;
  emphasis: string | null;
  variantCount: number;
  plan: BrazePlan | null;
  status: BrazeMessageStatus;
  createdAt: string;
  updatedAt: string;
  variants: BrazeVariant[];
}

// --- Requests / responses ---

export interface BrazeMessageCreateRequest {
  projectId: string;
  conversationId: string;
  title: string;
  goal?: string;
  brandId?: string;
}

export interface BrazeMessageListResponse {
  messages: BrazeMessage[];
}

export interface BrazeMessageResponse {
  message: BrazeMessage;
}

// Interview answers (§5.1) → moves status interviewing → plan_draft and seeds
// the plan fields the agent then expands.
export interface BrazeInterviewRequest {
  iamFormat: BrazeIamFormat;
  deliveryModel: BrazeDeliveryModel;
  triggerEvent: BrazeTriggerEvent;
  customEventName?: string;
  segment?: string;
  tone?: string;
  emphasis?: string[];
  variantCount: number;
  cta?: BrazePlanCta[];
  image?: BrazePlanImageSpec;
}

// Agent writes/rewrites the plan (status → plan_draft).
export interface BrazePlanUpsertRequest {
  plan: BrazePlan;
}

// Confirm gate (§5.2): confirm → plan_confirmed + spawns variants;
// reject → plan_draft + appends reason for rewrite.
export interface BrazePlanDecisionRequest {
  decision: 'confirm' | 'reject';
  reason?: string; // required-ish when decision === 'reject'
}

// Records a produced HTML file against a variant (status → produced).
// variantId is taken from the URL path (:variantId) — not from the body.
export interface BrazeVariantProduceRequest {
  artifactPath: string;
}

// Edit-loop update for a single variant (status → editing/produced/done).
// variantId is taken from the URL path (:variantId) — not from the body.
export interface BrazeVariantUpdateRequest {
  status?: BrazeVariantStatus;
  artifactPath?: string;
}
