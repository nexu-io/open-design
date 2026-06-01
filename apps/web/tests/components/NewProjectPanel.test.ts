import { describe, expect, it } from 'vitest';

import { supportedModels } from '../../src/components/NewProjectPanel';
import { AUDIO_MODELS_BY_KIND, IMAGE_MODELS, VIDEO_MODELS } from '../../src/media/models';
import { SENSEAUDIO_VOICES } from '../../src/media/senseaudio-voices';

describe('NewProjectPanel image provider visibility', () => {
  it('shows Nano Banana in supported image models', () => {
    const models = supportedModels('image', IMAGE_MODELS);
    expect(models.some((model) => model.provider === 'nanobanana')).toBe(true);
    expect(models.some((model) => model.id === 'gemini-3.1-flash-image-preview')).toBe(true);
  });

  it('shows SenseAudio image models in supported image models', () => {
    const models = supportedModels('image', IMAGE_MODELS);
    expect(models.some((model) => model.provider === 'senseaudio')).toBe(true);
    expect(models.some((model) => model.id === 'senseaudio-image-2.0-260319')).toBe(true);
  });

  it('shows the SenseAudio video model in supported video models', () => {
    const models = supportedModels('video', VIDEO_MODELS);
    expect(models.some((model) => model.id === 'senseaudio-video-2.0-260128')).toBe(true);
    // The catalog id must stay distinct from volcengine's same-wire entry so
    // the dispatcher routes generation through the senseaudio branch.
    const collision = VIDEO_MODELS.filter((m) => m.id === 'senseaudio-video-2.0-260128');
    expect(collision).toHaveLength(1);
    expect(collision[0]?.provider).toBe('senseaudio');
  });

  it('shows ElevenLabs speech models in supported audio models', () => {
    const models = supportedModels('audio', AUDIO_MODELS_BY_KIND.speech);
    expect(models.some((model) => model.provider === 'elevenlabs')).toBe(true);
    expect(models.some((model) => model.id === 'elevenlabs-v3')).toBe(true);
  });

  it('shows ElevenLabs sound effects models in supported audio models', () => {
    const models = supportedModels('audio', AUDIO_MODELS_BY_KIND.sfx);
    expect(models.some((model) => model.id === 'elevenlabs-sfx')).toBe(true);
  });

  it('exposes the SenseAudio speech model so its voice catalogue is reachable', () => {
    const models = supportedModels('audio', AUDIO_MODELS_BY_KIND.speech);
    expect(models.some((model) => model.id === 'senseaudio-tts')).toBe(true);
  });

  it('shows OpenRouter in supported image models', () => {
    const models = supportedModels('image', IMAGE_MODELS);
    expect(models.some((model) => model.provider === 'openrouter')).toBe(true);
  });

  it('shows OpenRouter in supported video models', () => {
    const models = supportedModels('video', VIDEO_MODELS);
    expect(models.some((model) => model.provider === 'openrouter')).toBe(true);
  });
});

describe('SenseAudio voice catalogue', () => {
  it('is non-empty and has unique voice ids', () => {
    expect(SENSEAUDIO_VOICES.length).toBeGreaterThan(0);
    const ids = SENSEAUDIO_VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses well-formed entries', () => {
    for (const v of SENSEAUDIO_VOICES) {
      expect(v.id).toMatch(/^[a-z]+_\d{4}_[a-z]$/);
      expect(v.name.trim().length).toBeGreaterThan(0);
      expect(['male', 'female', 'child']).toContain(v.kind);
    }
  });
});
