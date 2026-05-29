import { describe, expect, it } from 'vitest';

import { IMAGE_MODELS } from '../src/media-models.js';

describe('media model registry', () => {
  it('does not advertise Gemini Vertex image as image-conditioned until i2i is wired', () => {
    expect(IMAGE_MODELS.find((model) => model.id === 'gemini-3-pro-image-preview')?.caps)
      .toEqual(['t2i']);
  });
});
