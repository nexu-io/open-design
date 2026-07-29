import { describe, expect, it } from 'vitest';

import type { BrandFinalizeResponse } from '../src/api/brands';

describe('brands contract', () => {
  it('exposes authored seed overrides on finalized brands', () => {
    const response = {
      id: 'brand-acme',
      brand: {
        name: 'Acme',
        tagline: 'Reliable examples',
        description: 'A contract fixture.',
        sourceUrl: 'https://example.com',
        logo: { primary: null, alternates: [], notes: '' },
        colors: [],
        typography: {
          display: { family: 'Inter', fallbacks: ['sans-serif'], weights: [400, 700] },
          body: { family: 'Inter', fallbacks: ['sans-serif'], weights: [400, 700] },
        },
        voice: {
          adjectives: [],
          tone: '',
          messagingPillars: [],
          vocabulary: { use: [], avoid: [] },
        },
        imagery: { style: '', subjects: [], treatment: '', avoid: [] },
        layout: { radius: '', borderWeight: '', spacing: '', postureRules: [] },
        seed: { controlHeight: 44 },
      },
      designSystemId: 'user:brand-acme',
      projectId: 'brand-brand-acme',
      files: ['system/seed.json'],
    } satisfies BrandFinalizeResponse;

    const restored = JSON.parse(JSON.stringify(response)) as BrandFinalizeResponse;

    expect(restored.brand.seed?.controlHeight).toBe(44);
  });
});
