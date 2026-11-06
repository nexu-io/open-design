import { describe, expect, it } from 'vitest';

import type { MediaProviderCredentials } from '../../src/types';
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
} from '../../src/media/models';
import { resolveDefaultMediaModel } from '../../src/media/default-model';

function creds(overrides: Partial<MediaProviderCredentials> = {}): MediaProviderCredentials {
  return { apiKey: '', baseUrl: '', ...overrides };
}

describe('resolveDefaultMediaModel', () => {
  it('falls back to the catalog default when no provider is configured', () => {
    expect(resolveDefaultMediaModel('image')).toBe(DEFAULT_IMAGE_MODEL);
    expect(resolveDefaultMediaModel('image', {})).toBe(DEFAULT_IMAGE_MODEL);
    expect(resolveDefaultMediaModel('video')).toBe(DEFAULT_VIDEO_MODEL);
  });

  it('seeds the configured OpenAI model instead of the Cloud default', () => {
    expect(
      resolveDefaultMediaModel('image', { openai: creds({ apiKey: 'sk-test' }) }),
    ).toBe('gpt-image-2');
  });

  it('never treats credential-free Cloud providers as configured', () => {
    expect(
      resolveDefaultMediaModel('image', {
        vela: creds({ apiKeyTail: 'cloud' }),
        openai: creds({ apiKey: 'sk-test' }),
      }),
    ).toBe('gpt-image-2');
  });

  it('seeds the Custom Image API model when it is the only configured provider', () => {
    expect(
      resolveDefaultMediaModel('image', {
        'custom-image': creds({ apiKey: 'k', baseUrl: 'https://gateway.example/v1' }),
      }),
    ).toBe('custom-image');
  });

  it('ignores providers without a daemon integration', () => {
    expect(
      resolveDefaultMediaModel('image', { bfl: creds({ apiKey: 'k' }) }),
    ).toBe(DEFAULT_IMAGE_MODEL);
  });

  it('seeds the configured Volcengine video model', () => {
    expect(
      resolveDefaultMediaModel('video', { volcengine: creds({ apiKey: 'k' }) }),
    ).toBe('doubao-seedance-2-0-260128');
  });
});
