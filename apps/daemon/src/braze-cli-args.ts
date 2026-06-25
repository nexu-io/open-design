// Role: Pure, side-effect-free helper for building Braze CLI request bodies from
//       parsed flag objects. Extracted so tests can import this without triggering
//       cli.ts top-level side effects (process.argv dispatch, daemon startup, etc.).
// Key Features: Interview request body construction, emphasis comma-split,
//               custom_event → customEventName resolution, variantCount parsing
// Dependencies: @marketing-ax/contracts (type imports only)

import type { BrazeIamFormat, BrazeDeliveryModel, BrazeTriggerEvent, BrazeInterviewRequest } from '@marketing-ax/contracts';

// Flags accepted by `od braze interview` (a strict subset of ParsedBrazeFlags).
export interface BrazeInterviewFlags {
  format?: string;
  delivery?: string;
  trigger?: string;
  'custom-event'?: string;
  segment?: string;
  tone?: string;
  emphasis?: string;
  variants?: string;
}

// 허용된 enum 값 집합 — 서버로 잘못된 값이 전달되기 전에 명시적 오류를 발생시키기 위해 유지
const VALID_IAM_FORMATS: ReadonlySet<string> = new Set([
  'slideup', 'modal', 'fullscreen', 'custom_html',
]);
const VALID_DELIVERY_MODELS: ReadonlySet<string> = new Set([
  'action_based', 'scheduled',
]);
const VALID_TRIGGER_EVENTS: ReadonlySet<string> = new Set([
  'session_start', 'push_click', 'any_purchase', 'specific_purchase', 'custom_event',
]);

// Builds the BrazeInterviewRequest body from parsed CLI flags.
// Pure function — no I/O, no process access, safe to unit-test.
// Throws on invalid enum values so the CLI's try/catch surfaces them as usage errors (exit 2).
export function buildBrazeInterviewBody(flags: BrazeInterviewFlags): BrazeInterviewRequest {
  const rawFormat = flags.format ?? '';
  if (!VALID_IAM_FORMATS.has(rawFormat)) {
    throw new Error(
      `invalid --format "${rawFormat}"; must be one of: ${[...VALID_IAM_FORMATS].join(', ')}`,
    );
  }
  const iamFormat = rawFormat as BrazeIamFormat;

  const rawDelivery = flags.delivery ?? '';
  if (!VALID_DELIVERY_MODELS.has(rawDelivery)) {
    throw new Error(
      `invalid --delivery "${rawDelivery}"; must be one of: ${[...VALID_DELIVERY_MODELS].join(', ')}`,
    );
  }
  const deliveryModel = rawDelivery as BrazeDeliveryModel;

  const rawTrigger = flags.trigger ?? '';
  if (!VALID_TRIGGER_EVENTS.has(rawTrigger)) {
    throw new Error(
      `invalid --trigger "${rawTrigger}"; must be one of: ${[...VALID_TRIGGER_EVENTS].join(', ')}`,
    );
  }
  const triggerEvent = rawTrigger as BrazeTriggerEvent;

  // --variants parsed as integer, default 1 when absent or invalid
  const rawVariants = flags.variants !== undefined ? parseInt(flags.variants, 10) : NaN;
  const variantCount = Number.isInteger(rawVariants) && rawVariants > 0 ? rawVariants : 1;

  const body: BrazeInterviewRequest = {
    iamFormat,
    deliveryModel,
    triggerEvent,
    variantCount,
  };

  // --custom-event is only forwarded when --trigger is custom_event;
  // for all other trigger kinds it is ignored (matching backend behaviour)
  if (triggerEvent === 'custom_event' && flags['custom-event']) {
    body.customEventName = flags['custom-event'];
  }

  if (flags.segment) {
    body.segment = flags.segment;
  }

  if (flags.tone) {
    body.tone = flags.tone;
  }

  // --emphasis "a,b,c" → string[] with whitespace trimmed per item
  if (flags.emphasis) {
    body.emphasis = flags.emphasis
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return body;
}
