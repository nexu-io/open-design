// Tool definitions and executors exposed to BYOK chat sessions.
//
// Why this file exists: the BYOK chat proxy (e.g. /api/proxy/senseaudio/stream)
// is a thin pass-through that doesn't have the agent-runtime scaffolding the
// CLI agents (Claude Code / Codex / ...) carry. To let users ask their BYOK
// chat to "draw me a cat" / "make a clip" / "read this aloud" and get a real
// rendered file back, the daemon injects an OpenAI-shaped `tools` definition
// into the upstream completion request, then loops on the model's tool_calls:
// execute → feed the result back as a `role: 'tool'` message → re-issue the
// completion. The chat surface stays the same; the tool dispatch happens
// entirely daemon-side.
//
// All three media tools route through the daemon's unified media dispatcher
// (`generateMedia` in media.ts), which resolves the model's provider, loads
// that provider's credentials (media-config / env — the BYOK key is mirrored
// in by seedProviderIfMissing), dispatches to the right renderer, and writes
// the bytes into the active project's folder. That means the chat can drive
// ANY model in the catalogue (OpenAI / Volcengine / SenseAudio / ...), not
// just SenseAudio — as long as the chosen provider has credentials configured
// in Settings → Media.

import path from 'node:path';
import { writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import type { AudioKind } from './media-models.js';
import {
  AUDIO_MODELS_BY_KIND,
  IMAGE_MODELS,
  VIDEO_MODELS,
} from './media-models.js';
import { generateMedia } from './media.js';
import { assertExternalAssetUrl, assertAndFetchExternalAsset } from './connectionTest.js';
import { resolveProviderConfig } from './media-config.js';
import { ensureProject } from './projects.js';
import {
  AIHUBMIX_DEFAULT_BASE_URL,
  aihubmixHeaders,
  aihubmixAppCodeHeader,
  aihubmixWireModel,
  aihubmixOriginFromBase,
  aihubmixGeminiImageUrl,
  aihubmixGeminiImageBytes,
  classifyAIHubMixModel,
  AIHUBMIX_IMAGE_ASPECT_TO_SIZE,
} from './aihubmix.js';
import {
  aihubmixMediaRegistry,
  buildVideoRequest,
  deriveVideoFamily,
  type ModelCapability,
} from './media-adapters/index.js';

// SenseAudio image model allowlist — derived from the shared media-models
// registry so adding a new SenseAudio image model in one place (media-models)
// auto-extends the BYOK tool param enum, the Settings dropdown, and the
// daemon-side validation. No drift, no hand-maintained constant.
export const BYOK_SENSEAUDIO_IMAGE_MODELS: readonly string[] = IMAGE_MODELS
  .filter((m) => m.provider === 'senseaudio')
  .map((m) => m.id);

export const BYOK_SENSEAUDIO_DEFAULT_IMAGE_MODEL =
  BYOK_SENSEAUDIO_IMAGE_MODELS[0] ?? 'senseaudio-image-2.0-260319';

export function isSenseAudioImageModel(value: unknown): value is string {
  return typeof value === 'string' && BYOK_SENSEAUDIO_IMAGE_MODELS.includes(value);
}

export const BYOK_AIHUBMIX_IMAGE_MODELS: readonly string[] = IMAGE_MODELS
  .filter((m) => m.provider === 'aihubmix')
  .map((m) => m.id);

export const BYOK_AIHUBMIX_DEFAULT_IMAGE_MODEL =
  BYOK_AIHUBMIX_IMAGE_MODELS[0] ?? 'aihubmix-gpt-image-1';

export function isAIHubMixImageModel(value: unknown): value is string {
  return typeof value === 'string'
    && (value.startsWith('aihubmix-') || BYOK_AIHUBMIX_IMAGE_MODELS.includes(value));
}

export function isAIHubMixVideoModel(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('aihubmix-');
}

export const BYOK_AIHUBMIX_DEFAULT_VIDEO_MODEL = 'aihubmix-doubao-seedance-2-0-fast-260128';

export function isAIHubMixSpeechModel(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('aihubmix-');
}
export const BYOK_AIHUBMIX_DEFAULT_SPEECH_MODEL = 'aihubmix-tts-1';

const AIHUBMIX_DEFAULT_TTS_MODEL = 'tts-1';
const AIHUBMIX_DEFAULT_TTS_VOICE = 'alloy';

const AIHUBMIX_VIDEO_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const;
const AIHUBMIX_VIDEO_DURATION_MIN = 4;
const AIHUBMIX_VIDEO_DURATION_MAX = 15;
const AIHUBMIX_VIDEO_DURATION_DEFAULT = 5;
const AIHUBMIX_VIDEO_ASPECT_TO_SIZE: Record<string, string> = {
  '16:9': '1280x720',
  '9:16': '720x1280',
  '1:1': '1024x1024',
  '4:3': '960x720',
  '3:4': '720x960',
};
const AIHUBMIX_VIDEO_POLL_INTERVAL_MS_DEFAULT = 5000;
const AIHUBMIX_VIDEO_MAX_POLLS = 144;
const AIHUBMIX_VIDEO_PROGRESS_LOG_EVERY = 6;

const SENSEAUDIO_DEFAULT_BASE_URL = 'https://api.senseaudio.cn';
const PROMPT_MAX_LENGTH = 2000;

// Full-registry model id lists per surface. The tool `model` enums and the
// composer pickers both offer every catalogue model; generateMedia routes
// each id to its provider. Derived from the registry so adding a model in
// one place auto-extends the tool surface — no hand-maintained constant.
export const BYOK_IMAGE_MODEL_IDS: readonly string[] = IMAGE_MODELS.map((m) => m.id);
export const BYOK_VIDEO_MODEL_IDS: readonly string[] = VIDEO_MODELS.map((m) => m.id);
export const BYOK_AUDIO_MODELS = [
  ...AUDIO_MODELS_BY_KIND.music,
  ...AUDIO_MODELS_BY_KIND.speech,
  ...AUDIO_MODELS_BY_KIND.sfx,
];
export const BYOK_AUDIO_MODEL_IDS: readonly string[] = BYOK_AUDIO_MODELS.map((m) => m.id);

const DEFAULT_IMAGE_MODEL =
  IMAGE_MODELS.find((m) => m.default)?.id ?? IMAGE_MODELS[0]!.id;
const DEFAULT_VIDEO_MODEL =
  VIDEO_MODELS.find((m) => m.default)?.id ?? VIDEO_MODELS[0]!.id;
const DEFAULT_SPEECH_MODEL =
  AUDIO_MODELS_BY_KIND.speech.find((m) => m.default)?.id
  ?? AUDIO_MODELS_BY_KIND.speech[0]!.id;

// SenseAudio-provider default per surface. The SenseAudio BYOK chat seeds
// only its own key into media-config, so when the user hasn't picked a model
// the tools must default to a SenseAudio model (which has credentials) rather
// than the global catalogue default (gpt-image-2 etc., which would fail with
// "no OpenAI credential"). The proxy handler passes these as the toolCtx
// defaults; the user can still pick any other configured provider's model.
export const SENSEAUDIO_DEFAULT_IMAGE_MODEL =
  IMAGE_MODELS.find((m) => m.provider === 'senseaudio')?.id ?? DEFAULT_IMAGE_MODEL;
export const SENSEAUDIO_DEFAULT_VIDEO_MODEL =
  VIDEO_MODELS.find((m) => m.provider === 'senseaudio')?.id ?? DEFAULT_VIDEO_MODEL;
export const SENSEAUDIO_DEFAULT_AUDIO_MODEL =
  AUDIO_MODELS_BY_KIND.speech.find((m) => m.provider === 'senseaudio')?.id
  ?? DEFAULT_SPEECH_MODEL;

/**
 * Per-surface default media models for a given provider, derived from the
 * registry. A BYOK media chat seeds its own provider's key into media-config,
 * so when the user hasn't picked a model the tools should default to THAT
 * provider's model for each surface (which has credentials) rather than the
 * global catalogue default (e.g. gpt-image-2), which would fail without keys.
 * Surfaces the provider doesn't serve come back undefined → the caller leaves
 * the surface fallback to the catalogue default or the composer pick.
 */
export function defaultMediaModelsForProvider(provider: string): {
  image?: string;
  video?: string;
  audio?: string;
} {
  const image = IMAGE_MODELS.find((m) => m.provider === provider)?.id;
  const video = VIDEO_MODELS.find((m) => m.provider === provider)?.id;
  const audio =
    AUDIO_MODELS_BY_KIND.speech.find((m) => m.provider === provider)?.id
    ?? BYOK_AUDIO_MODELS.find((m) => m.provider === provider)?.id;
  return {
    ...(image ? { image } : {}),
    ...(video ? { video } : {}),
    ...(audio ? { audio } : {}),
  };
}

const VIDEO_DURATION_MIN = 3;
const VIDEO_DURATION_MAX = 30;
const VIDEO_DURATION_DEFAULT = 5;
const IMAGE_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;
const VIDEO_ASPECTS = ['16:9', '9:16', '4:3', '3:4', '1:1'] as const;

export function isImageModel(value: unknown): value is string {
  return typeof value === 'string' && IMAGE_MODELS.some((m) => m.id === value);
}
export function isVideoModel(value: unknown): value is string {
  return typeof value === 'string' && VIDEO_MODELS.some((m) => m.id === value);
}
export function isAudioModel(value: unknown): value is string {
  return typeof value === 'string' && BYOK_AUDIO_MODELS.some((m) => m.id === value);
}

/** Each audio model belongs to exactly one kind; derive it so generateMedia
 *  picks the right renderer (TTS vs music vs sfx) without a separate arg. */
function audioKindForModel(id: string): AudioKind {
  if (AUDIO_MODELS_BY_KIND.music.some((m) => m.id === id)) return 'music';
  if (AUDIO_MODELS_BY_KIND.sfx.some((m) => m.id === id)) return 'sfx';
  return 'speech';
}

/**
 * OpenAI-compatible tool definitions injected into the upstream `tools` array
 * on every BYOK media-chat request so the LLM can decide when to call them.
 * Descriptions tell the model how to surface each result in markdown — the
 * chat UI renders image markdown inline; video / audio fall back to links.
 */
export const BYOK_MEDIA_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'generate_image',
      description:
        'Generate an image from a text prompt. Returns a URL to the rendered file. After this tool succeeds, embed the URL in your reply with markdown image syntax — ![alt](url) — so the user sees it inline. Use this whenever the user asks to draw, create, generate, design, or illustrate something visual.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Detailed visual description of the image (Chinese or English). Include subject, style, lighting, composition. Maximum 2000 characters.',
          },
          aspect_ratio: {
            type: 'string',
            enum: [...IMAGE_ASPECTS],
            description:
              'Output aspect ratio. 1:1 square, 16:9 banner, 9:16 vertical, 4:3 / 3:4 editorial. Defaults to 1:1.',
          },
          model: {
            type: 'string',
            enum: [...BYOK_IMAGE_MODEL_IDS],
            description:
              'Optional. OMIT this unless the user explicitly named a specific image model in their message (e.g. "use gpt-image-2"). When omitted, the user\'s composer-selected default model is used. Only set it to honor an explicit user request — do not pick a model on your own. The chosen model routes to its provider, which must have credentials configured in Settings → Media.',
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_video',
      description:
        'Generate a short video (a few seconds) from a text prompt. Asynchronous — the daemon polls the job for you, so the user just sees the chat waiting. After it succeeds, embed the returned URL as a markdown link, e.g. `[▶ Play video](url)`, because the chat renderer does not embed <video> tags. Use this whenever the user asks for a video, clip, animation, or motion graphic.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Detailed motion description (subject, action / camera move, style, lighting). Chinese or English. Maximum 2000 characters.',
          },
          aspect_ratio: {
            type: 'string',
            enum: [...VIDEO_ASPECTS],
            description:
              'Output aspect ratio. 16:9 cinematic, 9:16 vertical, 1:1 square, 4:3 / 3:4 editorial. Defaults to 16:9.',
          },
          duration: {
            type: 'integer',
            minimum: VIDEO_DURATION_MIN,
            maximum: VIDEO_DURATION_MAX,
            description: `Video length in seconds (integer ${VIDEO_DURATION_MIN}–${VIDEO_DURATION_MAX}; defaults to ${VIDEO_DURATION_DEFAULT}).`,
          },
          resolution: {
            type: 'string',
            enum: ['480p', '720p', '1080p'],
            description:
              'Optional output resolution for SenseAudio/Seedance video. Defaults to 720p; only set it when the user asked for a specific resolution.',
          },
          model: {
            type: 'string',
            enum: [...BYOK_VIDEO_MODEL_IDS],
            description:
              'Optional. OMIT this unless the user explicitly named a specific video model in their message. When omitted, the user\'s composer-selected default model is used. Only set it to honor an explicit user request — do not pick a model on your own. Routes to the model\'s provider, which must have credentials configured in Settings → Media.',
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_audio',
      description:
        'Generate audio (speech / music / sound effects) from a text prompt. Returns a URL to the rendered file. After it succeeds, give the user a markdown link, e.g. `[▶ Play audio](url)`, because the chat renderer does not embed an audio player. Use this for text-to-speech, voiceover, narration, background music, or sound effects.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'The text to speak (TTS), the lyrics / style brief (music), or the sound description (SFX). For TTS, include only the final text to speak. Do not include language, tone, pacing, emotion, style, safety notes, or voice descriptions in this prompt. Maximum 2000 characters.',
          },
          voice: {
            type: 'string',
            description:
              'Optional voice id for speech models (e.g. a SenseAudio voice like female_0038_a). Only pass this when you have a real provider voice id. Ignored for music / SFX.',
          },
          duration: {
            type: 'integer',
            description: 'Optional target duration in seconds for music / SFX.',
          },
          model: {
            type: 'string',
            enum: [...BYOK_AUDIO_MODEL_IDS],
            description:
              'Optional. OMIT this unless the user explicitly named a specific audio model in their message. When omitted, the user\'s composer-selected default model is used. Only set it to honor an explicit user request — do not pick a model on your own. Routes to the model\'s provider, which must have credentials configured in Settings → Media.',
          },
        },
        required: ['prompt'],
      },
    },
  },
];

/**
 * OpenAI-compatible tool definitions injected into /api/proxy/aihubmix/stream.
 * AIHubMix routes image generation to `/v1/images/generations` (OpenAI shape),
 * speech to `/v1/audio/speech`, and video to the async `/v1/videos` endpoint
 * (Sora-style submit → poll → download), so the chat session gets full
 * image + voiceover + video parity with the Media panel.
 */
export const BYOK_AIHUBMIX_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'generate_image',
      description:
        'Generate an image from a text prompt using AIHubMix image models (OpenAI-compatible). Returns a URL pointing to the rendered PNG. After this tool succeeds, embed the URL in your reply with markdown image syntax — ![alt](url) — so the user sees the image inline. Use this whenever the user asks to draw, create, generate, design, or illustrate something visual.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Detailed visual description of the image (Chinese or English are both fine). Include subject, style, lighting, composition. Maximum 2000 characters.',
          },
          aspect_ratio: {
            type: 'string',
            enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
            description:
              'Output aspect ratio. 1:1 for square avatars and product shots, 16:9 for hero banners, 9:16 for vertical phone posters, 4:3 for editorial covers, 3:4 for posters. Defaults to 1:1 when omitted.',
          },
          model: {
            type: 'string',
            enum: [...BYOK_AIHUBMIX_IMAGE_MODELS],
            description:
              'Optional model override. Omit this to use the user-configured default from Settings (gpt-image-1 when unset).',
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_speech',
      description:
        'Generate a text-to-speech voiceover using AIHubMix TTS (OpenAI-compatible). Returns a URL pointing to the rendered MP3. Use this whenever the user asks for narration, voiceover, speech, TTS, or spoken audio. After this tool succeeds, reply with a clickable markdown link to the MP3.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description:
              'Exact script to speak. Include only the words that should be spoken, not production notes.',
          },
          voice_id: {
            type: 'string',
            description:
              `Optional OpenAI-style voice id (alloy, echo, fable, onyx, nova, shimmer). Defaults to ${AIHUBMIX_DEFAULT_TTS_VOICE}.`,
          },
          model: {
            type: 'string',
            description:
              'Optional TTS model override (an `aihubmix-` prefixed speech model id). Omit to use the user-configured default from Settings / the composer voice-model picker.',
          },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_video',
      description:
        'Generate a short video (4–15 seconds) from a text prompt using AIHubMix video models (e.g. the ByteDance Seedance gateway). This is an asynchronous call that can take 30 s to a few minutes — the daemon polls the job for you, so the user just sees the chat waiting. After this tool succeeds, embed the returned URL in your reply as a markdown link, e.g. `[▶ Play video](url)`, because the chat\'s markdown renderer does not currently render `<video>` tags inline. Use this whenever the user asks for a video, clip, animation, or motion graphic.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Detailed motion description of the video. Include subject, action / camera move / scene transitions, style, lighting. Chinese or English. Maximum 2000 characters.',
          },
          aspect_ratio: {
            type: 'string',
            enum: [...AIHUBMIX_VIDEO_ASPECT_RATIOS],
            description:
              'Output aspect ratio. 16:9 for cinematic, 9:16 for vertical (phone / TikTok), 1:1 for social square, 4:3 / 3:4 for editorial. Defaults to 16:9.',
          },
          duration: {
            type: 'integer',
            minimum: AIHUBMIX_VIDEO_DURATION_MIN,
            maximum: AIHUBMIX_VIDEO_DURATION_MAX,
            description:
              `Video length in seconds (integer). Allowed range ${AIHUBMIX_VIDEO_DURATION_MIN}–${AIHUBMIX_VIDEO_DURATION_MAX}; defaults to ${AIHUBMIX_VIDEO_DURATION_DEFAULT}. Shorter durations finish faster.`,
          },
          model: {
            type: 'string',
            description:
              'Optional model override (an `aihubmix-` prefixed video model id). Omit this to use the user-configured default from Settings / the composer video picker.',
          },
          image_url: {
            type: 'string',
            description:
              'Reference image for image-to-video (i2v) models — the first frame / character the video animates. Pass the daemon file URL of an image already in this project (e.g. an uploaded reference or a previously generated image, like /api/projects/<id>/files/<name>.png). REQUIRED when the selected model is an i2v model (its id contains "i2v"); for those models, if you omit it the daemon falls back to the most recent image in the project.',
          },
        },
        required: ['prompt'],
      },
    },
  },
];

/**
 * Runtime context the BYOK tool executors need. Built once per request by the
 * chat route. generateMedia resolves each provider's key from media-config (the
 * BYOK key is mirrored in by the proxy handler's seedProviderIfMissing). Stays
 * free of global state so the tool layer can be unit-tested with a temp dir.
 */
export interface BYOKToolContext {
  /** Daemon project root — generateMedia reads media-config relative to it. */
  projectRoot: string;
  /** Daemon's PROJECTS_DIR. Generated files land in
   *  `<projectsRoot>/<projectId>/` so the project's FileViewer discovers them
   *  and they travel with the project on export / archive / rename. */
  projectsRoot: string;
  /** Active project id (validated upstream via isSafeId). */
  projectId: string;
  /** The user's composer pick — the DEFAULT model for this surface. Used when
   *  the user did not name a specific model in their chat message (i.e. the
   *  LLM omits `model`). An explicit `model` from the LLM — meaning the user
   *  asked for a particular model in chat — takes precedence over this. Set
   *  only when the user picked something in the composer. */
  composerImageModel?: string;
  composerVideoModel?: string;
  composerAudioModel?: string;
  /** Surface fallback used when the user neither named a model in chat nor
   *  picked one in the composer. Validated against the registry; an unknown
   *  id falls back to the catalogue default. */
  defaultImageModel?: string;
  defaultVideoModel?: string;
  defaultAudioModel?: string;
  /** Default speech (TTS) model the user picked in the composer; authoritative
   *  over the LLM's `model` arg. Falls back to BYOK_AIHUBMIX_DEFAULT_SPEECH_MODEL. */
  defaultSpeechModel?: string;
  /** Default speech voice the user picked in the composer; used when neither the
   *  LLM nor the caller supplies a `voice_id`. */
  defaultSpeechVoice?: string;
  /** Upstream provider key + base URL captured at the start of the chat turn
   *  by the runByokMediaChat seed. AIHubMix executors prefer this over the
   *  stored media-config so a session-only key keeps working without
   *  persisting to disk. Falls through to resolveProviderConfig when empty. */
  upstreamApiKey?: string;
  upstreamBaseUrl?: string;
  /** Test-only override for the video polling interval (ms). Production
   *  uses 5 s (SenseAudio's recommendation) — tests pass small values
   *  (e.g. 1 ms) to keep the suite fast without changing the polling
   *  semantics. */
  videoPollIntervalMs?: number;
  /** Optional per-request init copied from the live chat turn. Used to
   *  forward the current proxy dispatcher into every upstream/download
   *  fetch the BYOK tool executor performs. */
  requestInit?: Pick<RequestInit, 'dispatcher'>;
}

// Merge the per-request proxy dispatcher (when the caller passed one) into each
// outbound fetch this tool layer makes, so retries/aborts honor the live chat
// turn. Pure helper — used by every executor that fetches over the network.
function withToolRequestInit(
  ctx: BYOKToolContext,
  init: RequestInit = {},
): RequestInit {
  return {
    ...ctx.requestInit,
    ...init,
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface MediaToolResult {
  ok: boolean;
  /** Daemon-served URL on success. */
  url?: string;
  /** What kind of media this result is, so the chat route picks the right
   *  embedding hint (image markdown vs link). */
  kind?: 'image' | 'video' | 'audio';
  /** Short human-readable failure reason, fed back to the LLM so it can
   *  apologize / retry. */
  error?: string;
}

// Back-compat alias — older callers import ImageToolResult.
export type ImageToolResult = MediaToolResult;

function trimmedPrompt(raw: unknown): string {
  const p = typeof raw === 'string' ? raw.trim() : '';
  return p.length > PROMPT_MAX_LENGTH ? p.slice(0, PROMPT_MAX_LENGTH) : p;
}

function sanitizeImageAspect(raw: unknown): string {
  return typeof raw === 'string' && (IMAGE_ASPECTS as readonly string[]).includes(raw)
    ? raw
    : '1:1';
}
function sanitizeVideoAspect(raw: unknown): string {
  return typeof raw === 'string' && (VIDEO_ASPECTS as readonly string[]).includes(raw)
    ? raw
    : '16:9';
}
function sanitizeVideoDuration(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return VIDEO_DURATION_DEFAULT;
  const n = Math.round(raw);
  if (n < VIDEO_DURATION_MIN) return VIDEO_DURATION_MIN;
  if (n > VIDEO_DURATION_MAX) return VIDEO_DURATION_MAX;
  return n;
}

function fileUrl(projectId: string, name: string): string {
  // Relative URL through the project file route. The web's Next.js rewrites
  // `/api/:path*` to the daemon, so the chat UI loads the file same-origin
  // under the strict CSP without any CORS plumbing.
  return `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(name)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Execute `generate_image`. Resolves the model (LLM arg > composer default >
 * catalogue default), then dispatches through generateMedia, which routes to
 * the model's provider, materialises the bytes, and writes them into the
 * project folder. Failure modes return `{ok:false,error}` rather than throwing
 * so the caller can feed the message back to the LLM as a tool_result.
 */
export async function executeGenerateImage(
  args: { prompt?: unknown; aspect_ratio?: unknown; model?: unknown },
  ctx: BYOKToolContext,
): Promise<MediaToolResult> {
  const prompt = trimmedPrompt(args.prompt);
  if (!prompt) return { ok: false, error: 'prompt is required', kind: 'image' };
  // An explicit model from the LLM (the user named one in chat) wins over the
  // composer default, which wins over the surface fallback.
  const model = isImageModel(args.model)
    ? args.model
    : isImageModel(ctx.composerImageModel)
      ? ctx.composerImageModel
      : isImageModel(ctx.defaultImageModel)
        ? ctx.defaultImageModel
        : DEFAULT_IMAGE_MODEL;
  try {
    const file = await generateMedia({
      projectRoot: ctx.projectRoot,
      projectsRoot: ctx.projectsRoot,
      projectId: ctx.projectId,
      surface: 'image',
      model,
      prompt,
      aspect: sanitizeImageAspect(args.aspect_ratio),
      ...(ctx.requestInit ? { requestInit: ctx.requestInit } : {}),
      // No silent placeholder: a model whose provider isn't configured must
      // surface a real error to the chat, not a stub that looks like success.
      allowStub: false,
    });
    return { ok: true, url: fileUrl(ctx.projectId, file.name), kind: 'image' };
  } catch (err) {
    return { ok: false, error: errorMessage(err), kind: 'image' };
  }
}

/** Execute `generate_video`. Async (the renderer polls); generateMedia owns
 *  the poll loop and project write. */
export async function executeGenerateVideo(
  args: { prompt?: unknown; aspect_ratio?: unknown; duration?: unknown; resolution?: unknown; model?: unknown },
  ctx: BYOKToolContext,
): Promise<MediaToolResult> {
  const prompt = trimmedPrompt(args.prompt);
  if (!prompt) return { ok: false, error: 'prompt is required', kind: 'video' };
  const model = isVideoModel(args.model)
    ? args.model
    : isVideoModel(ctx.composerVideoModel)
      ? ctx.composerVideoModel
      : isVideoModel(ctx.defaultVideoModel)
        ? ctx.defaultVideoModel
        : DEFAULT_VIDEO_MODEL;
  try {
    const file = await generateMedia({
      projectRoot: ctx.projectRoot,
      projectsRoot: ctx.projectsRoot,
      projectId: ctx.projectId,
      surface: 'video',
      model,
      prompt,
      aspect: sanitizeVideoAspect(args.aspect_ratio),
      length: sanitizeVideoDuration(args.duration),
      ...(typeof args.resolution === 'string' && args.resolution.trim()
        ? { resolution: args.resolution.trim() }
        : {}),
      ...(ctx.requestInit ? { requestInit: ctx.requestInit } : {}),
      allowStub: false,
    });
    return { ok: true, url: fileUrl(ctx.projectId, file.name), kind: 'video' };
  } catch (err) {
    return { ok: false, error: errorMessage(err), kind: 'video' };
  }
}

/** Execute `generate_audio` (speech / music / sfx). The audio kind is derived
 *  from the resolved model so the right renderer fires. */
export async function executeGenerateAudio(
  args: { prompt?: unknown; voice?: unknown; duration?: unknown; model?: unknown },
  ctx: BYOKToolContext,
): Promise<MediaToolResult> {
  const prompt = trimmedPrompt(args.prompt);
  if (!prompt) return { ok: false, error: 'prompt is required', kind: 'audio' };
  const model = isAudioModel(args.model)
    ? args.model
    : isAudioModel(ctx.composerAudioModel)
      ? ctx.composerAudioModel
      : isAudioModel(ctx.defaultAudioModel)
        ? ctx.defaultAudioModel
        : DEFAULT_SPEECH_MODEL;
  const audioKind = audioKindForModel(model);
  try {
    const file = await generateMedia({
      projectRoot: ctx.projectRoot,
      projectsRoot: ctx.projectsRoot,
      projectId: ctx.projectId,
      surface: 'audio',
      model,
      prompt,
      audioKind,
      ...(typeof args.voice === 'string' && args.voice.trim()
        ? { voice: args.voice.trim() }
        : {}),
      ...(typeof args.duration === 'number' && Number.isFinite(args.duration)
        ? { duration: Math.round(args.duration) }
        : {}),
      ...(ctx.requestInit ? { requestInit: ctx.requestInit } : {}),
      allowStub: false,
    });
    return { ok: true, url: fileUrl(ctx.projectId, file.name), kind: 'audio' };
  } catch (err) {
    return { ok: false, error: errorMessage(err), kind: 'audio' };
  }
}

// ---------------------------------------------------------------------------
// AIHubMix tool executors (OpenAI-wire-compatible).
//
// Unlike the SenseAudio executors above (which hit proprietary /v1/image/sync
// and /v1/t2a_v2 endpoints), AIHubMix speaks the OpenAI image/audio shapes:
//   POST /v1/images/generations  → { data: [{ b64_json | url }] }
//   POST /v1/audio/speech        → raw audio bytes
// Every request carries the fixed APP-Code header via aihubmixHeaders().
// ---------------------------------------------------------------------------

function appendOpenAIApiPath(baseUrl: string, suffix: string): string {
  const url = new URL(baseUrl);
  const trimmed = url.pathname.replace(/\/+$/, '');
  url.pathname = /\/v\d+(\/|$)/.test(trimmed)
    ? `${trimmed}${suffix}`
    : `${trimmed}/v1${suffix}`;
  return url.toString();
}

async function resolveAIHubMixCredentials(
  ctx: BYOKToolContext,
): Promise<{ apiKey: string; baseUrl: string }> {
  let apiKey = ctx.upstreamApiKey;
  let baseUrl = ctx.upstreamBaseUrl || AIHUBMIX_DEFAULT_BASE_URL;
  if (!apiKey) {
    const resolved = await resolveProviderConfig(ctx.projectRoot, 'aihubmix');
    apiKey = resolved.apiKey || '';
    if (resolved.baseUrl) baseUrl = resolved.baseUrl;
  }
  return { apiKey, baseUrl };
}

export async function executeAIHubMixGenerateImage(
  args: { prompt?: unknown; aspect_ratio?: unknown; model?: unknown },
  ctx: BYOKToolContext,
): Promise<ImageToolResult> {
  const promptRaw = typeof args.prompt === 'string' ? args.prompt.trim() : '';
  if (!promptRaw) return { ok: false, error: 'prompt is required' };
  const prompt =
    promptRaw.length > PROMPT_MAX_LENGTH ? promptRaw.slice(0, PROMPT_MAX_LENGTH) : promptRaw;

  const aspect =
    typeof args.aspect_ratio === 'string' && AIHUBMIX_IMAGE_ASPECT_TO_SIZE[args.aspect_ratio]
      ? args.aspect_ratio
      : '1:1';
  const size = AIHUBMIX_IMAGE_ASPECT_TO_SIZE[aspect];

  // Model resolution: the user's EXPLICIT composer/Settings pick wins over the
  // LLM's `model` arg. The LLM tends to fill the tool's `model` enum (e.g.
  // gpt-image-1) and would otherwise silently override the model the user
  // selected in the composer dropdown. Only when the user made no selection
  // (defaultImageModel unset) do we honour the LLM's choice, then the registry
  // default. The allowlist guards every step; the catalogue id is then mapped
  // to the upstream wire name.
  const catalogModel = isAIHubMixImageModel(ctx.defaultImageModel)
    ? ctx.defaultImageModel
    : isAIHubMixImageModel(args.model)
      ? args.model
      : BYOK_AIHUBMIX_DEFAULT_IMAGE_MODEL;
  const wireModel = aihubmixWireModel(catalogModel);

  let dir: string;
  try {
    dir = await ensureProject(ctx.projectsRoot, ctx.projectId);
  } catch (err) {
    return {
      ok: false,
      error: `invalid projectId for image storage: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const { apiKey, baseUrl } = await resolveAIHubMixCredentials(ctx);
  if (!apiKey) return { ok: false, error: 'no AIHubMix API key available' };

  // Log the resolved image model + size before the upstream call so
  // `tools-dev logs` shows which AIHubMix image model a chat-driven generation
  // actually hit. Mirrors the generate_video submit log; it's a server-side
  // call, so it never appears in the browser Network tab. When the wire model
  // differs from the catalogue id it resolved from, surface both.
  // Request-family branching (mirrors aihubmix-video's per-model requestMode):
  //   gemini family (nano-banana / gemini-*-image / imagen) → Gemini-native
  //     generateContent (the OpenAI /images/generations shape 400s with
  //     "Unknown name prompt/n/size" for these models).
  //   everything else (gpt-image / dall-e / qwen / wan / glm / doubao …) →
  //     OpenAI /v1/images/generations (AIHubMix normalizes these on the gateway).
  const protocol = classifyAIHubMixModel(wireModel);
  let bytes: Buffer;
  try {
    if (protocol === 'gemini') {
      console.log(
        `[proxy:aihubmix] generate_image submit POST ${aihubmixGeminiImageUrl(baseUrl, wireModel)} model=${wireModel}`
        + `${wireModel === catalogModel ? '' : ` (catalog=${catalogModel})`} (gemini-native)`,
      );
      // Shared with the media renderer (renderAIHubMixImage) so the gemini wire
      // shape + inline-image parse live in exactly one place.
      bytes = await aihubmixGeminiImageBytes(
        { baseUrl, apiKey, wireModel, prompt, aspect },
        (url, init) => fetch(url, withToolRequestInit(ctx, init)),
      );
    } else {
      console.log(
        `[proxy:aihubmix] generate_image submit POST ${appendOpenAIApiPath(baseUrl, '/images/generations')} model=${wireModel}`
        + `${wireModel === catalogModel ? '' : ` (catalog=${catalogModel})`} size=${size}`,
      );
      const resp = await fetch(appendOpenAIApiPath(baseUrl, '/images/generations'), withToolRequestInit(ctx, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json', ...aihubmixHeaders(apiKey) },
        body: JSON.stringify({ model: wireModel, prompt, n: 1, size }),
      }));
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return { ok: false, error: `aihubmix image ${resp.status}: ${text.slice(0, 240)}` };
      }
      const data = (await resp.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
      const entry = Array.isArray(data?.data) ? data.data[0] : null;
      if (!entry) return { ok: false, error: 'aihubmix image response had no data[0]' };
      if (entry.b64_json) {
        bytes = Buffer.from(entry.b64_json, 'base64');
      } else if (entry.url) {
        const imgResp = await assertAndFetchExternalAsset(entry.url, withToolRequestInit(ctx, {}));
        if (!imgResp.ok) return { ok: false, error: `image download ${imgResp.status}` };
        bytes = Buffer.from(await imgResp.arrayBuffer());
      } else {
        return { ok: false, error: 'aihubmix image response had neither b64_json nor url' };
      }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (bytes.length === 0) return { ok: false, error: 'aihubmix image returned zero bytes' };

  const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  const filename = `byok-${id}.png`;
  await writeFile(path.join(dir, filename), bytes);
  return {
    ok: true,
    url: `/api/projects/${encodeURIComponent(ctx.projectId)}/files/${filename}`,
  };
}

// Gemini 2.5 TTS uses its own prebuilt voice names (NOT OpenAI's
// alloy/echo/…). When the selected voice isn't a Gemini voice we fall back to
// a sensible default so the request still succeeds.
const GEMINI_TTS_VOICES = new Set([
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
  'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
  'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
]);
const GEMINI_TTS_DEFAULT_VOICE = 'Kore';

/** Sample rate from a Gemini audio mime type like "audio/L16;rate=24000". */
function parsePcmRate(mimeType: string | undefined): number {
  const m = (mimeType || '').match(/rate=(\d+)/);
  return m ? parseInt(m[1]!, 10) : 24000;
}

/** Wrap raw 16-bit mono PCM (Gemini TTS output) in a minimal WAV container so
 *  the saved file is playable. */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bitsPerSample, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export async function executeAIHubMixGenerateSpeech(
  args: { text?: unknown; voice_id?: unknown; model?: unknown },
  ctx: BYOKToolContext,
): Promise<ImageToolResult> {
  const text = typeof args.text === 'string' ? args.text.trim() : '';
  if (!text) return { ok: false, error: 'text is required' };

  let dir: string;
  try {
    dir = await ensureProject(ctx.projectsRoot, ctx.projectId);
  } catch (err) {
    return {
      ok: false,
      error: `invalid projectId for speech storage: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const { apiKey, baseUrl } = await resolveAIHubMixCredentials(ctx);
  if (!apiKey) return { ok: false, error: 'no AIHubMix API key available' };

  // Model: the composer/Settings pick wins over the LLM's arg (same authoritative
  // rule as image/video), then the registry default.
  const catalogModel = isAIHubMixSpeechModel(ctx.defaultSpeechModel)
    ? ctx.defaultSpeechModel
    : isAIHubMixSpeechModel(args.model)
      ? args.model
      : BYOK_AIHUBMIX_DEFAULT_SPEECH_MODEL;
  const wireModel = aihubmixWireModel(catalogModel);

  // Voice: an explicit per-call voice (LLM/caller) wins, else the composer
  // default, else the hard default. (Voice is per-utterance, so unlike model the
  // explicit arg is honoured first.)
  const voice =
    (typeof args.voice_id === 'string' && args.voice_id.trim())
      ? args.voice_id.trim()
      : (typeof ctx.defaultSpeechVoice === 'string' && ctx.defaultSpeechVoice.trim())
        ? ctx.defaultSpeechVoice.trim()
        : AIHUBMIX_DEFAULT_TTS_VOICE;

  // Request-family branching (mirrors the image executor): gemini TTS models
  // use the Gemini-native generateContent endpoint (responseModalities:['AUDIO']
  // + speechConfig) and return raw L16 PCM, which we wrap as WAV. Everything
  // else uses the OpenAI /v1/audio/speech shape and returns MP3.
  const protocol = classifyAIHubMixModel(wireModel);
  let bytes: Buffer;
  let ext = 'mp3';
  try {
    if (protocol === 'gemini') {
      const geminiUrl =
        `${aihubmixOriginFromBase(baseUrl)}/gemini/v1beta/models/`
        + `${encodeURIComponent(wireModel)}:generateContent`;
      const geminiVoice = GEMINI_TTS_VOICES.has(voice) ? voice : GEMINI_TTS_DEFAULT_VOICE;
      console.log(
        `[proxy:aihubmix] generate_speech submit POST ${geminiUrl} model=${wireModel} voice=${geminiVoice} (gemini-native)`,
      );
      const resp = await fetch(geminiUrl, withToolRequestInit(ctx, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey, ...aihubmixAppCodeHeader() },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiVoice } } },
          },
        }),
      }));
      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        return { ok: false, error: `aihubmix speech (gemini) ${resp.status}: ${t.slice(0, 240)}` };
      }
      const data = (await resp.json()) as any;
      const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
      const part = parts.find((p) => p?.inlineData?.data || p?.inline_data?.data);
      const b64 = part?.inlineData?.data || part?.inline_data?.data;
      if (!b64) {
        return {
          ok: false,
          error: `aihubmix gemini speech response had no inline audio: ${JSON.stringify(data).slice(0, 200)}`,
        };
      }
      const mime: string = part?.inlineData?.mimeType || part?.inline_data?.mime_type || '';
      const raw = Buffer.from(b64, 'base64');
      // Gemini returns L16 PCM; wrap as WAV unless it already gave a container.
      if (/wav|mp3|mpeg|ogg/i.test(mime)) {
        bytes = raw;
        ext = /mp3|mpeg/i.test(mime) ? 'mp3' : /ogg/i.test(mime) ? 'ogg' : 'wav';
      } else {
        bytes = pcmToWav(raw, parsePcmRate(mime));
        ext = 'wav';
      }
    } else {
      console.log(
        `[proxy:aihubmix] generate_speech submit POST ${appendOpenAIApiPath(baseUrl, '/audio/speech')} model=${wireModel}`
        + `${wireModel === catalogModel ? '' : ` (catalog=${catalogModel})`} voice=${voice}`,
      );
      const resp = await fetch(appendOpenAIApiPath(baseUrl, '/audio/speech'), withToolRequestInit(ctx, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json', ...aihubmixHeaders(apiKey) },
        body: JSON.stringify({
          model: wireModel,
          input: text,
          voice,
          response_format: 'mp3',
        }),
      }));
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return { ok: false, error: `aihubmix speech ${resp.status}: ${errText.slice(0, 240)}` };
      }
      bytes = Buffer.from(await resp.arrayBuffer());
      ext = 'mp3';
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (bytes.length === 0) return { ok: false, error: 'aihubmix speech returned zero bytes' };

  const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  const filename = `byok-speech-${id}.${ext}`;
  await writeFile(path.join(dir, filename), bytes);
  return {
    ok: true,
    url: `/api/projects/${encodeURIComponent(ctx.projectId)}/files/${filename}`,
  };
}

function sanitizeAIHubMixVideoAspect(raw: unknown): string {
  return typeof raw === 'string' && AIHUBMIX_VIDEO_ASPECT_TO_SIZE[raw] ? raw : '16:9';
}

const IMAGE_EXT_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

// We resolve a project-local reference image to raw bytes + mime + filename,
// then hand a base64 data URL to the media-adapters builder. Each video family
// places it differently (seedance: content[].image_url; wan: input.media[];
// generic: input_reference) — all as an inline data URL, no multipart upload.
interface ReferenceImagePart {
  bytes: Buffer;
  mime: string;
  filename: string;
}

// Read a project image file into an upload part. Null for non-images / unreadable.
async function fileToImagePart(filePath: string): Promise<ReferenceImagePart | null> {
  const mime = IMAGE_EXT_MIME[path.extname(filePath).toLowerCase()];
  if (!mime) return null;
  try {
    const buf = await readFile(filePath);
    if (!buf.length) return null;
    return { bytes: buf, mime, filename: path.basename(filePath) };
  } catch {
    return null;
  }
}

// Resolve an i2v reference image to an upload part. `image_url` may be a daemon
// file URL (/api/projects/<id>/files/<name>), a bare project filename, or an
// http(s) URL. Project-local files are read straight off disk (basename-only,
// so a crafted path can't escape the project dir); external URLs are
// SSRF-checked then fetched.
async function resolveAIHubMixReferenceImage(
  imageUrl: unknown,
  dir: string,
  ctx: BYOKToolContext,
): Promise<ReferenceImagePart | null> {
  if (typeof imageUrl !== 'string' || !imageUrl.trim()) return null;
  const raw = imageUrl.trim();
  if (/^https?:\/\//i.test(raw)) {
    const check = await assertExternalAssetUrl(raw);
    if (!check.ok) return null;
    try {
      const resp = await fetch(raw, withToolRequestInit(ctx, { redirect: 'error' }));
      if (!resp.ok) return null;
      const buf = Buffer.from(await resp.arrayBuffer());
      if (!buf.length) return null;
      const mime = (resp.headers.get('content-type') || 'image/png').split(';')[0]!.trim();
      const filename = path.basename(new URL(raw).pathname) || 'reference.png';
      return { bytes: buf, mime, filename };
    } catch {
      return null;
    }
  }
  // Treat as a project-local file. basename() strips any path so a value like
  // "../../etc/passwd" collapses to a filename inside the project dir.
  const name = path.basename(raw.split('?')[0]!);
  if (!name) return null;
  return fileToImagePart(path.join(dir, name));
}

// Fallback for i2v models when no image_url is given: the most recently
// modified image already in the project folder (typically the uploaded
// reference or the last generated frame).
async function newestProjectImagePart(dir: string): Promise<ReferenceImagePart | null> {
  try {
    const entries = await readdir(dir);
    const images = entries.filter((f) => IMAGE_EXT_MIME[path.extname(f).toLowerCase()]);
    if (!images.length) return null;
    const withMtime = await Promise.all(
      images.map(async (f) => ({ f, m: (await stat(path.join(dir, f))).mtimeMs })),
    );
    withMtime.sort((a, b) => b.m - a.m);
    return fileToImagePart(path.join(dir, withMtime[0]!.f));
  } catch {
    return null;
  }
}

// AIHubMix's completed-video download URL is frequently an authenticated
// endpoint on the AIHubMix origin itself (a bare GET returns 401). We must
// re-send the Bearer + APP-Code headers when the asset lives on that origin,
// but must NOT leak the key to a third-party signed CDN URL. Compare origins.
function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

// True when two URLs share the last two host labels (registrable domain), e.g.
// `x.aihubmix.com` and `aihubmix.com`. Used to decide whether re-sending the
// AIHubMix key to a sibling sub-host is safe when a bare download is rejected.
function sameRegistrableDomain(a: string, b: string): boolean {
  try {
    const reg = (h: string) => h.split('.').slice(-2).join('.');
    return reg(new URL(a).hostname) === reg(new URL(b).hostname);
  } catch {
    return false;
  }
}

// Resolve a model's capability from the shared media-adapters registry; for
// catalogue models not in the seed, synthesize a sensible default (family +
// duration set derived from the wire name). Phase 2 replaces the registry's
// seed with a live AIHubMix /api/v1/models fetch.
function aihubmixVideoCapabilityFor(catalogModel: string): ModelCapability {
  const existing = aihubmixMediaRegistry.get(catalogModel);
  if (existing) return existing;
  const wire = aihubmixWireModel(catalogModel);
  const lower = wire.toLowerCase();
  const isVeo = lower.startsWith('veo');
  const supportedDurations = isVeo
    ? [4, 6, 8]
    : lower.startsWith('sora')
      ? [4, 8, 12]
      : lower.startsWith('wan')
        ? [5, 10]
        : undefined;
  // Veo is text-to-video only on the gateway (every reference form is rejected),
  // so never grant it an i2v cap even if a future wire name contained "i2v".
  const i2v = !isVeo && lower.includes('i2v');
  return {
    id: wire,
    apiModel: wire,
    mediaType: 'video',
    family: deriveVideoFamily(wire),
    caps: i2v ? ['i2v'] : ['t2v'],
    ...(i2v ? { supportedFrameImages: ['first_frame'] } : {}),
    ...(supportedDurations ? { supportedDurations } : {}),
  };
}

/**
 * AIHubMix in-chat video generation. Mirrors renderAIHubMixVideo (media.ts) for
 * the wire shape — POST {base}/videos → poll GET {base}/videos/{id} → download
 * the inline URL or {base}/videos/{id}/content — and executeGenerateVideo above
 * for the chat-executor scaffolding (project storage, proxy dispatcher
 * forwarding, SSRF re-validation of the returned asset URL). Supports both
 * text-to-video and image-to-video: i2v models (id contains "i2v") take a
 * reference image from `args.image_url` or, failing that, the newest image in
 * the project, sent as the `input_reference` data URL.
 */
export async function executeAIHubMixGenerateVideo(
  args: {
    prompt?: unknown;
    aspect_ratio?: unknown;
    duration?: unknown;
    model?: unknown;
    image_url?: unknown;
  },
  ctx: BYOKToolContext,
): Promise<ImageToolResult> {
  const promptRaw = typeof args.prompt === 'string' ? args.prompt.trim() : '';
  if (!promptRaw) return { ok: false, error: 'prompt is required' };
  const prompt =
    promptRaw.length > PROMPT_MAX_LENGTH ? promptRaw.slice(0, PROMPT_MAX_LENGTH) : promptRaw;

  const aspect = sanitizeAIHubMixVideoAspect(args.aspect_ratio);
  const size = AIHUBMIX_VIDEO_ASPECT_TO_SIZE[aspect];

  // Model resolution: the user's EXPLICIT composer/Settings pick wins over the
  // LLM's `model` arg (the LLM otherwise overrides the composer dropdown by
  // filling its own model). Only when the user made no selection do we honour
  // the LLM's choice, then the registry default. The allowlist guards each step.
  const catalogModel = isAIHubMixVideoModel(ctx.defaultVideoModel)
    ? ctx.defaultVideoModel
    : isAIHubMixVideoModel(args.model)
      ? args.model
      : BYOK_AIHUBMIX_DEFAULT_VIDEO_MODEL;
  const wireModel = aihubmixWireModel(catalogModel);

  let dir: string;
  try {
    dir = await ensureProject(ctx.projectsRoot, ctx.projectId);
  } catch (err) {
    return {
      ok: false,
      error: `invalid projectId for video storage: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const { apiKey, baseUrl } = await resolveAIHubMixCredentials(ctx);
  if (!apiKey) return { ok: false, error: 'no AIHubMix API key available' };
  const trimmedBase = baseUrl.replace(/\/+$/, '');

  // Resolve the capability up front so reference-image handling can key off the
  // model's declared caps rather than a name heuristic. Phase 1 uses the ported
  // aihubmix-video seed; Phase 2 swaps the registry to a live /api/v1/models fetch.
  const cap = aihubmixVideoCapabilityFor(catalogModel);

  // Image-to-video reference handling, split into two independent properties:
  //   • requiresReference — i2v-ONLY models (name contains "i2v", e.g.
  //     wan2.7-i2v / happyhorse-1.0-i2v) FAIL without a first frame, so we
  //     auto-grab the newest project image when none was passed.
  //   • acceptsReference — whether sending a reference is allowed AT ALL
  //     (cap.caps includes 'i2v'). veo-3.1-lite is text-to-video only and the
  //     Gemini shim 400s on a reference ("`referenceImages` isn't supported");
  //     veo-3.1-generate-preview keeps i2v. t2v-dual models (seedance/sora/veo)
  //     accept an optional reference but never require one.
  const requiresReference = wireModel.toLowerCase().includes('i2v');
  const acceptsReference = cap.caps.includes('i2v');
  let refImage = await resolveAIHubMixReferenceImage(args.image_url, dir, ctx);
  if (!refImage && requiresReference) {
    refImage = await newestProjectImagePart(dir);
    if (refImage) {
      console.log('[proxy:aihubmix] generate_video i2v: no image_url; using newest project image as reference');
    }
  }
  if (requiresReference && !refImage) {
    return {
      ok: false,
      error:
        `${wireModel} is an image-to-video model and needs a reference image, but none was found. `
        + 'Upload or generate an image in this project first, or pass image_url; '
        + 'or switch to a text-to-video model.',
    };
  }
  if (refImage && !acceptsReference) {
    return {
      ok: false,
      error:
        `${wireModel} is a text-to-video model and can't take a reference image. `
        + 'Remove the image, or switch to an image-to-video model '
        + '(e.g. wan2.7-i2v or doubao-seedance-2-0-260128).',
    };
  }
  const refDataUrl = refImage
    ? `data:${refImage.mime};base64,${refImage.bytes.toString('base64')}`
    : undefined;
  const built = buildVideoRequest(cap, {
    prompt,
    durationSeconds: sanitizeVideoDuration(args.duration),
    aspectRatio: aspect,
    ...(size ? { size } : {}),
    ...(refDataUrl ? { imageRef: { dataUrl: refDataUrl } } : {}),
  });

  // Step 1: POST {base}/videos → task id. Log the actual upstream call (it's a
  // server-side request, so it never appears in the browser Network tab).
  console.log(
    `[proxy:aihubmix] generate_video submit POST ${trimmedBase}${built.pathSuffix} model=${built.wireModel} family=${built.family} ref=${built.hasReference ? `yes(${refImage!.mime},${refImage!.bytes.length}b)` : 'no'}`,
  );
  let taskId: string;
  try {
    const resp = await fetch(`${trimmedBase}${built.pathSuffix}`, withToolRequestInit(ctx, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': built.contentType, ...aihubmixHeaders(apiKey) },
      body: JSON.stringify(built.body),
    }));
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { ok: false, error: `aihubmix video submit ${resp.status}: ${text.slice(0, 240)}` };
    }
    const data = (await resp.json()) as { id?: string; data?: { id?: string } };
    const id = data?.id || data?.data?.id;
    if (typeof id !== 'string' || !id) {
      return { ok: false, error: 'aihubmix video response missing id' };
    }
    taskId = id;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Step 2: poll /videos/{id} until completed / failed / timeout.
  const pollIntervalMs = ctx.videoPollIntervalMs ?? AIHUBMIX_VIDEO_POLL_INTERVAL_MS_DEFAULT;
  let directUrl = '';
  let done = false;
  for (let attempt = 0; attempt < AIHUBMIX_VIDEO_MAX_POLLS; attempt++) {
    await sleep(pollIntervalMs);
    let statusResp: Response;
    try {
      statusResp = await fetch(
        `${trimmedBase}/videos/${encodeURIComponent(taskId)}`,
        withToolRequestInit(ctx, { method: 'GET', headers: { ...aihubmixHeaders(apiKey) } }),
      );
    } catch (err) {
      return {
        ok: false,
        error: `aihubmix video poll failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (!statusResp.ok) {
      const text = await statusResp.text().catch(() => '');
      return { ok: false, error: `aihubmix video status ${statusResp.status}: ${text.slice(0, 240)}` };
    }
    const data = (await statusResp.json()) as any;
    const status: string = data?.status || data?.data?.status || '';
    if (status === 'completed' || status === 'succeeded' || status === 'done') {
      // Some gateways surface the asset URL inline; otherwise fall back to the
      // /content download endpoint below.
      directUrl =
        data?.video_url
        || data?.url
        || data?.output_url
        || data?.data?.video_url
        || data?.data?.url
        || (Array.isArray(data?.data) ? data.data[0]?.url : '')
        || '';
      done = true;
      break;
    }
    if (status === 'failed' || status === 'cancelled' || status === 'error') {
      // Dump the full upstream payload — the surfaced reason is often just the
      // opaque "Video generation failed"; the body may carry a code / detail
      // (e.g. an unsupported model or a bad reference image) that we need to
      // diagnose without re-running a billed generation.
      let dump = '';
      try { dump = JSON.stringify(data); } catch { dump = String(data); }
      console.warn(
        `[proxy:aihubmix] generate_video upstream ${status} model=${wireModel} body=${dump.slice(0, 600)}`,
      );
      const reason = String(
        data?.error?.message || data?.error || data?.failure_reason
        || data?.data?.error?.message || data?.message || '',
      );
      // "Params ignored" signature: we sent a real prompt but the upstream echo
      // shows it empty (and the only error is the generic catch-all). AIHubMix
      // accepted the request but didn't map our fields onto this model. Turn the
      // opaque failure into an actionable message instead of relaying the bare
      // "Video generation failed".
      const promptEchoedEmpty = typeof data?.prompt === 'string' && data.prompt === '' && prompt.length > 0;
      const genericOnly = !reason || /^video generation failed\.?$/i.test(reason.trim());
      if (promptEchoedEmpty && genericOnly) {
        // The wan/happyhorse families now use the correct DashScope wanx wire
        // (input.media[{type:first_frame,url}] + parameters), so a remaining i2v
        // failure is most likely the reference image: wanx-backed models may
        // require a PUBLICLY reachable image URL, whereas we send a base64 data
        // URL of a project-local file (which AIHubMix can't fetch by URL). Doubao
        // Seedance accepts the inline data URL, so it's the reliable i2v path.
        const error = refImage
          ? `${wireModel} did not accept the reference image — AIHubMix dropped the request parameters `
            + `and it failed with no specific reason. This model likely needs a publicly reachable image `
            + `URL for image-to-video, but the project image is sent inline as a data URL. Use `
            + `doubao-seedance-2-0-260128 for image-to-video (it accepts the inline image); `
            + `${wireModel.replace(/-(i2v|r2v)$/, '-t2v')} may still work for text-to-video.`
          : `${wireModel} is not supported by AIHubMix's unified video API — it ignored the request `
            + `parameters (the prompt came back empty) and failed with no specific reason. Switch to a `
            + `supported model such as doubao-seedance-2-0-260128, sora-2, or a wan2.x model.`;
        return { ok: false, error };
      }
      return {
        ok: false,
        error: `aihubmix video ${status}: ${(reason || status).slice(0, 240)}`,
      };
    }
    if ((attempt + 1) % AIHUBMIX_VIDEO_PROGRESS_LOG_EVERY === 0) {
      console.log(
        `[proxy:aihubmix] generate_video poll ${attempt + 1}/${AIHUBMIX_VIDEO_MAX_POLLS} task=${taskId} status=${status || 'pending'}`,
      );
    }
  }
  if (!done) {
    return { ok: false, error: `aihubmix video timed out after ${AIHUBMIX_VIDEO_MAX_POLLS} polls` };
  }

  // Step 3: download the mp4 bytes. Re-validate any returned URL through
  // assertAndFetchExternalAsset so a malicious gateway can't point us at the
  // cloud metadata service or an RFC1918 host via the response payload, nor via
  // a redirect from a validated public URL.
  console.log(
    `[proxy:aihubmix] generate_video completed task=${taskId} download=${directUrl || `${trimmedBase}/videos/${encodeURIComponent(taskId)}/content`}`,
  );
  let bytes: Buffer;
  try {
    if (directUrl) {
      // Authenticated download when the asset is on the AIHubMix origin; a
      // signed third-party CDN URL is fetched without our key. Redirects are
      // rejected (assertAndFetchExternalAsset pins redirect:'error') so a
      // validated public URL can't 302 the daemon into private/metadata space,
      // nor leak our Bearer/APP-Code to the redirect target.
      let host = '';
      try { host = new URL(directUrl).host; } catch { /* keep host empty */ }
      const sendAuth = sameOrigin(directUrl, trimmedBase);
      let dl = await assertAndFetchExternalAsset(
        directUrl,
        withToolRequestInit(ctx, sendAuth ? { headers: { ...aihubmixHeaders(apiKey) } } : {}),
      );
      // Fallback: an unauthenticated download rejected as 401/403 from the same
      // registrable domain (e.g. a different AIHubMix sub-host) is retried with
      // the key — the asset was clearly meant to be fetched authenticated.
      if (!dl.ok && !sendAuth && (dl.status === 401 || dl.status === 403)
          && sameRegistrableDomain(directUrl, trimmedBase)) {
        dl = await assertAndFetchExternalAsset(directUrl, withToolRequestInit(ctx, { headers: { ...aihubmixHeaders(apiKey) } }));
      }
      if (!dl.ok) return { ok: false, error: `aihubmix video download ${dl.status} (${host})` };
      bytes = Buffer.from(await dl.arrayBuffer());
    } else {
      const contentResp = await fetch(
        `${trimmedBase}/videos/${encodeURIComponent(taskId)}/content`,
        withToolRequestInit(ctx, { headers: { ...aihubmixHeaders(apiKey) } }),
      );
      if (!contentResp.ok) {
        return { ok: false, error: `aihubmix video content ${contentResp.status}` };
      }
      bytes = Buffer.from(await contentResp.arrayBuffer());
    }
  } catch (err) {
    return {
      ok: false,
      error: `aihubmix video download failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (bytes.length === 0) return { ok: false, error: 'aihubmix video returned zero bytes' };

  const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  const filename = `byok-video-${id}.mp4`;
  await writeFile(path.join(dir, filename), bytes);
  return {
    ok: true,
    url: `/api/projects/${encodeURIComponent(ctx.projectId)}/files/${filename}`,
  };
}
