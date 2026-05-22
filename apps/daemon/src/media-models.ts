// Daemon-side mirror of src/media/models.ts. The two files are kept in sync by hand — any model added to
// src/media/models.ts must be added here too. Drift is enforced by
// `node scripts/verify-media-models.mjs` (also exposed as
// `npm run verify:media-models`); CI should call it before publish so
// the moment one side adds a model and the other doesn't, the build
// fails with a precise diff.

export type MediaSurface = 'image' | 'video' | 'audio';
export type AudioKind = 'music' | 'speech' | 'sfx';

export type MediaProvider = {
  id: string;
  label: string;
  hint: string;
  integrated: boolean;
  defaultBaseUrl?: string;
  docsUrl?: string;
  credentialsRequired?: boolean;
  settingsVisible?: boolean;
  supportsCustomModel?: boolean;
  customModelPlaceholder?: string;
};

export type MediaModel = {
  id: string;
  label: string;
  hint: string;
  provider: string;
  caps: string[];
  default?: boolean;
};

export const MEDIA_PROVIDERS: MediaProvider[] = [
  { id: 'openai', label: 'OpenAI', hint: 'gpt-image-2 / dall-e-3', integrated: true, defaultBaseUrl: 'https://api.openai.com/v1' },
  { id: 'volcengine', label: 'Volcengine Ark (Doubao)', hint: 'Seedance 2.0 / Seedream', integrated: true, defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  { id: 'grok', label: 'xAI Grok Imagine', hint: 'grok-imagine — image + video with native audio', integrated: true, defaultBaseUrl: 'https://api.x.ai/v1' },
  { id: 'hyperframes', label: 'HyperFrames', hint: 'Local HTML -> MP4 renderer', integrated: true, credentialsRequired: false, settingsVisible: false },
  { id: 'nanobanana', label: 'Nano Banana', hint: 'Google official by default; custom gateway configurable', integrated: true, defaultBaseUrl: 'https://generativelanguage.googleapis.com', supportsCustomModel: true },
  { id: 'imagerouter', label: 'ImageRouter', hint: 'OpenAI-compatible image + video routing', integrated: true, defaultBaseUrl: 'https://api.imagerouter.io/v1/openai', docsUrl: 'https://docs.imagerouter.io/api-reference/image-generation/', supportsCustomModel: true, customModelPlaceholder: 'openai/gpt-image-2 or xAI/grok-imagine-video' },
  { id: 'openrouter', label: 'OpenRouter', hint: 'Unified gateway for image + video models', integrated: true, credentialsRequired: true, settingsVisible: true, defaultBaseUrl: 'https://openrouter.ai/api/v1', docsUrl: 'https://openrouter.ai/settings/keys' },
  { id: 'custom-image', label: 'Custom Image API', hint: 'OpenAI-compatible images/generations + images/edits (local or cloud)', integrated: true, docsUrl: 'https://platform.openai.com/docs/api-reference/images', supportsCustomModel: true, customModelPlaceholder: 'my-image-model' },
  { id: 'comfyui', label: 'ComfyUI', hint: 'Local JSON workflow server (planned adapter)', integrated: false, defaultBaseUrl: 'http://127.0.0.1:8188', docsUrl: 'https://docs.comfy.org/development/core-concepts/workflow' },
  { id: 'bfl', label: 'Black Forest Labs', hint: 'FLUX 1.1 Pro / FLUX Pro / Dev', integrated: false, defaultBaseUrl: 'https://api.bfl.ai' },
  { id: 'fal', label: 'Fal.ai', hint: 'FLUX / Sora / Veo / Wan / Ideogram / Recraft and any fal-ai/* model', integrated: true, defaultBaseUrl: 'https://fal.run', supportsCustomModel: true },
  { id: 'leonardo', label: 'Leonardo.ai', hint: 'Phoenix / Kino XL / FLUX', integrated: true, credentialsRequired: true, settingsVisible: true, defaultBaseUrl: 'https://cloud.leonardo.ai/api/rest/v1' },
  { id: 'replicate', label: 'Replicate', hint: 'FLUX / SDXL / Ideogram', integrated: false, defaultBaseUrl: 'https://api.replicate.com' },
  { id: 'google', label: 'Google AI / Vertex', hint: 'Imagen 4 / Veo 3 / Lyria', integrated: false },
  { id: 'kling', label: 'Kuaishou Kling', hint: 'Kling 1.6 / 2.0 video', integrated: false },
  { id: 'midjourney', label: 'Midjourney (proxy)', hint: 'midjourney-v7', integrated: false },
  { id: 'minimax', label: 'MiniMax', hint: 'TTS / video-01', integrated: true, defaultBaseUrl: 'https://api.minimaxi.chat/v1' },
  { id: 'suno', label: 'Suno', hint: 'Music generation', integrated: false },
  { id: 'udio', label: 'Udio', hint: 'Music generation', integrated: false },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    hint: 'Voice / SFX',
    integrated: true,
    defaultBaseUrl: 'https://api.elevenlabs.io',
    docsUrl: 'https://elevenlabs.io/app/settings/api-keys',
  },
  { id: 'fishaudio', label: 'FishAudio', hint: 'Speech / voice clone', integrated: true, defaultBaseUrl: 'https://api.fish.audio' },
  {
    id: 'senseaudio',
    label: 'SenseAudio',
    hint: '',
    integrated: true,
    defaultBaseUrl: 'https://api.senseaudio.cn',
    docsUrl: 'https://docs.senseaudio.cn',
  },
  { id: 'tavily', label: 'Tavily Search', hint: 'Agent-callable web research', integrated: true, defaultBaseUrl: 'https://api.tavily.com' },
  // Venice fronts a single OpenAI-compatible API key for text, image, video,
  // audio and embeddings — so a user who pastes one Venice key into Settings
  // unlocks gpt-image-2, nano-banana-pro, Seedance 2.0, Wan 2.5/2.6, Grok
  // Imagine, FLUX, TTS, etc., all behind the same provider slot. The image
  // path is synchronous (POST /image/generate), the video path is async
  // (queue + retrieve), and TTS is OpenAI-compatible (POST /audio/speech).
  // Docs: https://docs.venice.ai/api-reference/api-spec
  {
    id: 'venice',
    label: 'Venice',
    hint: 'OpenAI-compatible · image + video + audio',
    integrated: true,
    defaultBaseUrl: 'https://api.venice.ai/api/v1',
    docsUrl: 'https://docs.venice.ai/overview/getting-started',
    supportsCustomModel: true,
    customModelPlaceholder: 'gpt-image-2 / seedance-2-0-text-to-video / …',
  },
  { id: 'stub', label: 'Stub (placeholder)', hint: 'Deterministic local placeholder bytes', integrated: true },
];

export const IMAGE_MODELS: MediaModel[] = [
  { id: 'gpt-image-2', label: 'gpt-image-2', hint: 'OpenAI · 4K, native multimodal', provider: 'openai', caps: ['t2i', 'i2i', 'inpaint'], default: true },
  { id: 'gpt-image-1.5', label: 'gpt-image-1.5', hint: 'OpenAI · 4× faster than gpt-image-1', provider: 'openai', caps: ['t2i', 'i2i', 'inpaint'] },
  { id: 'gpt-image-1', label: 'gpt-image-1', hint: 'OpenAI · ChatGPT native', provider: 'openai', caps: ['t2i', 'i2i', 'inpaint'] },
  { id: 'gpt-image-1-mini', label: 'gpt-image-1-mini', hint: 'OpenAI · low-cost variant', provider: 'openai', caps: ['t2i', 'i2i'] },
  { id: 'dall-e-3', label: 'dall-e-3', hint: 'OpenAI · classic', provider: 'openai', caps: ['t2i'] },
  { id: 'dall-e-2', label: 'dall-e-2', hint: 'OpenAI · legacy', provider: 'openai', caps: ['t2i'] },

  { id: 'doubao-seedream-3-0-t2i-250415', label: 'seedream-3.0', hint: 'ByteDance · Doubao image', provider: 'volcengine', caps: ['t2i'] },
  { id: 'doubao-seededit-3-0-i2i-250628', label: 'seededit-3.0', hint: 'ByteDance · image edit', provider: 'volcengine', caps: ['i2i'] },

  { id: 'senseaudio-image-2.0-260319', label: 'senseaudio-image-2.0', hint: 'SenseAudio · multi-aspect, latest', provider: 'senseaudio', caps: ['t2i', 'i2i'] },
  { id: 'senseaudio-image-1.0-260319', label: 'senseaudio-image-1.0', hint: 'SenseAudio · standard', provider: 'senseaudio', caps: ['t2i', 'i2i'] },
  { id: 'doubao-seedream-5-0-260128', label: 'seedream-5.0', hint: 'SenseAudio · ByteDance Seedream 5.0 hi-res', provider: 'senseaudio', caps: ['t2i', 'i2i'] },

  { id: 'grok-imagine-image', label: 'grok-imagine-image', hint: 'xAI · 2K text-to-image', provider: 'grok', caps: ['t2i'] },

  { id: 'gemini-3.1-flash-image-preview', label: 'nano-banana-2', hint: 'Nano Banana · text-to-image', provider: 'nanobanana', caps: ['t2i'] },

  { id: 'openai/gpt-image-2', label: 'openai/gpt-image-2', hint: 'ImageRouter · routed GPT Image', provider: 'imagerouter', caps: ['t2i'] },
  { id: 'openai/gpt-image-1.5', label: 'openai/gpt-image-1.5', hint: 'ImageRouter · routed GPT Image', provider: 'imagerouter', caps: ['t2i'] },
  { id: 'black-forest-labs/FLUX-1.1-pro', label: 'FLUX-1.1-pro', hint: 'ImageRouter · Black Forest Labs', provider: 'imagerouter', caps: ['t2i'] },

  { id: 'openrouter/google/gemini-2.5-flash-image', label: 'gemini-flash-image (OR)', hint: 'OpenRouter · Gemini', provider: 'openrouter', caps: ['t2i'] },
  { id: 'openrouter/black-forest-labs/flux-1.1-pro', label: 'flux-1.1-pro (OR)', hint: 'OpenRouter · BFL', provider: 'openrouter', caps: ['t2i'] },
  { id: 'openrouter/recraft/recraft-v3', label: 'recraft-v3 (OR)', hint: 'OpenRouter · Recraft', provider: 'openrouter', caps: ['t2i'] },

  { id: 'custom-image', label: 'custom-image', hint: 'Custom · OpenAI-compatible endpoint', provider: 'custom-image', caps: ['t2i', 'i2i'] },

  { id: 'flux-1.1-pro', label: 'flux-1.1-pro', hint: 'BFL · flagship', provider: 'bfl', caps: ['t2i', 'i2i'] },
  { id: 'flux-pro', label: 'flux-pro', hint: 'BFL', provider: 'bfl', caps: ['t2i'] },
  { id: 'flux-dev', label: 'flux-dev', hint: 'BFL · open weights', provider: 'bfl', caps: ['t2i'] },
  { id: 'flux-schnell', label: 'flux-schnell', hint: 'BFL · fast', provider: 'bfl', caps: ['t2i'] },
  { id: 'flux-kontext-pro', label: 'flux-kontext-pro', hint: 'BFL · in-context edits', provider: 'bfl', caps: ['t2i', 'i2i'] },

  { id: 'imagen-4', label: 'imagen-4', hint: 'Google · latest', provider: 'google', caps: ['t2i'] },
  { id: 'imagen-3', label: 'imagen-3', hint: 'Google', provider: 'google', caps: ['t2i'] },
  { id: 'gemini-3-pro-image-preview', label: 'gemini-3-pro-image', hint: 'Google · Nano Banana Pro', provider: 'google', caps: ['t2i', 'i2i'] },

  { id: 'ideogram-v2', label: 'ideogram-v2', hint: 'Replicate · typography', provider: 'replicate', caps: ['t2i'] },
  { id: 'sdxl', label: 'stable-diffusion-xl', hint: 'Replicate · SDXL', provider: 'replicate', caps: ['t2i'] },

  { id: 'flux-pro-ultra', label: 'flux-pro-ultra', hint: 'Fal · FLUX 1.1 Pro Ultra · highest quality (~60–180s)', provider: 'fal', caps: ['t2i'] },
  { id: 'flux-dev-fal', label: 'flux-dev (fal)', hint: 'Fal · FLUX Dev · balanced quality/speed (~15–40s)', provider: 'fal', caps: ['t2i'] },
  { id: 'flux-schnell-fal', label: 'flux-schnell (fal)', hint: 'Fal · FLUX Schnell · fastest (~3–8s)', provider: 'fal', caps: ['t2i'] },
  { id: 'ideogram-v3-fal', label: 'ideogram-v3', hint: 'Fal · Ideogram v3 · typography + design (~15–30s)', provider: 'fal', caps: ['t2i'] },
  { id: 'recraft-v3-fal', label: 'recraft-v3', hint: 'Fal · Recraft v3 · vector + illustration (~15–30s)', provider: 'fal', caps: ['t2i'] },
  { id: 'sd-3.5', label: 'stable-diffusion-3.5', hint: 'Fal · SD 3.5 (~20–40s)', provider: 'fal', caps: ['t2i'] },

  { id: 'leonardo-phoenix', label: 'Phoenix', hint: 'Leonardo · versatile', provider: 'leonardo', caps: ['t2i'] },
  { id: 'leonardo-kino-xl', label: 'Kino XL', hint: 'Leonardo · cinematic', provider: 'leonardo', caps: ['t2i'] },
  { id: 'leonardo-flux-dev', label: 'FLUX Dev', hint: 'Leonardo · FLUX', provider: 'leonardo', caps: ['t2i'] },
  { id: 'leonardo-flux-schnell', label: 'FLUX Schnell', hint: 'Leonardo · fast', provider: 'leonardo', caps: ['t2i'] },
  { id: 'leonardo-anime-pastel', label: 'Anime Pastel Dream', hint: 'Leonardo · anime', provider: 'leonardo', caps: ['t2i'] },

  { id: 'midjourney-v7', label: 'midjourney-v7', hint: 'Midjourney · via proxy', provider: 'midjourney', caps: ['t2i'] },

  // Venice — POST /image/generate. Sizing is model-specific. Resolution-tier
  // models (gpt-image-2, nano-banana-pro, nano-banana-2) accept
  // `aspect_ratio` + `resolution`; aspect-ratio models (qwen-image-2,
  // flux-2-*) accept `aspect_ratio` only; pixel models (venice-sd35,
  // qwen-image) accept explicit `width` / `height`.
  { id: 'venice/gpt-image-2', label: 'gpt-image-2 (Venice)', hint: 'Venice · resolution-tier, up to 4K', provider: 'venice', caps: ['t2i'] },
  { id: 'venice/nano-banana-pro', label: 'nano-banana-pro (Venice)', hint: 'Venice · Gemini 3 Pro image · up to 4K', provider: 'venice', caps: ['t2i', 'i2i'] },
  { id: 'venice/nano-banana-2', label: 'nano-banana-2 (Venice)', hint: 'Venice · Gemini 3.1 Flash image · up to 2K', provider: 'venice', caps: ['t2i'] },
  { id: 'venice/qwen-image-2-pro', label: 'qwen-image-2-pro (Venice)', hint: 'Venice · aspect-ratio sizing', provider: 'venice', caps: ['t2i'] },
  { id: 'venice/qwen-image-2', label: 'qwen-image-2 (Venice)', hint: 'Venice · aspect-ratio sizing', provider: 'venice', caps: ['t2i'] },
  { id: 'venice/qwen-image', label: 'qwen-image (Venice)', hint: 'Venice · pixel sizing', provider: 'venice', caps: ['t2i'] },
  { id: 'venice/venice-sd35', label: 'venice-sd35 (Venice)', hint: 'Venice · uncensored SD3.5', provider: 'venice', caps: ['t2i'] },
  { id: 'venice/flux-2-max', label: 'flux-2-max (Venice)', hint: 'Venice · Black Forest Labs FLUX 2 Max', provider: 'venice', caps: ['t2i'] },
  { id: 'venice/flux-2-pro', label: 'flux-2-pro (Venice)', hint: 'Venice · FLUX 2 Pro', provider: 'venice', caps: ['t2i'] },
  { id: 'venice/seedream-v5-lite', label: 'seedream-v5-lite (Venice)', hint: 'Venice · ByteDance Seedream', provider: 'venice', caps: ['t2i'] },
  { id: 'venice/seedream-v4', label: 'seedream-v4 (Venice)', hint: 'Venice · ByteDance Seedream v4', provider: 'venice', caps: ['t2i'] },
  { id: 'venice/recraft-v4-pro', label: 'recraft-v4-pro (Venice)', hint: 'Venice · typography + iconography', provider: 'venice', caps: ['t2i'] },
  { id: 'venice/grok-imagine', label: 'grok-imagine (Venice)', hint: 'Venice · xAI image', provider: 'venice', caps: ['t2i'] },
  // Inpaint / multi-edit lands on POST /image/edit + POST /image/multi-edit.
  // Caps include 'inpaint' so the daemon dispatcher and any future i2i UI
  // gate accept them.
  { id: 'venice/qwen-edit', label: 'qwen-edit (Venice)', hint: 'Venice · default edit/inpaint', provider: 'venice', caps: ['i2i', 'inpaint'] },
  { id: 'venice/flux-2-max-edit', label: 'flux-2-max-edit (Venice)', hint: 'Venice · FLUX 2 Max edit', provider: 'venice', caps: ['i2i', 'inpaint'] },
  { id: 'venice/nano-banana-pro-edit', label: 'nano-banana-pro-edit (Venice)', hint: 'Venice · Gemini 3 Pro edit', provider: 'venice', caps: ['i2i', 'inpaint'] },
  { id: 'venice/gpt-image-2-edit', label: 'gpt-image-2-edit (Venice)', hint: 'Venice · gpt-image-2 edit', provider: 'venice', caps: ['i2i', 'inpaint'] },
];

export const VIDEO_MODELS: MediaModel[] = [
  { id: 'doubao-seedance-2-0-260128', label: 'seedance-2.0', hint: 'ByteDance · t2v + i2v + audio', provider: 'volcengine', caps: ['t2v', 'i2v', 'audio'], default: true },
  { id: 'doubao-seedance-2-0-fast-260128', label: 'seedance-2.0-fast', hint: 'ByteDance · faster, cheaper', provider: 'volcengine', caps: ['t2v', 'i2v', 'audio'] },
  { id: 'doubao-seedance-1-0-pro-250528', label: 'seedance-1.0-pro', hint: 'ByteDance · 1.0', provider: 'volcengine', caps: ['t2v', 'i2v'] },
  { id: 'doubao-seedance-1-0-lite-i2v-250428', label: 'seedance-1.0-lite-i2v', hint: 'ByteDance · image-to-video', provider: 'volcengine', caps: ['i2v'] },
  { id: 'doubao-seedance-1-0-lite-t2v-250428', label: 'seedance-1.0-lite-t2v', hint: 'ByteDance · text-to-video', provider: 'volcengine', caps: ['t2v'] },

  { id: 'grok-imagine-video', label: 'grok-imagine-video', hint: 'xAI · 720p t2v + i2v + native audio', provider: 'grok', caps: ['t2v', 'i2v', 'audio'] },

  // OpenRouter video models.
  { id: 'openrouter/bytedance/seedance-2.0:1080p', label: 'seedance-2.0 1080p (OR)', hint: 'OpenRouter · ByteDance · 1080p', provider: 'openrouter', caps: ['t2v', 'i2v'], default: true },
  { id: 'openrouter/bytedance/seedance-2.0', label: 'seedance-2.0 720p (OR)', hint: 'OpenRouter · ByteDance · 720p', provider: 'openrouter', caps: ['t2v', 'i2v'] },
  { id: 'openrouter/bytedance/seedance-2.0:480p', label: 'seedance-2.0 480p (OR)', hint: 'OpenRouter · ByteDance · 480p', provider: 'openrouter', caps: ['t2v', 'i2v'] },
  { id: 'openrouter/google/veo-3.1', label: 'veo-3.1 (OR)', hint: 'OpenRouter · Google', provider: 'openrouter', caps: ['t2v', 'i2v', 'audio'] },
  { id: 'openrouter/alibaba/wan-2.7', label: 'wan-2.7 (OR)', hint: 'OpenRouter · Alibaba', provider: 'openrouter', caps: ['t2v', 'i2v'] },
  { id: 'openrouter/kwaivgi/kling-v3.0-pro', label: 'kling-v3.0-pro (OR)', hint: 'OpenRouter · Kuaishou', provider: 'openrouter', caps: ['t2v', 'i2v'] },

  { id: 'xAI/grok-imagine-video', label: 'xAI/grok-imagine-video', hint: 'ImageRouter · routed video', provider: 'imagerouter', caps: ['t2v', 'audio'] },
  { id: 'bytedance/seedance-1.5-pro', label: 'seedance-1.5-pro', hint: 'ImageRouter · Bytedance', provider: 'imagerouter', caps: ['t2v'] },
  { id: 'google/veo-3.1-lite', label: 'veo-3.1-lite', hint: 'ImageRouter · Google', provider: 'imagerouter', caps: ['t2v'] },

  { id: 'kling-2.0', label: 'kling-2.0', hint: 'Kuaishou · latest', provider: 'kling', caps: ['t2v', 'i2v'] },
  { id: 'kling-1.6', label: 'kling-1.6', hint: 'Kuaishou', provider: 'kling', caps: ['t2v', 'i2v'] },
  { id: 'kling-1.5', label: 'kling-1.5', hint: 'Kuaishou', provider: 'kling', caps: ['t2v', 'i2v'] },

  { id: 'veo-3', label: 'veo-3', hint: 'Google · sound-on', provider: 'google', caps: ['t2v', 'audio'] },
  { id: 'veo-2', label: 'veo-2', hint: 'Google', provider: 'google', caps: ['t2v'] },

  { id: 'veo-3-fal', label: 'veo-3 (fal)', hint: 'Fal · Google Veo 3 · sound-on', provider: 'fal', caps: ['t2v', 'audio'] },
  { id: 'veo-2-fal', label: 'veo-2 (fal)', hint: 'Fal · Google Veo 2', provider: 'fal', caps: ['t2v'] },
  { id: 'wan-2.1-t2v', label: 'wan-2.1-t2v', hint: 'Fal · Wan 2.1 text-to-video', provider: 'fal', caps: ['t2v'] },
  { id: 'wan-2.1-i2v', label: 'wan-2.1-i2v', hint: 'Fal · Wan 2.1 image-to-video', provider: 'fal', caps: ['i2v'] },
  { id: 'seedance-1-pro-fal', label: 'seedance-1-pro (fal)', hint: 'Fal · Seedance 1 Pro', provider: 'fal', caps: ['t2v', 'i2v'] },
  { id: 'kling-2.1-t2v-fal', label: 'kling-2.1 (fal)', hint: 'Fal · Kling 2.1 Pro text-to-video', provider: 'fal', caps: ['t2v'] },
  { id: 'sora-2', label: 'sora-2', hint: 'Fal · OpenAI Sora 2', provider: 'fal', caps: ['t2v'] },
  { id: 'sora-2-pro', label: 'sora-2-pro', hint: 'Fal · OpenAI Sora 2 Pro', provider: 'fal', caps: ['t2v'] },

  { id: 'minimax-video-01', label: 'video-01', hint: 'MiniMax · Hailuo', provider: 'minimax', caps: ['t2v', 'i2v'] },
  { id: 'hyperframes-html', label: 'hyperframes-html', hint: 'HyperFrames · local HTML renderer', provider: 'hyperframes', caps: ['t2v'] },

  // Venice video — async POST /video/queue → POST /video/retrieve. Audio is
  // model-dependent (Seedance 2.0 + Wan 2.6 advertise `supportsAudioConfig`);
  // the dispatcher only sends `audio: true` for those.
  { id: 'venice/wan-2.6-text-to-video', label: 'wan-2.6-text-to-video (Venice)', hint: 'Venice · Alibaba Wan 2.6 t2v + audio', provider: 'venice', caps: ['t2v', 'audio'] },
  { id: 'venice/wan-2.6-image-to-video', label: 'wan-2.6-image-to-video (Venice)', hint: 'Venice · Wan 2.6 i2v + audio', provider: 'venice', caps: ['i2v', 'audio'] },
  { id: 'venice/wan-2.5-preview-text-to-video', label: 'wan-2.5-text-to-video (Venice)', hint: 'Venice · Wan 2.5 preview t2v', provider: 'venice', caps: ['t2v'] },
  { id: 'venice/wan-2.5-preview-image-to-video', label: 'wan-2.5-image-to-video (Venice)', hint: 'Venice · Wan 2.5 preview i2v', provider: 'venice', caps: ['i2v'] },

  { id: 'venice/seedance-2-0-text-to-video', label: 'seedance-2.0-t2v (Venice)', hint: 'Venice · ByteDance Seedance 2.0 t2v + audio', provider: 'venice', caps: ['t2v', 'audio'] },
  { id: 'venice/seedance-2-0-image-to-video', label: 'seedance-2.0-i2v (Venice)', hint: 'Venice · Seedance 2.0 i2v + audio', provider: 'venice', caps: ['i2v', 'audio'] },
  { id: 'venice/seedance-2-0-reference-to-video', label: 'seedance-2.0-r2v (Venice)', hint: 'Venice · Seedance 2.0 reference-to-video', provider: 'venice', caps: ['t2v', 'i2v', 'audio'] },
  { id: 'venice/seedance-2-0-fast-text-to-video', label: 'seedance-2.0-fast-t2v (Venice)', hint: 'Venice · Seedance fast tier', provider: 'venice', caps: ['t2v'] },
  { id: 'venice/seedance-2-0-fast-image-to-video', label: 'seedance-2.0-fast-i2v (Venice)', hint: 'Venice · Seedance fast tier', provider: 'venice', caps: ['i2v'] },

  // Grok Imagine on Venice — public + private variants. The dispatcher
  // routes `*-private` through the queue.download_url short-lived URL path
  // (see Venice docs guides/media/video-generation#private-download-links).
  { id: 'venice/grok-imagine-text-to-video', label: 'grok-imagine-t2v (Venice)', hint: 'Venice · xAI 720p + native audio', provider: 'venice', caps: ['t2v', 'audio'] },
  { id: 'venice/grok-imagine-image-to-video', label: 'grok-imagine-i2v (Venice)', hint: 'Venice · xAI i2v + audio', provider: 'venice', caps: ['i2v', 'audio'] },
  { id: 'venice/grok-imagine-text-to-video-private', label: 'grok-imagine-t2v-private (Venice)', hint: 'Venice · private download URL', provider: 'venice', caps: ['t2v', 'audio'] },
  { id: 'venice/grok-imagine-image-to-video-private', label: 'grok-imagine-i2v-private (Venice)', hint: 'Venice · private download URL', provider: 'venice', caps: ['i2v', 'audio'] },

  // Upscale lane — POST /video/queue with `upscale_factor` + `video_url`.
  // The dispatcher requires --image-ref (re-used as the source video URL)
  // for this model.
  { id: 'venice/topaz-video-upscale', label: 'topaz-video-upscale (Venice)', hint: 'Venice · 1×/2×/4× upscale', provider: 'venice', caps: ['v2v'] },
];

export const AUDIO_MODELS_BY_KIND: Record<AudioKind, MediaModel[]> = {
  music: [
    { id: 'suno-v5', label: 'suno-v5', hint: 'Suno · default', provider: 'suno', caps: ['music'], default: true },
    { id: 'suno-v4-5', label: 'suno-v4.5', hint: 'Suno', provider: 'suno', caps: ['music'] },
    { id: 'udio-v2', label: 'udio-v2', hint: 'Udio', provider: 'udio', caps: ['music'] },
    { id: 'lyria-2', label: 'lyria-2', hint: 'Google', provider: 'google', caps: ['music'] },
  ],
  speech: [
    { id: 'minimax-tts', label: 'minimax-tts', hint: 'MiniMax', provider: 'minimax', caps: ['tts'], default: true },
    { id: 'fish-speech-2', label: 'fish-speech-2', hint: 'FishAudio', provider: 'fishaudio', caps: ['tts', 'voice-clone'] },
    { id: 'elevenlabs-v3', label: 'elevenlabs-v3', hint: 'ElevenLabs', provider: 'elevenlabs', caps: ['tts', 'voice-clone'] },
    { id: 'senseaudio-tts', label: 'senseaudio-tts', hint: 'SenseAudio', provider: 'senseaudio', caps: ['tts', 'voice-clone'] },
    { id: 'doubao-tts', label: 'doubao-tts', hint: 'Volcengine', provider: 'volcengine', caps: ['tts'] },
    { id: 'gpt-4o-mini-tts', label: 'gpt-4o-mini-tts', hint: 'OpenAI', provider: 'openai', caps: ['tts'] },
    // xAI TTS — multilingual; uses the same SuperGrok OAuth as image / video.
    { id: 'grok-tts', label: 'grok-tts', hint: 'xAI · multilingual · uses Grok subscription', provider: 'grok', caps: ['tts'] },
    // Venice TTS — POST /audio/speech is OpenAI-compatible. `tts-chatterbox-hd`
    // additionally advertises `voice_cloning` so a future Settings affordance
    // can route ctx.voice to a minted `vv_…` handle via /v1/audio/voices.
    { id: 'venice/gpt-4o-mini-tts', label: 'gpt-4o-mini-tts (Venice)', hint: 'Venice · OpenAI-compatible speech', provider: 'venice', caps: ['tts'] },
    { id: 'venice/tts-chatterbox-hd', label: 'tts-chatterbox-hd (Venice)', hint: 'Venice · voice cloning', provider: 'venice', caps: ['tts', 'voice-clone'] },
  ],
  sfx: [
    { id: 'elevenlabs-sfx', label: 'elevenlabs-sfx', hint: 'ElevenLabs SFX', provider: 'elevenlabs', caps: ['sfx'], default: true },
    { id: 'audiocraft', label: 'audiocraft', hint: 'Meta · open', provider: 'replicate', caps: ['sfx', 'music'] },
  ],
};

export const MEDIA_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4'];
export const VIDEO_LENGTHS_SEC = [3, 5, 8, 10, 15, 30];
export const AUDIO_DURATIONS_SEC = [5, 10, 15, 30, 60, 120];

export function findMediaModel(id: string): MediaModel | null {
  const all = [
    ...IMAGE_MODELS,
    ...VIDEO_MODELS,
    ...AUDIO_MODELS_BY_KIND.music,
    ...AUDIO_MODELS_BY_KIND.speech,
    ...AUDIO_MODELS_BY_KIND.sfx,
  ];
  return all.find((m) => m.id === id) || null;
}

export function findProvider(id: string): MediaProvider | null {
  return MEDIA_PROVIDERS.find((p) => p.id === id) || null;
}

export function modelsForSurface(surface: MediaSurface, audioKind?: AudioKind): MediaModel[] {
  if (surface === 'image') return IMAGE_MODELS;
  if (surface === 'video') return VIDEO_MODELS;
  if (surface === 'audio') {
    const k = audioKind || 'music';
    return AUDIO_MODELS_BY_KIND[k] || AUDIO_MODELS_BY_KIND.music;
  }
  return [];
}
