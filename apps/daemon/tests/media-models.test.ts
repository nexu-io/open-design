import { describe, expect, it } from 'vitest';

import {
  AUDIO_DURATIONS_SEC,
  AUDIO_MODELS_BY_KIND,
  IMAGE_MODELS,
  MEDIA_ASPECTS,
  MEDIA_PROVIDERS,
  VIDEO_LENGTHS_SEC,
  VIDEO_MODELS,
  withConfiguredCustomImageModels,
} from '../src/media-models.js';
import { buildMediaModelsResponse } from '../src/media-routes.js';

function buildDaemonModelsRegistry(mediaConfig: Parameters<typeof buildMediaModelsResponse>[0]['mediaConfig']) {
  return buildMediaModelsResponse({
    mediaConfig,
    providers: MEDIA_PROVIDERS,
    imageModels: IMAGE_MODELS,
    videoModels: VIDEO_MODELS,
    audioModelsByKind: AUDIO_MODELS_BY_KIND,
    aspects: MEDIA_ASPECTS,
    videoLengthsSec: VIDEO_LENGTHS_SEC,
    audioDurationsSec: AUDIO_DURATIONS_SEC,
    withConfiguredCustomImageModels,
  });
}

function ids(models: Array<{ id?: unknown }>) {
  return models.map((model) => model.id);
}

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

  it('keeps /api/media/models Google entries to implemented image surfaces', () => {
    const response = buildDaemonModelsRegistry({
      providers: {
        google: { enabled: true, configured: true },
      },
    });

    expect(response.image.filter((model) => model.provider === 'google').map((model) => model.id))
      .toEqual(['imagen-4', 'imagen-3', 'gemini-3-pro-image-preview']);
    expect(response.video.filter((model) => model.provider === 'google')).toEqual([]);
    expect(Object.values(response.audio).flat().filter((model) => model.provider === 'google'))
      .toEqual([]);
  });

  it('keeps /api/media/models from publishing incomplete custom-image dynamic ids', () => {
    const response = buildDaemonModelsRegistry({
      providers: {
        'custom-image': {
          model: 'root-without-base-url',
          profiles: [
            { model: 'profile-without-base-url' },
            { model: 'profile-with-empty-base-url', baseUrl: '   ' },
            { model: 'profile-with-base-url', baseUrl: 'https://custom.example/v1' },
          ],
        },
      },
    });

    expect(ids(response.image)).not.toContain('root-without-base-url');
    expect(ids(response.image)).not.toContain('profile-without-base-url');
    expect(ids(response.image)).not.toContain('profile-with-empty-base-url');
    expect(ids(response.image)).toContain('profile-with-base-url');
  });

  it('lets runnable custom-image profiles shadow built-in ids in /api/media/models', () => {
    const response = buildDaemonModelsRegistry({
      providers: {
        'custom-image': {
          profiles: [
            { model: 'gpt-image-2', baseUrl: 'https://custom.example/v1' },
          ],
        },
      },
    });
    const matches = response.image.filter((model) => model.id === 'gpt-image-2');

    expect(matches).toHaveLength(1);
    expect(matches[0]?.provider).toBe('custom-image');
  });

  it('excludes models from unconfigured API-key providers', () => {
    const response = buildDaemonModelsRegistry({ providers: {} });
    expect(ids(response.image)).not.toContain('gpt-image-2');
    expect(ids(response.image)).not.toContain('image-01');
    expect(ids(response.video)).not.toContain('doubao-seedance-2-0-260128');
  });

  it('keeps credential-free integrated models discoverable on empty config', () => {
    const response = buildDaemonModelsRegistry({ providers: {} });
    expect(ids(response.video)).toContain('hyperframes-html');
    expect(ids(response.image)).not.toContain('gpt-image-2');
    expect(ids(response.video)).not.toContain('doubao-seedance-2-0-260128');
  });

  it('excludes models from external provider not marked configured', () => {
    const response = buildDaemonModelsRegistry({
      providers: {
        google: { configured: false },
      },
    });
    expect(response.image.filter((m) => m.provider === 'google')).toEqual([]);
    expect(response.video.filter((m) => m.provider === 'google')).toEqual([]);
  });

  it('excludes models from external provider whose readiness probe failed', () => {
    const response = buildDaemonModelsRegistry({
      providers: {
        google: { configured: true, ready: false },
      },
    });
    expect(ids(response.image)).not.toContain('imagen-4');
    expect(ids(response.image)).not.toContain('gemini-3-pro-image-preview');
  });

  it('excludes generic custom-image placeholder when no baseUrl or runnable profiles exist', () => {
    const response = buildDaemonModelsRegistry({
      providers: {
        'custom-image': {},
      },
    });
    expect(ids(response.image)).not.toContain('custom-image');
  });

  it('promotes custom-image models when top-level baseUrl is configured', () => {
    const response = buildDaemonModelsRegistry({
      providers: {
        'custom-image': { baseUrl: 'https://custom.example/v1', model: 'flux-custom' },
      },
    });
    expect(ids(response.image)).toContain('flux-custom');
  });

  it('promotes custom-image profile models when runnable profiles exist', () => {
    const response = buildDaemonModelsRegistry({
      providers: {
        'custom-image': {
          profiles: [{ model: 'flux-custom', baseUrl: 'https://custom.example/v1' }],
        },
      },
    });
    expect(ids(response.image)).toContain('flux-custom');
  });
});
