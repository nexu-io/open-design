/**
 * Single source of truth for the media-generation model registry.
 *
 * Both the frontend (NewProjectPanel model pickers, Settings dialog
 * provider list) and the daemon (od media generate dispatcher) consume
 * this registry. When you add a model entry here, the picker shows it,
 * the daemon can dispatch to it, and the Settings dialog knows which
 * API keys are needed.
 *
 * The model catalogue mirrors the breadth of lobehub's model-bank:
 * every image / video model that lobehub natively supports is listed
 * here so the user can pick from the same surface area without us
 * re-implementing every provider's transport. For provider integrations
 * we only ship the two flagship paths today — OpenAI (gpt-image-*) and
 * Volcengine Ark (Seedance 2.0) — the rest fall back to a placeholder
 * with a clear "no provider integration yet" note. The contract the
 * code agent follows is identical regardless.
 *
 * The daemon imports the JS mirror of this file at
 * daemon/media-models.js (kept in sync by review).
 */

import type { AudioKind, MediaAspect } from '../types';

/**
 * Provider identifier — used both as a grouping key in the picker and as
 * the lookup key for API-credentials in `AppConfig.mediaProviders`. New
 * providers must be added to {@link MEDIA_PROVIDERS} below.
 */
export type MediaProviderId =
  | 'openai'
  | 'volcengine'
  | 'grok'
  | 'hyperframes'
  | 'nanobanana'
  | 'bfl'
  | 'fal'
  | 'replicate'
  | 'google'
  | 'midjourney'
  | 'kling'
  | 'minimax'
  | 'suno'
  | 'udio'
  | 'elevenlabs'
  | 'fishaudio'
  | 'tavily'
  | 'stub';

export interface MediaProvider {
  id: MediaProviderId;
  /** Display name shown in Settings + ModelPicker headers. */
  label: string;
  /** Short marketing-style sub-label. */
  hint: string;
  /** Whether the daemon ships a real integration for this provider. */
  integrated: boolean;
  /** Whether the provider needs user-supplied credentials. */
  credentialsRequired?: boolean;
  /** Whether the provider should appear in Settings -> Media. */
  settingsVisible?: boolean;
  /** Default base URL the daemon hits when no override is configured. */
  defaultBaseUrl?: string;
  /** Documentation URL for getting an API key. */
  docsUrl?: string;
  /** Whether Settings should expose a custom model override field. */
  supportsCustomModel?: boolean;
}

/**
 * Catalogue of providers. The Settings dialog renders one section per
 * entry; the new-project model picker uses {@link integrated} to flag
 * cards that will silently fall back to a stub if the user hasn't
 * configured a key.
 */
export const MEDIA_PROVIDERS: MediaProvider[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    hint: 'gpt-image-2 / dall-e-3',
    integrated: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'volcengine',
    label: 'Volcengine Ark (Doubao)',
    hint: 'Seedance 2.0 / Seedream',
    integrated: true,
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    docsUrl: 'https://console.volcengine.com/ark',
  },
  {
    id: 'grok',
    label: 'xAI Grok Imagine',
    hint: 'grok-imagine — image + video with native audio',
    integrated: true,
    defaultBaseUrl: 'https://api.x.ai/v1',
    docsUrl: 'https://docs.x.ai/developers/model-capabilities/video/generation',
  },
  {
    id: 'hyperframes',
    label: 'HyperFrames',
    hint: 'Local HTML -> MP4 renderer',
    integrated: true,
    credentialsRequired: false,
    settingsVisible: false,
    docsUrl: 'https://hyperframes.heygen.com',
  },
  {
    id: 'nanobanana',
    label: 'Nano Banana',
    hint: 'Google official by default; custom gateway configurable',
    integrated: true,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/api-key',
    supportsCustomModel: true,
  },
  {
    id: 'bfl',
    label: 'Black Forest Labs',
    hint: 'FLUX 1.1 Pro / FLUX Pro / Dev',
    integrated: false,
    defaultBaseUrl: 'https://api.bfl.ai',
    docsUrl: 'https://docs.bfl.ai/quick_start/create_account',
  },
  {
    id: 'fal',
    label: 'Fal.ai',
    hint: 'Sora / Seedance / Veo / FLUX',
    integrated: false,
    defaultBaseUrl: 'https://fal.run',
    docsUrl: 'https://fal.ai/dashboard/keys',
  },
  {
    id: 'replicate',
    label: 'Replicate',
    hint: 'FLUX / SDXL / Ideogram',
    integrated: false,
    defaultBaseUrl: 'https://api.replicate.com/v1',
    docsUrl: 'https://replicate.com/account/api-tokens',
  },
  {
    id: 'google',
    label: 'Google AI / Vertex',
    hint: 'Imagen 4 / Veo 3 / Lyria',
    integrated: false,
    docsUrl: 'https://ai.google.dev/gemini-api/docs/api-key',
  },
  {
    id: 'kling',
    label: 'Kuaishou Kling',
    hint: 'Kling 1.6 / 2.0 video',
    integrated: false,
    docsUrl: 'https://klingai.com/dev-center',
  },
  {
    id: 'midjourney',
    label: 'Midjourney (proxy)',
    hint: 'midjourney-v7',
    integrated: false,
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    hint: 'TTS / video-01',
    integrated: true,
    defaultBaseUrl: 'https://api.minimaxi.chat/v1',
    docsUrl: 'https://platform.minimaxi.com',
  },
  {
    id: 'suno',
    label: 'Suno',
    hint: 'Music generation',
    integrated: false,
  },
  {
    id: 'udio',
    label: 'Udio',
    hint: 'Music generation',
    integrated: false,
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    hint: 'Voice / SFX',
    integrated: true,
    defaultBaseUrl: 'https://api.elevenlabs.io',
    docsUrl: 'https://elevenlabs.io/app/settings/api-keys',
  },
  {
    id: 'fishaudio',
    label: 'FishAudio',
    hint: 'Speech / voice clone',
    integrated: true,
    defaultBaseUrl: 'https://api.fish.audio',
    docsUrl: 'https://fish.audio',
  },
  {
    id: 'tavily',
    label: 'Tavily Search',
    hint: 'Agent-callable web research',
    integrated: true,
    defaultBaseUrl: 'https://api.tavily.com',
    docsUrl: 'https://app.tavily.com/home',
  },
  {
    id: 'stub',
    label: 'Stub (placeholder)',
    hint: 'Deterministic local placeholder bytes',
    integrated: true,
  },
];

export interface MediaModel {
  /** Stable ID used in metadata.imageModel / videoModel / audioModel. */
  id: string;
  /** Short label shown in pickers. */
  label: string;
  /** Vendor / context hint shown under the label. */
  hint: string;
  /** Provider this model is dispatched through. */
  provider: MediaProviderId;
  /**
   * Capabilities the agent may rely on when planning. Used downstream by
   * the dispatcher to decide which provider call to make.
   */
  caps?: string[];
  /** Marks the default-checked card per surface in the picker. */
  default?: boolean;
}

/**
 * Image generation models. Mirrors the breadth of
 * `packages/model-bank/src/aiModels/openai.ts` and friends in lobehub.
 */
export const IMAGE_MODELS: MediaModel[] = [
  // OpenAI — fully integrated path.
  {
    id: 'gpt-image-2',
    label: 'gpt-image-2',
    hint: 'OpenAI · 4K, native multimodal',
    provider: 'openai',
    caps: ['t2i', 'i2i', 'inpaint'],
    default: true,
  },
  {
    id: 'gpt-image-1.5',
    label: 'gpt-image-1.5',
    hint: 'OpenAI · 4× faster than gpt-image-1',
    provider: 'openai',
    caps: ['t2i', 'i2i', 'inpaint'],
  },
  {
    id: 'gpt-image-1',
    label: 'gpt-image-1',
    hint: 'OpenAI · ChatGPT native',
    provider: 'openai',
    caps: ['t2i', 'i2i', 'inpaint'],
  },
  {
    id: 'gpt-image-1-mini',
    label: 'gpt-image-1-mini',
    hint: 'OpenAI · low-cost variant',
    provider: 'openai',
    caps: ['t2i', 'i2i'],
  },
  {
    id: 'dall-e-3',
    label: 'dall-e-3',
    hint: 'OpenAI · classic',
    provider: 'openai',
    caps: ['t2i'],
  },
  {
    id: 'dall-e-2',
    label: 'dall-e-2',
    hint: 'OpenAI · legacy',
    provider: 'openai',
    caps: ['t2i'],
  },

  // Volcengine — Doubao Seedream image generation.
  {
    id: 'doubao-seedream-3-0-t2i-250415',
    label: 'seedream-3.0',
    hint: 'ByteDance · Doubao image',
    provider: 'volcengine',
    caps: ['t2i'],
  },
  {
    id: 'doubao-seededit-3-0-i2i-250628',
    label: 'seededit-3.0',
    hint: 'ByteDance · image edit',
    provider: 'volcengine',
    caps: ['i2i'],
  },

  // xAI Grok Imagine — text-to-image (1k/2k, 11+ aspect ratios).
  {
    id: 'grok-imagine-image',
    label: 'grok-imagine-image',
    hint: 'xAI · 2K text-to-image',
    provider: 'grok',
    caps: ['t2i'],
  },

  // Nano Banana — Google-compatible generateContent image path.
  {
    id: 'gemini-3.1-flash-image-preview',
    label: 'nano-banana-2',
    hint: 'Nano Banana · text-to-image',
    provider: 'nanobanana',
    caps: ['t2i'],
  },

  // Black Forest Labs FLUX family.
  { id: 'flux-1.1-pro', label: 'flux-1.1-pro', hint: 'BFL · flagship', provider: 'bfl', caps: ['t2i', 'i2i'] },
  { id: 'flux-pro', label: 'flux-pro', hint: 'BFL', provider: 'bfl', caps: ['t2i'] },
  { id: 'flux-dev', label: 'flux-dev', hint: 'BFL · open weights', provider: 'bfl', caps: ['t2i'] },
  { id: 'flux-schnell', label: 'flux-schnell', hint: 'BFL · fast', provider: 'bfl', caps: ['t2i'] },
  { id: 'flux-kontext-pro', label: 'flux-kontext-pro', hint: 'BFL · in-context edits', provider: 'bfl', caps: ['t2i', 'i2i'] },

  // Google.
  { id: 'imagen-4', label: 'imagen-4', hint: 'Google · latest', provider: 'google', caps: ['t2i'] },
  { id: 'imagen-3', label: 'imagen-3', hint: 'Google', provider: 'google', caps: ['t2i'] },
  { id: 'gemini-3-pro-image-preview', label: 'gemini-3-pro-image', hint: 'Google · Nano Banana Pro', provider: 'google', caps: ['t2i', 'i2i'] },

  // Replicate / Fal hosted image models.
  { id: 'ideogram-v2', label: 'ideogram-v2', hint: 'Replicate · typography', provider: 'replicate', caps: ['t2i'] },
  { id: 'sdxl', label: 'stable-diffusion-xl', hint: 'Replicate · SDXL', provider: 'replicate', caps: ['t2i'] },
  { id: 'sd-3.5', label: 'stable-diffusion-3.5', hint: 'Fal · SD 3.5', provider: 'fal', caps: ['t2i'] },

  // Midjourney via community proxies.
  { id: 'midjourney-v7', label: 'midjourney-v7', hint: 'Midjourney · via proxy', provider: 'midjourney', caps: ['t2i'] },
];

/**
 * Video generation models. Mirrors lobehub's volcengine.ts (Seedance,
 * Seedance Lite), kling.ts and friends.
 */
export const VIDEO_MODELS: MediaModel[] = [
  // Volcengine — Seedance 2.0 (integrated).
  {
    id: 'doubao-seedance-2-0-260128',
    label: 'seedance-2.0',
    hint: 'ByteDance · t2v + i2v + audio',
    provider: 'volcengine',
    caps: ['t2v', 'i2v', 'audio'],
    default: true,
  },
  {
    id: 'doubao-seedance-2-0-fast-260128',
    label: 'seedance-2.0-fast',
    hint: 'ByteDance · faster, cheaper',
    provider: 'volcengine',
    caps: ['t2v', 'i2v', 'audio'],
  },
  {
    id: 'doubao-seedance-1-0-pro-250528',
    label: 'seedance-1.0-pro',
    hint: 'ByteDance · 1.0',
    provider: 'volcengine',
    caps: ['t2v', 'i2v'],
  },
  {
    id: 'doubao-seedance-1-0-lite-i2v-250428',
    label: 'seedance-1.0-lite-i2v',
    hint: 'ByteDance · image-to-video',
    provider: 'volcengine',
    caps: ['i2v'],
  },
  {
    id: 'doubao-seedance-1-0-lite-t2v-250428',
    label: 'seedance-1.0-lite-t2v',
    hint: 'ByteDance · text-to-video',
    provider: 'volcengine',
    caps: ['t2v'],
  },

  // xAI Grok Imagine — 720p t2v + i2v with natively generated audio.
  {
    id: 'grok-imagine-video',
    label: 'grok-imagine-video',
    hint: 'xAI · 720p t2v + i2v + native audio',
    provider: 'grok',
    caps: ['t2v', 'i2v', 'audio'],
  },

  // Kuaishou Kling.
  { id: 'kling-2.0', label: 'kling-2.0', hint: 'Kuaishou · latest', provider: 'kling', caps: ['t2v', 'i2v'] },
  { id: 'kling-1.6', label: 'kling-1.6', hint: 'Kuaishou', provider: 'kling', caps: ['t2v', 'i2v'] },
  { id: 'kling-1.5', label: 'kling-1.5', hint: 'Kuaishou', provider: 'kling', caps: ['t2v', 'i2v'] },

  // Google Veo.
  { id: 'veo-3', label: 'veo-3', hint: 'Google · sound-on', provider: 'google', caps: ['t2v', 'audio'] },
  { id: 'veo-2', label: 'veo-2', hint: 'Google', provider: 'google', caps: ['t2v'] },

  // OpenAI Sora (via Fal hosting today).
  { id: 'sora-2', label: 'sora-2', hint: 'OpenAI · via Fal', provider: 'fal', caps: ['t2v'] },
  { id: 'sora-2-pro', label: 'sora-2-pro', hint: 'OpenAI · via Fal', provider: 'fal', caps: ['t2v'] },

  // MiniMax video.
  { id: 'minimax-video-01', label: 'video-01', hint: 'MiniMax · Hailuo', provider: 'minimax', caps: ['t2v', 'i2v'] },
  { id: 'hyperframes-html', label: 'hyperframes-html', hint: 'HyperFrames · local HTML renderer', provider: 'hyperframes', caps: ['t2v'] },
];

export const AUDIO_MODELS_BY_KIND: Record<AudioKind, MediaModel[]> = {
  music: [
    { id: 'suno-v5', label: 'suno-v5', hint: 'Suno · default', provider: 'suno', caps: ['music'], default: true },
    { id: 'suno-v4-5', label: 'suno-v4.5', hint: 'Suno', provider: 'suno', caps: ['music'] },
    { id: 'udio-v2', label: 'udio-v2', hint: 'Udio', provider: 'udio', caps: ['music'] },
    { id: 'lyria-2', label: 'lyria-2', hint: 'Google', provider: 'google', caps: ['music'] },
  ],
  speech: [
    { id: 'gpt-4o-mini-tts', label: 'gpt-4o-mini-tts', hint: 'OpenAI · expressive TTS', provider: 'openai', caps: ['tts'] },
    { id: 'minimax-tts', label: 'minimax-tts', hint: 'MiniMax · default', provider: 'minimax', caps: ['tts'], default: true },
    { id: 'fish-speech-2', label: 'fish-speech-2', hint: 'FishAudio', provider: 'fishaudio', caps: ['tts', 'voice-clone'] },
    { id: 'elevenlabs-v3', label: 'elevenlabs-v3', hint: 'ElevenLabs', provider: 'elevenlabs', caps: ['tts', 'voice-clone'] },
    { id: 'doubao-tts', label: 'doubao-tts', hint: 'Volcengine · TTS', provider: 'volcengine', caps: ['tts'] },
  ],
  sfx: [
    { id: 'elevenlabs-sfx', label: 'elevenlabs-sfx', hint: 'ElevenLabs SFX', provider: 'elevenlabs', caps: ['sfx'], default: true },
    { id: 'audiocraft', label: 'audiocraft', hint: 'Meta · open', provider: 'replicate', caps: ['sfx', 'music'] },
  ],
};

export const MEDIA_ASPECTS: MediaAspect[] = ['1:1', '16:9', '9:16', '4:3', '3:4'];

export const VIDEO_LENGTHS_SEC: number[] = [3, 5, 8, 10, 15, 30];
export const AUDIO_DURATIONS_SEC: number[] = [5, 10, 15, 30, 60, 120];

export const DEFAULT_IMAGE_MODEL =
  IMAGE_MODELS.find((m) => m.default)?.id ?? IMAGE_MODELS[0]!.id;
export const DEFAULT_VIDEO_MODEL =
  VIDEO_MODELS.find((m) => m.default)?.id ?? VIDEO_MODELS[0]!.id;
export const DEFAULT_AUDIO_MODEL: Record<AudioKind, string> = {
  music:
    AUDIO_MODELS_BY_KIND.music.find((m) => m.default)?.id
    ?? AUDIO_MODELS_BY_KIND.music[0]!.id,
  speech:
    AUDIO_MODELS_BY_KIND.speech.find((m) => m.default)?.id
    ?? AUDIO_MODELS_BY_KIND.speech[0]!.id,
  sfx:
    AUDIO_MODELS_BY_KIND.sfx.find((m) => m.default)?.id
    ?? AUDIO_MODELS_BY_KIND.sfx[0]!.id,
};

/**
 * Look up a model record across all surfaces by ID. Returns null if the
 * agent passes an unknown model — the dispatcher rejects with a clear
 * error so the agent re-plans instead of silently falling back.
 */
export function findMediaModel(id: string): MediaModel | null {
  const all: MediaModel[] = [
    ...IMAGE_MODELS,
    ...VIDEO_MODELS,
    ...AUDIO_MODELS_BY_KIND.music,
    ...AUDIO_MODELS_BY_KIND.speech,
    ...AUDIO_MODELS_BY_KIND.sfx,
  ];
  return all.find((m) => m.id === id) ?? null;
}

export function findProvider(id: MediaProviderId): MediaProvider | null {
  return MEDIA_PROVIDERS.find((p) => p.id === id) ?? null;
}

/** All model IDs grouped by surface, used for prompt-side disclosure. */
export function modelIdsBySurface(): {
  image: string[];
  video: string[];
  audio: { music: string[]; speech: string[]; sfx: string[] };
} {
  return {
    image: IMAGE_MODELS.map((m) => m.id),
    video: VIDEO_MODELS.map((m) => m.id),
    audio: {
      music: AUDIO_MODELS_BY_KIND.music.map((m) => m.id),
      speech: AUDIO_MODELS_BY_KIND.speech.map((m) => m.id),
      sfx: AUDIO_MODELS_BY_KIND.sfx.map((m) => m.id),
    },
  };
}

/**
 * Group a flat list of {@link MediaModel} by provider while preserving
 * the catalogue order. Used by the picker to render section headers.
 */
export function groupByProvider(models: MediaModel[]): Array<{
  provider: MediaProvider;
  models: MediaModel[];
}> {
  const order: MediaProviderId[] = [];
  const map = new Map<MediaProviderId, MediaModel[]>();
  for (const m of models) {
    if (!map.has(m.provider)) {
      order.push(m.provider);
      map.set(m.provider, []);
    }
    map.get(m.provider)!.push(m);
  }
  return order
    .map((id) => {
      const provider = findProvider(id);
      const list = map.get(id) ?? [];
      return provider ? { provider, models: list } : null;
    })
    .filter((entry): entry is { provider: MediaProvider; models: MediaModel[] } => entry != null);
}
