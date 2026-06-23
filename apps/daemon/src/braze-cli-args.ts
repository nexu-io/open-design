// Role: Pure, side-effect-free helper for building Braze CLI request bodies from
//       parsed flag objects. Extracted so tests can import this without triggering
//       cli.ts top-level side effects (process.argv dispatch, daemon startup, etc.).
// Key Features: Interview request body construction, emphasis comma-split,
//               custom_event → customEventName resolution, variantCount parsing
// Dependencies: @open-design/contracts (type imports only)

import type { BrazeIamFormat, BrazeDeliveryModel, BrazeTriggerEvent, BrazeInterviewRequest } from '@open-design/contracts';

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

// Builds the BrazeInterviewRequest body from parsed CLI flags.
// Pure function — no I/O, no process access, safe to unit-test.
export function buildBrazeInterviewBody(flags: BrazeInterviewFlags): BrazeInterviewRequest {
  const iamFormat = (flags.format ?? '') as BrazeIamFormat;
  const deliveryModel = (flags.delivery ?? '') as BrazeDeliveryModel;
  const triggerEvent = (flags.trigger ?? '') as BrazeTriggerEvent;

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
