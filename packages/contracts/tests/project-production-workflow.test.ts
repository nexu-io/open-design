import { describe, expect, it } from 'vitest';

import {
  buildProductionProjectMetadata,
  productionTaskCardCatalog,
} from '../src/index.js';

describe('production workflow contracts', () => {
  it('creates a production metadata payload with only the required defaults when no options are passed', () => {
    expect(buildProductionProjectMetadata('storyboard')).toEqual({
      kind: 'video',
      workflowMode: 'production',
      taskCardId: 'storyboard',
    });
  });

  it('creates a production metadata payload with the merged video + voiceover defaults', () => {
    expect(
      buildProductionProjectMetadata('science-explainer', {
        voiceProfileId: 'rachel-default',
        voiceTone: 'professional',
        consistencyLock: {
          character: true,
          wardrobe: true,
          camera: true,
          voice: true,
        },
      }),
    ).toEqual({
      kind: 'video',
      workflowMode: 'production',
      taskCardId: 'science-explainer',
      voiceProfileId: 'rachel-default',
      voiceTone: 'professional',
      consistencyLock: {
        character: true,
        wardrobe: true,
        camera: true,
        voice: true,
      },
    });
  });

  it('exposes the beginner task-card catalog in the expected order with stable copy text', () => {
    expect(productionTaskCardCatalog()).toEqual([
      {
        id: 'science-explainer',
        title: 'Science explainer',
        description: 'Explain a concept with clear structure and simple visuals.',
      },
      {
        id: 'talking-head',
        title: 'Talking-head narration',
        description: 'Generate a voice-led script with a stable presenter persona.',
      },
      {
        id: 'storyboard',
        title: 'Storyboard planning',
        description: 'Break a script into shots, assets, and timing.',
      },
      {
        id: 'product-showcase',
        title: 'Product showcase',
        description: 'Present a product with scene-level polish and pacing.',
      },
    ]);
  });

  it('keeps the beginner task-card ids in the expected order', () => {
    expect(productionTaskCardCatalog().map((card) => card.id)).toEqual([
      'science-explainer',
      'talking-head',
      'storyboard',
      'product-showcase',
    ]);
  });
});
