import { describe, expect, it } from 'vitest';

import {
  buildRecommendation,
  nextStarter,
  resolveProductType,
  type StarterOption,
} from '../src/onboarding/recommendation';

describe('resolveProductType', () => {
  it('maps product-facing use-cases to product_ui', () => {
    expect(resolveProductType({ useCases: ['prototype'] })).toBe('product_ui');
    expect(resolveProductType({ useCases: ['design-system'] })).toBe('product_ui');
    expect(resolveProductType({ useCases: ['engineering'] })).toBe('product_ui');
  });

  it('maps marketing use-cases to marketing', () => {
    expect(resolveProductType({ useCases: ['landing'] })).toBe('marketing');
    expect(resolveProductType({ useCases: ['ads'] })).toBe('marketing');
    expect(resolveProductType({ useCases: ['agency'] })).toBe('marketing');
  });

  it('maps dashboard use-case to internal_tool', () => {
    expect(resolveProductType({ useCases: ['dashboard'] })).toBe('internal_tool');
  });

  it('prioritizes use-case over role', () => {
    // Role says ops (internal_tool) but the goal is a landing page (marketing).
    expect(resolveProductType({ role: 'ops', useCases: ['landing'] })).toBe('marketing');
  });

  it('honors questionnaire order — first resolvable signal wins', () => {
    // `deck` has no mapping and is skipped; `landing` resolves.
    expect(resolveProductType({ useCases: ['deck', 'landing'] })).toBe('marketing');
  });

  it('is independent of the click sequence (canonical questionnaire order)', () => {
    // `product` sits before `landing` in the questionnaire, so a set containing
    // both resolves to product_ui no matter which chip the user tapped first —
    // otherwise the same answers would flip between product_ui and marketing.
    expect(resolveProductType({ useCases: ['product', 'landing'] })).toBe('product_ui');
    expect(resolveProductType({ useCases: ['landing', 'product'] })).toBe('product_ui');
    // `landing` precedes `dashboard`, so their set always resolves to marketing.
    expect(resolveProductType({ useCases: ['dashboard', 'landing'] })).toBe('marketing');
    expect(resolveProductType({ useCases: ['landing', 'dashboard'] })).toBe('marketing');
  });

  it('falls back to role when no use-case resolves', () => {
    expect(resolveProductType({ role: 'designer', useCases: ['deck'] })).toBe('product_ui');
    expect(resolveProductType({ role: 'growth' })).toBe('marketing');
    expect(resolveProductType({ role: 'ops' })).toBe('internal_tool');
  });

  it('falls back to general for ambiguous roles and empty input', () => {
    expect(resolveProductType({ role: 'founder' })).toBe('general');
    expect(resolveProductType({ role: 'student' })).toBe('general');
    expect(resolveProductType({ role: 'other' })).toBe('general');
    expect(resolveProductType({})).toBe('general');
    expect(resolveProductType({ role: '  ', useCases: ['', '  '] })).toBe('general');
  });
});

describe('buildRecommendation', () => {
  it('returns a primary that is the first option in the path', () => {
    const rec = buildRecommendation({ useCases: ['prototype'] });
    expect(rec.productType).toBe('product_ui');
    expect(rec.primary).toBe(rec.options[0]);
    expect(rec.options.length).toBeGreaterThan(1);
  });

  it('echoes normalized inputs for telemetry', () => {
    const rec = buildRecommendation({ role: ' designer ', useCases: ['prototype', '  '] });
    expect(rec.role).toBe('designer');
    expect(rec.useCases).toEqual(['prototype']);
  });

  it('always resolves — unknown goals produce the general starter', () => {
    const rec = buildRecommendation({});
    expect(rec.productType).toBe('general');
    expect(rec.primary.id).toBe('general_menu');
    expect(rec.options).toHaveLength(1);
  });

  it('carries a stable primary id per path', () => {
    expect(buildRecommendation({ useCases: ['landing'] }).primary.id).toBe('marketing_landing');
    expect(buildRecommendation({ useCases: ['prototype'] }).primary.id).toBe('product_ui_prototype');
    expect(buildRecommendation({ role: 'ops' }).primary.id).toBe('internal_dashboard');
  });

  it('is identical for the same answer set in any selection order', () => {
    const a = buildRecommendation({ role: 'ops', useCases: ['landing', 'product', 'deck'] });
    const b = buildRecommendation({ role: 'ops', useCases: ['deck', 'product', 'landing'] });
    expect(a).toEqual(b);
    // Echoed use-cases are canonicalized (questionnaire order), not click order,
    // so telemetry for the same survey state is stable too.
    expect(a.useCases).toEqual(['product', 'landing', 'deck']);
    expect(a.productType).toBe('product_ui');
  });
});

describe('nextStarter', () => {
  // product_ui path is ordered [prototype, component, lowfi].
  const options: readonly StarterOption[] = buildRecommendation({ useCases: ['prototype'] }).options;

  it('advances to the next option within the path', () => {
    expect(nextStarter(options, 'product_ui_prototype').id).toBe('product_ui_component');
    expect(nextStarter(options, 'product_ui_component').id).toBe('product_ui_lowfi');
  });

  it('wraps around at the end', () => {
    expect(nextStarter(options, 'product_ui_lowfi').id).toBe('product_ui_prototype');
  });

  it('starts from the front for an unknown current id', () => {
    expect(nextStarter(options, 'nope').id).toBe('product_ui_prototype');
  });

  it('returns the sole option unchanged for a single-option path', () => {
    const single = buildRecommendation({}).options;
    expect(single).toHaveLength(1);
    expect(nextStarter(single, 'general_menu').id).toBe('general_menu');
  });
});
