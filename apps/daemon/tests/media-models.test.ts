import { describe, expect, it } from 'vitest';

import { IMAGE_MODELS, VIDEO_MODELS, AUDIO_MODELS_BY_KIND, withConfiguredCustomImageModels } from '../src/media-models.js';

describe('media model registry', () => {
  it('advertises Gemini Vertex image as image-conditioned once i2i is wired', () => {
    expect(IMAGE_MODELS.find((m) => m.id === 'gemini-3-pro-image-preview')?.caps)
      .toEqual(['t2i', 'i2i']);
  });
});

describe('runnable model filtering', () => {
  it('filters Google video models from runnable set (only image is implemented)', () => {
    const runnableVideo = VIDEO_MODELS.filter((m) => m.provider !== 'google');
    expect(runnableVideo.find((m) => m.id === 'veo-3')).toBeUndefined();
    expect(runnableVideo.find((m) => m.id === 'veo-2')).toBeUndefined();
  });

  it('filters Google audio models from runnable set (only image is implemented)', () => {
    for (const kind of Object.keys(AUDIO_MODELS_BY_KIND) as Array<keyof typeof AUDIO_MODELS_BY_KIND>) {
      const runnableAudio = AUDIO_MODELS_BY_KIND[kind].filter((m) => m.provider !== 'google');
      expect(runnableAudio.find((m) => m.id === 'lyria-2')).toBeUndefined();
    }
  });

  it('gates top-level custom-image model by baseUrl presence', () => {
    const withBaseUrl = withConfiguredCustomImageModels(IMAGE_MODELS, 'flux-custom', undefined);
    expect(withBaseUrl.find((m) => m.id === 'flux-custom')).toBeDefined();

    const withoutBaseUrl = withConfiguredCustomImageModels(IMAGE_MODELS, undefined, undefined);
    expect(withoutBaseUrl.find((m) => m.id === 'flux-custom')).toBeUndefined();
  });
});
