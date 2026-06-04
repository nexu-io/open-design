import { describe, expect, it } from 'vitest';

import { mediaModelProviderId } from '../../src/media/models';

// mediaModelProviderId is the decision core of ProjectView's BYOK seed guard
// (byokModelSeedForProtocol): the project's creation-time model is only carried
// into the conversation when its provider matches the active protocol. These
// cases mirror that gate's outcomes against the real registry.
describe('mediaModelProviderId', () => {
  it('resolves AIHubMix live-catalogue ids by prefix without the static registry', () => {
    // The live catalogue (50+ ids) is not seeded into IMAGE_MODELS, so the
    // `aihubmix-` namespace must resolve synchronously — this is what lets the
    // AIHubMix seed survive before the async catalogue fetch resolves.
    expect(mediaModelProviderId('aihubmix-qwen-image-2-pro')).toBe('aihubmix');
    expect(mediaModelProviderId('aihubmix-doubao-seedance-2-0-260128')).toBe('aihubmix');
  });

  it('resolves seeded AIHubMix ids to aihubmix', () => {
    expect(mediaModelProviderId('aihubmix-gpt-image-1')).toBe('aihubmix');
  });

  it('resolves static models to their registry provider', () => {
    // gpt-image-2 is the New Project dialog default → provider openai. On a
    // SenseAudio run this !== 'senseaudio', so the guard drops the seed and the
    // user's Settings default is kept.
    expect(mediaModelProviderId('gpt-image-2')).toBe('openai');
    expect(mediaModelProviderId('senseaudio-image-2.0-260319')).toBe('senseaudio');
    expect(mediaModelProviderId('senseaudio-tts')).toBe('senseaudio');
  });

  it('returns undefined for unknown ids', () => {
    expect(mediaModelProviderId('totally-made-up-model')).toBeUndefined();
    expect(mediaModelProviderId('')).toBeUndefined();
  });

  // The guard itself is `mediaModelProviderId(picked) === protocol`. Spell out
  // the four scenarios from the design discussion so the decision is pinned.
  it('drives the seed guard: carry only when provider matches the active protocol', () => {
    const carries = (modelId: string, protocol: string) =>
      mediaModelProviderId(modelId) === protocol;

    // AIHubMix run + AIHubMix pick → carried.
    expect(carries('aihubmix-qwen-image-2-pro', 'aihubmix')).toBe(true);
    // SenseAudio run + dialog-default gpt-image-2 → NOT carried (keeps Settings default).
    expect(carries('gpt-image-2', 'senseaudio')).toBe(false);
    // SenseAudio run + SenseAudio pick → carried.
    expect(carries('senseaudio-image-2.0-260319', 'senseaudio')).toBe(true);
    // Non-BYOK run never matches (byokImageModel is ignored daemon-side anyway).
    expect(carries('gpt-image-2', 'official')).toBe(false);
  });
});
