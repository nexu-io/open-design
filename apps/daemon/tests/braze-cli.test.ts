// Role: Pure unit tests for Braze CLI helper logic — no live daemon required.
// Key Features: buildBrazeInterviewBody flag-to-request mapping, emphasis comma-split,
//               custom_event → customEventName resolution, variantCount default
// Dependencies: ../src/braze-cli-args.js
import { describe, expect, it } from 'vitest';

import { buildBrazeInterviewBody } from '../src/braze-cli-args.js';

describe('buildBrazeInterviewBody', () => {
  it('maps basic flags to required fields', () => {
    const body = buildBrazeInterviewBody({
      format: 'slideup',
      delivery: 'action_based',
      trigger: 'session_start',
    });
    expect(body).toEqual({
      iamFormat: 'slideup',
      deliveryModel: 'action_based',
      triggerEvent: 'session_start',
      variantCount: 1,
    });
  });

  it('splits --emphasis on comma into string[]', () => {
    const body = buildBrazeInterviewBody({
      format: 'modal',
      delivery: 'scheduled',
      trigger: 'any_purchase',
      emphasis: 'urgency,value,trust',
    });
    expect(body.emphasis).toEqual(['urgency', 'value', 'trust']);
  });

  it('passes customEventName when trigger is custom_event', () => {
    const body = buildBrazeInterviewBody({
      format: 'fullscreen',
      delivery: 'action_based',
      trigger: 'custom_event',
      'custom-event': 'product_viewed',
    });
    expect(body.triggerEvent).toBe('custom_event');
    expect(body.customEventName).toBe('product_viewed');
  });

  it('does NOT include customEventName for non-custom_event triggers', () => {
    const body = buildBrazeInterviewBody({
      format: 'custom_html',
      delivery: 'scheduled',
      trigger: 'push_click',
      'custom-event': 'ignored_event',
    });
    expect(body.triggerEvent).toBe('push_click');
    expect(body).not.toHaveProperty('customEventName');
  });

  it('parses --variants as integer (default 1 when omitted)', () => {
    const withVariants = buildBrazeInterviewBody({
      format: 'modal',
      delivery: 'action_based',
      trigger: 'session_start',
      variants: '3',
    });
    expect(withVariants.variantCount).toBe(3);

    const withDefault = buildBrazeInterviewBody({
      format: 'modal',
      delivery: 'action_based',
      trigger: 'session_start',
    });
    expect(withDefault.variantCount).toBe(1);
  });

  it('passes optional segment and tone through', () => {
    const body = buildBrazeInterviewBody({
      format: 'slideup',
      delivery: 'action_based',
      trigger: 'session_start',
      segment: 'age > 25',
      tone: 'friendly',
    });
    expect(body.segment).toBe('age > 25');
    expect(body.tone).toBe('friendly');
  });

  it('trims whitespace from emphasis items', () => {
    const body = buildBrazeInterviewBody({
      format: 'modal',
      delivery: 'action_based',
      trigger: 'session_start',
      emphasis: '  urgency , value , trust  ',
    });
    expect(body.emphasis).toEqual(['urgency', 'value', 'trust']);
  });

  it('omits emphasis when not provided', () => {
    const body = buildBrazeInterviewBody({
      format: 'modal',
      delivery: 'action_based',
      trigger: 'session_start',
    });
    expect(body).not.toHaveProperty('emphasis');
  });
});

describe('buildBrazeInterviewBody — enum validation', () => {
  it('throws on invalid --format value', () => {
    expect(() =>
      buildBrazeInterviewBody({
        format: 'banner',
        delivery: 'action_based',
        trigger: 'session_start',
      }),
    ).toThrow(/invalid --format "banner"/);
  });

  it('throws on invalid --delivery value', () => {
    expect(() =>
      buildBrazeInterviewBody({
        format: 'modal',
        delivery: 'immediate',
        trigger: 'session_start',
      }),
    ).toThrow(/invalid --delivery "immediate"/);
  });

  it('throws on invalid --trigger value', () => {
    expect(() =>
      buildBrazeInterviewBody({
        format: 'modal',
        delivery: 'action_based',
        trigger: 'app_open',
      }),
    ).toThrow(/invalid --trigger "app_open"/);
  });

  it('accepts all valid --format values without throwing', () => {
    for (const fmt of ['slideup', 'modal', 'fullscreen', 'custom_html']) {
      expect(() =>
        buildBrazeInterviewBody({ format: fmt, delivery: 'action_based', trigger: 'session_start' }),
      ).not.toThrow();
    }
  });

  it('accepts all valid --delivery values without throwing', () => {
    for (const d of ['action_based', 'scheduled']) {
      expect(() =>
        buildBrazeInterviewBody({ format: 'modal', delivery: d, trigger: 'session_start' }),
      ).not.toThrow();
    }
  });

  it('accepts all valid --trigger values without throwing', () => {
    for (const t of ['session_start', 'push_click', 'any_purchase', 'specific_purchase', 'custom_event']) {
      expect(() =>
        buildBrazeInterviewBody({ format: 'modal', delivery: 'action_based', trigger: t }),
      ).not.toThrow();
    }
  });
});
