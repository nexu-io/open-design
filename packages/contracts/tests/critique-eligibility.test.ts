import { describe, expect, it } from 'vitest';

import { isCritiqueRunEligible } from '../src/critique.js';

const eligible = {
  enabled: true,
  hasBrand: true,
  hasSkill: true,
  sessionMode: 'design' as const,
  isMediaSurface: false,
  streamFormat: 'plain',
};

describe('isCritiqueRunEligible', () => {
  it('allows only plain, non-media Design runs with brand and skill context', () => {
    expect(isCritiqueRunEligible(eligible)).toBe(true);
  });

  it('rejects Ask and Plan runs so the prompt and orchestrator cannot diverge', () => {
    expect(isCritiqueRunEligible({ ...eligible, sessionMode: 'chat' })).toBe(false);
    expect(isCritiqueRunEligible({ ...eligible, sessionMode: 'plan' })).toBe(false);
  });

  it('retains the existing adapter, media, brand, skill, and rollout gates', () => {
    expect(isCritiqueRunEligible({ ...eligible, enabled: false })).toBe(false);
    expect(isCritiqueRunEligible({ ...eligible, hasBrand: false })).toBe(false);
    expect(isCritiqueRunEligible({ ...eligible, hasSkill: false })).toBe(false);
    expect(isCritiqueRunEligible({ ...eligible, isMediaSurface: true })).toBe(false);
    expect(isCritiqueRunEligible({ ...eligible, streamFormat: 'json-event-stream' })).toBe(false);
  });
});
