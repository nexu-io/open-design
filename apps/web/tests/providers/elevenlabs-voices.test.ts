import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchElevenLabsVoiceOptions } from '../../src/providers/elevenlabs-voices';

describe('fetchElevenLabsVoiceOptions', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
  });

  it('throws a descriptive error when the lookup response is not ok', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: 'upstream temporarily unavailable',
    }), {
      status: 502,
      statusText: 'Bad Gateway',
      headers: {
        'content-type': 'application/json',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchElevenLabsVoiceOptions()).rejects.toThrow(
      /ElevenLabs voice list could not be loaded \(502 Bad Gateway\): upstream temporarily unavailable/i,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/media/providers/elevenlabs/voices?limit=100',
      expect.any(Object),
    );
  });
});
