import { describe, expect, it } from 'vitest';

import {
  buildVideoRequest,
  createCapabilityRegistry,
  deriveVideoFamily,
  normalizeModelId,
  snapDuration,
  snapResolutionToken,
  snapVeoSize,
  snapSizeToSupported,
  aihubmixMediaRegistry,
  type ModelCapability,
} from '../src/media-adapters/index.js';

const SEEDANCE: ModelCapability = {
  id: 'doubao-seedance-2-0-260128',
  apiModel: 'doubao-seedance-2-0-260128',
  mediaType: 'video',
  family: 'seedance',
  caps: ['t2v', 'i2v'],
};

const VEO: ModelCapability = {
  id: 'veo-3.1-generate-preview',
  apiModel: 'veo-3.1-generate-preview',
  mediaType: 'video',
  family: 'veo',
  caps: ['t2v'], // veo is text-to-video only on the AIHubMix gateway
  supportedDurations: [4, 6, 8],
};

const SORA: ModelCapability = {
  id: 'sora-2',
  apiModel: 'sora-2',
  mediaType: 'video',
  family: 'generic',
  caps: ['t2v', 'i2v'],
  supportedDurations: [4, 8, 12],
  supportedSizes: ['720x1280', '1280x720'],
};

const DATA_URL = 'data:image/png;base64,aGVsbG8=';

describe('media-adapters registry', () => {
  it('normalizes the aihubmix- prefix on lookup', () => {
    expect(normalizeModelId('aihubmix-doubao-seedance-2-0-260128')).toBe('doubao-seedance-2-0-260128');
    const reg = createCapabilityRegistry([SEEDANCE]);
    expect(reg.get('aihubmix-doubao-seedance-2-0-260128')?.id).toBe(SEEDANCE.id);
    expect(reg.get('doubao-seedance-2-0-260128')?.id).toBe(SEEDANCE.id);
  });

  it('default registry is seeded with known video models', () => {
    expect(aihubmixMediaRegistry.get('doubao-seedance-2-0-260128')?.family).toBe('seedance');
    expect(aihubmixMediaRegistry.get('sora-2')?.family).toBe('generic');
    expect(aihubmixMediaRegistry.get('veo-3.1-generate-preview')?.family).toBe('veo');
    expect(aihubmixMediaRegistry.get('veo-3.1-lite-generate-preview')?.family).toBe('veo');
  });
});

describe('deriveVideoFamily', () => {
  it('routes seedance / wan / veo / generic by wire name', () => {
    expect(deriveVideoFamily('doubao-seedance-2-0-260128')).toBe('seedance');
    expect(deriveVideoFamily('wan2.5-i2v-preview')).toBe('wan');
    expect(deriveVideoFamily('happyhorse-1.0-i2v')).toBe('wan');
    expect(deriveVideoFamily('veo-3.1-generate-preview')).toBe('veo');
    expect(deriveVideoFamily('veo-3.1-lite-generate-preview')).toBe('veo');
    expect(deriveVideoFamily('sora-2')).toBe('generic');
  });
});

describe('snapDuration', () => {
  it('snaps to the family allowed set (ties → shorter), clamps when unconstrained', () => {
    expect(snapDuration(VEO, 5)).toBe(4); // veo 4/6/8, tie→shorter
    expect(snapDuration(VEO, 7)).toBe(6);
    expect(snapDuration(VEO, 10)).toBe(8);
    expect(snapDuration(SEEDANCE, 5)).toBe(5); // no constraint → clamp 3-12
    expect(snapDuration(SEEDANCE, 99)).toBe(12);
  });
});

describe('buildVideoRequest — seedance family', () => {
  it('t2v: builds a multimodal content array with the prompt', () => {
    const built = buildVideoRequest(SEEDANCE, { prompt: 'a panda', durationSeconds: 5 });
    expect(built.family).toBe('seedance');
    expect(built.pathSuffix).toBe('/videos');
    expect(built.contentType).toBe('application/json');
    expect(built.hasReference).toBe(false);
    expect(built.body.model).toBe('doubao-seedance-2-0-260128');
    expect(built.body.duration).toBe(5);
    expect(built.body.content).toEqual([{ type: 'text', text: 'a panda' }]);
    expect(built.body.input_reference).toBeUndefined();
  });

  it('i2v: adds the reference image as image_url with role first_frame', () => {
    const built = buildVideoRequest(SEEDANCE, {
      prompt: 'animate the panda',
      durationSeconds: 5,
      imageRef: { dataUrl: DATA_URL },
    });
    expect(built.hasReference).toBe(true);
    const content = built.body.content as any[];
    expect(content[0]).toEqual({ type: 'text', text: 'animate the panda' });
    expect(content[1]).toEqual({
      type: 'image_url',
      image_url: { url: DATA_URL },
      role: 'first_frame',
    });
  });

  it('i2v: never sends a WxH pixel size as resolution (Seedance 400s on that)', () => {
    // Regression: the aihubmix video tool passes size=1280x720 (aspect-derived)
    // but no resolution token. Seedance rejected "1280x720" with
    // "the parameter resolution ... is not valid for model ... in i2v".
    const built = buildVideoRequest(SEEDANCE, {
      prompt: 'animate it',
      durationSeconds: 5,
      size: '1280x720',
      imageRef: { dataUrl: DATA_URL },
    });
    expect(built.body.resolution).toBe('720p'); // token, NOT "1280x720"
  });

  it('i2v: an explicit resolution token wins over size', () => {
    const built = buildVideoRequest(SEEDANCE, {
      prompt: 'animate it',
      resolution: '1080p',
      size: '1280x720',
    });
    expect(built.body.resolution).toBe('1080p');
  });
});

describe('snapVeoSize', () => {
  it('passes through known-good Veo sizes', () => {
    expect(snapVeoSize('1280x720')).toBe('1280x720');
    expect(snapVeoSize('720x1280')).toBe('720x1280');
    expect(snapVeoSize('1920x1080')).toBe('1920x1080');
  });
  it('maps out-of-range sizes to the nearest orientation at 720p', () => {
    expect(snapVeoSize('1024x1024')).toBe('1280x720'); // square → landscape
    expect(snapVeoSize('960x720')).toBe('1280x720'); // 4:3 → landscape
    expect(snapVeoSize('720x960')).toBe('720x1280'); // 3:4 → portrait
  });
  it('defaults to landscape 720p when nothing usable is supplied', () => {
    expect(snapVeoSize(undefined)).toBe('1280x720');
    expect(snapVeoSize('garbage')).toBe('1280x720');
  });
});

describe('snapSizeToSupported', () => {
  const SUP = ['720x1280', '1280x720'];
  it('returns the size unchanged when the model declares no constraint', () => {
    expect(snapSizeToSupported('1024x1024', undefined)).toBe('1024x1024');
    expect(snapSizeToSupported('1024x1024', [])).toBe('1024x1024');
  });
  it('passes through an exact supported value (case/×-insensitive)', () => {
    expect(snapSizeToSupported('1280x720', SUP)).toBe('1280x720');
    expect(snapSizeToSupported('1280X720', SUP)).toBe('1280x720');
    expect(snapSizeToSupported('720×1280', SUP)).toBe('720x1280');
  });
  it('maps an unsupported size to a supported one of the same orientation', () => {
    expect(snapSizeToSupported('1024x1024', SUP)).toBe('1280x720'); // square → landscape
    expect(snapSizeToSupported('960x720', SUP)).toBe('1280x720'); // 4:3 landscape
    expect(snapSizeToSupported('720x960', SUP)).toBe('720x1280'); // 3:4 portrait
  });
  it('falls back to the first supported size when input is missing/unparseable', () => {
    expect(snapSizeToSupported(undefined, SUP)).toBe('1280x720');
    expect(snapSizeToSupported('garbage', SUP)).toBe('1280x720');
  });
});

describe('snapResolutionToken', () => {
  it('passes through valid tokens (case-insensitive)', () => {
    expect(snapResolutionToken('720p', undefined)).toBe('720p');
    expect(snapResolutionToken('1080P', undefined)).toBe('1080p');
    expect(snapResolutionToken('480p', '1920x1080')).toBe('480p'); // token wins
  });

  it('maps a WxH pixel size to the nearest token by short side', () => {
    expect(snapResolutionToken(undefined, '1280x720')).toBe('720p');
    expect(snapResolutionToken(undefined, '1920x1080')).toBe('1080p');
    expect(snapResolutionToken(undefined, '854x480')).toBe('480p');
    expect(snapResolutionToken(undefined, '720x1280')).toBe('720p'); // portrait
  });

  it('defaults to 720p when nothing usable is supplied', () => {
    expect(snapResolutionToken(undefined, undefined)).toBe('720p');
    expect(snapResolutionToken('garbage', 'nope')).toBe('720p');
  });
});

describe('buildVideoRequest — wan family (happyhorse / wan*)', () => {
  const HAPPYHORSE: ModelCapability = {
    id: 'happyhorse-1.0-i2v',
    apiModel: 'happyhorse-1.0-i2v',
    mediaType: 'video',
    family: 'wan',
    caps: ['i2v'],
    supportedFrameImages: ['first_frame'],
    supportedResolutions: ['480P', '720P', '1080P'],
  };
  const DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

  it('routes happyhorse* / wan* to the wan family by name', () => {
    expect(deriveVideoFamily('happyhorse-1.0-i2v')).toBe('wan');
    expect(deriveVideoFamily('wan2.6-i2v')).toBe('wan');
    expect(deriveVideoFamily('wan2.5-t2v-preview')).toBe('wan');
  });

  it('i2v: builds the DashScope input.media + parameters shape', () => {
    const built = buildVideoRequest(HAPPYHORSE, {
      prompt: 'cat stretches',
      durationSeconds: 5,
      size: '1280x720',
      imageRef: { dataUrl: DATA_URL },
    });
    expect(built.family).toBe('wan');
    expect(built.hasReference).toBe(true);
    // No flat top-level prompt / input_reference — those were the broken shape.
    expect(built.body.prompt).toBeUndefined();
    expect(built.body.input_reference).toBeUndefined();
    expect(built.body).toMatchObject({
      model: 'happyhorse-1.0-i2v',
      input: {
        prompt: 'cat stretches',
        media: [{ type: 'first_frame', url: DATA_URL }],
      },
      parameters: {
        resolution: '720P', // uppercase token, NOT "1280x720"
        duration: 5,
        prompt_extend: true,
        watermark: false,
      },
    });
  });

  it('t2v: omits media when there is no reference image', () => {
    const built = buildVideoRequest(
      { ...HAPPYHORSE, id: 'wan2.5-t2v-preview', apiModel: 'wan2.5-t2v-preview', caps: ['t2v'] },
      { prompt: 'a sunset', durationSeconds: 5 },
    );
    expect((built.body.input as any).media).toBeUndefined();
    expect((built.body.input as any).prompt).toBe('a sunset');
    expect((built.body.parameters as any).resolution).toBe('720P');
  });
});

describe('buildVideoRequest — veo family', () => {
  it('t2v: seconds is a NUMBER and size only — no aspect_ratio (Gemini shim 400s otherwise)', () => {
    // Regression: the chat video tool always derives an aspect-based size AND an
    // aspect_ratio, and the generic branch sent seconds as the string "8". The
    // gateway's OpenAI→Gemini predictLongRunning shim wants an integer and only
    // honours `size`; the string + extra aspect_ratio made veo fail.
    const built = buildVideoRequest(VEO, {
      prompt: 'a sunset',
      durationSeconds: 5, // veo → snapped to 4
      aspectRatio: '16:9',
      size: '1280x720',
    });
    expect(built.family).toBe('veo');
    expect(built.body).toMatchObject({
      model: 'veo-3.1-generate-preview',
      prompt: 'a sunset',
      seconds: 4, // NUMBER, not "4"
      size: '1280x720',
    });
    expect(typeof built.body.seconds).toBe('number');
    expect(built.body.aspect_ratio).toBeUndefined();
    expect(built.body.resolution).toBeUndefined(); // never an explicit resolution
    expect(built.body.input_reference).toBeUndefined();
  });

  it('snaps an out-of-range size (1:1) to a valid landscape Veo size (Gemini shim 400s on 1024p)', () => {
    const built = buildVideoRequest(VEO, {
      prompt: 'square clip',
      durationSeconds: 8,
      size: '1024x1024', // 1:1 → gateway would derive an invalid 1024p
    });
    expect(built.body.size).toBe('1280x720');
  });

  it('t2v-only: never emits input_reference even if a reference image is passed', () => {
    // veo rejects every reference form on the gateway; the builder must not put
    // one on the wire. (The caller gates i2v out via caps before reaching here.)
    const built = buildVideoRequest(VEO, {
      prompt: 'clip',
      durationSeconds: 6,
      imageRef: { dataUrl: DATA_URL },
    });
    expect(built.body.input_reference).toBeUndefined();
    expect(built.body.seconds).toBe(6);
  });
});

describe('buildVideoRequest — generic family (sora)', () => {
  it('t2v: flat body with seconds string + size, NO aspect_ratio (Sora rejects it), no input_reference', () => {
    const built = buildVideoRequest(SORA, {
      prompt: 'a sunset',
      durationSeconds: 5, // sora 4/8/12 → snapped to 4
      aspectRatio: '16:9', // supplied by the caller but must NOT reach the wire
      size: '1280x720',
    });
    expect(built.family).toBe('generic');
    expect(built.body).toMatchObject({
      model: 'sora-2',
      prompt: 'a sunset',
      seconds: '4', // generic keeps the string shape sora expects
      size: '1280x720',
    });
    // Regression: Sora 400s with "Unknown parameter: 'aspect_ratio'".
    expect(built.body.aspect_ratio).toBeUndefined();
    expect(built.body.input_reference).toBeUndefined();
  });

  it('snaps an unsupported size (1:1) to a supported one (Sora 400s on 1024x1024)', () => {
    const built = buildVideoRequest(SORA, {
      prompt: 'square',
      durationSeconds: 8,
      size: '1024x1024', // not in Sora's supported set
    });
    expect(built.body.size).toBe('1280x720'); // square → landscape
  });

  it('snaps a portrait-ish size to the supported portrait size', () => {
    const built = buildVideoRequest(SORA, {
      prompt: 'tall',
      durationSeconds: 8,
      size: '720x960', // 3:4 portrait, unsupported
    });
    expect(built.body.size).toBe('720x1280');
  });

  it('i2v: attaches input_reference as the data URL', () => {
    const built = buildVideoRequest(SORA, {
      prompt: 'clip',
      durationSeconds: 8,
      imageRef: { dataUrl: DATA_URL },
    });
    expect(built.hasReference).toBe(true);
    expect(built.body.input_reference).toBe(DATA_URL);
    expect(built.body.seconds).toBe('8');
  });
});

describe('buildVideoRequest — apiModelI2V + passthrough', () => {
  it('switches to apiModelI2V when a reference image is present', () => {
    const cap: ModelCapability = {
      id: 'wan2.5',
      apiModel: 'wan2.5-t2v-preview',
      apiModelI2V: 'wan2.5-i2v-preview',
      mediaType: 'video',
      family: 'generic',
      caps: ['t2v', 'i2v'],
    };
    expect(buildVideoRequest(cap, { prompt: 'x' }).wireModel).toBe('wan2.5-t2v-preview');
    expect(buildVideoRequest(cap, { prompt: 'x', imageRef: { dataUrl: DATA_URL } }).wireModel).toBe(
      'wan2.5-i2v-preview',
    );
  });

  it('merges extraBodyDefaults and only whitelisted passthrough keys', () => {
    const cap: ModelCapability = {
      id: 'm',
      apiModel: 'm',
      mediaType: 'video',
      family: 'generic',
      caps: ['t2v'],
      allowedPassthroughParameters: ['mode'],
      extraBodyDefaults: [{ name: 'mode', type: 'string', default: 'std' }],
    };
    const built = buildVideoRequest(cap, {
      prompt: 'x',
      passthrough: { mode: 'pro', not_allowed: 'drop-me' },
    });
    expect(built.body.mode).toBe('pro'); // passthrough overrides default
    expect(built.body.not_allowed).toBeUndefined(); // non-whitelisted dropped
  });
});
