import { describe, expect, it } from 'vitest';

import { supportedModels } from '../../src/components/NewProjectPanel';
import { AUDIO_MODELS_BY_KIND, IMAGE_MODELS } from '../../src/media/models';

describe('NewProjectPanel image provider visibility', () => {
  it('shows Nano Banana in supported image models', () => {
    const models = supportedModels('image', IMAGE_MODELS);
    expect(models.some((model) => model.provider === 'nanobanana')).toBe(true);
    expect(models.some((model) => model.id === 'gemini-3.1-flash-image-preview')).toBe(true);
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
});
