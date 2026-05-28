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

import type { AudioKind } from './media-models.js';
import {
  AUDIO_MODELS_BY_KIND,
  IMAGE_MODELS,
  VIDEO_MODELS,
} from './media-models.js';
import { generateMedia } from './media.js';

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
 * Runtime context the BYOK tool executors need. Built once per request by the
 * chat route. Credentials are NOT carried here — generateMedia resolves each
 * provider's key from media-config (the BYOK key is mirrored in by the proxy
 * handler's seedProviderIfMissing before the run starts).
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
