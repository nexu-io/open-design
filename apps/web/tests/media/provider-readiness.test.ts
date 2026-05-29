import { describe, expect, it } from 'vitest';

import { IMAGE_MODELS } from '../../src/media/models';
import { isMediaModelPickerReady } from '../../src/media/provider-readiness';
import type { MediaProviderCredentials } from '../../src/types';

const GOOGLE_ENABLED: Record<string, MediaProviderCredentials> = {
  google: {
    apiKey: '',
    baseUrl: '',
    enabled: true,
  },
};

describe('media model picker readiness', () => {
  it('keeps unsupported Google video and audio models hidden when Vertex image is enabled', () => {
    expect(isMediaModelPickerReady('imagen-4', GOOGLE_ENABLED)).toBe(true);
    expect(isMediaModelPickerReady('imagen-3', GOOGLE_ENABLED)).toBe(true);
    expect(isMediaModelPickerReady('gemini-3-pro-image-preview', GOOGLE_ENABLED)).toBe(true);
    expect(isMediaModelPickerReady('veo-3', GOOGLE_ENABLED)).toBe(false);
    expect(isMediaModelPickerReady('veo-2', GOOGLE_ENABLED)).toBe(false);
    expect(isMediaModelPickerReady('lyria-2', GOOGLE_ENABLED)).toBe(false);
  });

  it('advertises Gemini Vertex image as image-conditioned once i2i is wired', () => {
    expect(IMAGE_MODELS.find((model) => model.id === 'gemini-3-pro-image-preview')?.caps)
      .toEqual(['t2i', 'i2i']);
  });
});
