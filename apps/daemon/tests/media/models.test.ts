import { describe, expect, it } from 'vitest';

import {
  IMAGE_MODELS,
  MEDIA_PROVIDERS,
  canonicalMediaModelId,
  findMediaModel,
} from '../../src/media/models.js';

describe('image model defaults', () => {
  it('uses Vela as the only default image route', () => {
    expect(IMAGE_MODELS.filter((model) => model.default).map((model) => model.id)).toEqual([
      'vela/gpt-image-2',
    ]);
    expect(MEDIA_PROVIDERS.some((provider) => provider.id === 'codex')).toBe(false);
    expect(IMAGE_MODELS.some((model) => model.provider === 'codex')).toBe(false);
  });

  it('migrates the removed Codex image model id to Vela', () => {
    expect(canonicalMediaModelId('codex-gpt-image-2')).toBe('vela/gpt-image-2');
  });

  it('preserves explicit OpenAI BYOK model selection', () => {
    expect(canonicalMediaModelId('gpt-image-2')).toBe('gpt-image-2');
    expect(findMediaModel('gpt-image-2')?.provider).toBe('openai');
  });
});
