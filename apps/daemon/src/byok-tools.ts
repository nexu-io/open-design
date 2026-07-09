// Tool definitions and executors exposed to BYOK chat sessions.
//
// Why this file exists: the BYOK chat proxy (e.g. /api/proxy/senseaudio/stream)
// is a thin pass-through that doesn't have the agent-runtime scaffolding the
// CLI agents (Claude Code / Codex / ...) carry. To let users ask their BYOK
// chat to "draw me a cat" and get an actual rendered PNG back, the daemon
// injects an OpenAI-shaped `tools` definition into the upstream completion
// request, then loops on the model's tool_calls: execute → feed the result
// back as a `role: 'tool'` message → re-issue the completion. The chat surface
// stays the same; the tool dispatch happens entirely daemon-side.
//
// Today we ship image, video, and speech tools backed by SenseAudio endpoints,
// since the BYOK chat session already authenticates with the same API key.

import path from 'node:path';
import { writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { assertExternalAssetUrl, assertAndFetchExternalAsset } from './connectionTest.js';
import { resolveProviderConfig } from './media/config.js';
import { IMAGE_MODELS } from './media/models.js';
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
} from './integrations/aihubmix.js';
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

// Default falls back to the first entry from the registry (today
// `senseaudio-image-2.0-260319` — the multi-aspect latest). Kept as a
// computed constant so re-ordering the registry rotates the default
// without code edits here.
export const BYOK_SENSEAUDIO_DEFAULT_IMAGE_MODEL =
  BYOK_SENSEAUDIO_IMAGE_MODELS[0] ?? 'senseaudio-image-2.0-260319';

export function isSenseAudioImageModel(value: unknown): value is string {
  return typeof value === 'string' && BYOK_SENSEAUDIO_IMAGE_MODELS.includes(value);
}

// AIHubMix image-model allowlist — same registry-derived pattern as SenseAudio
// so a new `provider: 'aihubmix'` image entry auto-extends the chat tool enum,
// the Settings dropdown, and the daemon-side validation with no hand edits.
export const BYOK_AIHUBMIX_IMAGE_MODELS: readonly string[] = IMAGE_MODELS
  .filter((m) => m.provider === 'aihubmix')
  .map((m) => m.id);

export const BYOK_AIHUBMIX_DEFAULT_IMAGE_MODEL =
  BYOK_AIHUBMIX_IMAGE_MODELS[0] ?? 'aihubmix-gpt-image-1';

export function isAIHubMixImageModel(value: unknown): value is string {
  // AIHubMix image models are discovered live (50+), so the static registry
  // only seeds a couple. Any `aihubmix-` prefixed id renders through the same
  // OpenAI-compatible endpoint (the prefix is stripped to the wire name), so
  // accept the whole namespace rather than just the seeded ids.
  return typeof value === 'string'
    && (value.startsWith('aihubmix-') || BYOK_AIHUBMIX_IMAGE_MODELS.includes(value));
}

// AIHubMix video models are discovered live (the `?type=video` catalogue), so —
// like image models — we accept the whole `aihubmix-` namespace rather than a
// hand-maintained list. The prefix is stripped to the wire name before the
// `/videos` call. When neither the composer picker nor the LLM supplies one,
// the executor falls back to BYOK_AIHUBMIX_DEFAULT_VIDEO_MODEL.
export function isAIHubMixVideoModel(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('aihubmix-');
}

// Default AIHubMix video model (catalogue id; the `aihubmix-` prefix is stripped
// to the wire name by aihubmixWireModel). Doubao Seedance is the most broadly
// available text/image-to-video model on the gateway today.
export const BYOK_AIHUBMIX_DEFAULT_VIDEO_MODEL = 'aihubmix-doubao-seedance-2-0-fast-260128';

// AIHubMix speech (TTS) models — discovered live via `?type=tts`; like image and
// video we accept the whole `aihubmix-` namespace (prefix stripped to the wire
// name). Falls back to BYOK_AIHUBMIX_DEFAULT_SPEECH_MODEL when unset.
export function isAIHubMixSpeechModel(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('aihubmix-');
}
export const BYOK_AIHUBMIX_DEFAULT_SPEECH_MODEL = 'aihubmix-tts-1';

const AIHUBMIX_DEFAULT_TTS_MODEL = 'tts-1';
const AIHUBMIX_DEFAULT_TTS_VOICE = 'alloy';

// AIHubMix video knobs for the chat `generate_video` tool. The wire shape
// mirrors renderAIHubMixVideo (media.ts): POST /videos → poll /videos/{id} →
// download. Aspect → pixel size duplicated from media.ts's aihubmixVideoSizeFor
// so the chat-tool path and CLI/media path stay in sync.
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
// Poll cadence: Sora-class generations routinely take minutes. 5 s interval,
// 144 attempts = 12 min ceiling, matching renderAIHubMixVideo's default.
const AIHUBMIX_VIDEO_POLL_INTERVAL_MS_DEFAULT = 5000;
const AIHUBMIX_VIDEO_MAX_POLLS = 144;
const AIHUBMIX_VIDEO_PROGRESS_LOG_EVERY = 6;

const SENSEAUDIO_DEFAULT_BASE_URL = 'https://api.senseaudio.cn';
const PROMPT_MAX_LENGTH = 2000;
const SENSEAUDIO_TTS_MODEL = 'senseaudio-tts-1.5-260319';
const SENSEAUDIO_DEFAULT_VOICE_ID = 'female_0033_b';
const HEX_AUDIO_PATTERN = /^[0-9a-fA-F]+$/;

function appendSenseAudioApiPath(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  const trimmed = url.pathname.replace(/\/+$/, '');
  url.pathname = /\/v\d+(\/|$)/.test(trimmed)
    ? `${trimmed}${path}`
    : `${trimmed}/v1${path}`;
  return url.toString();
}

// SenseAudio video — the API only documents one model today, so the
// wire id is a const. The chat tool's `generate_video` param surface
// (prompt, aspect_ratio, duration, resolution, generate_audio) covers
// every knob the doubao-seedance gateway accepts.
const SENSEAUDIO_VIDEO_MODEL = 'doubao-seedance-2-0-260128';
const SENSEAUDIO_VIDEO_ASPECT_RATIOS = ['16:9', '9:16', '4:3', '3:4', '1:1'] as const;
const SENSEAUDIO_VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'] as const;
const SENSEAUDIO_VIDEO_DURATION_MIN = 4;
const SENSEAUDIO_VIDEO_DURATION_MAX = 15;
const SENSEAUDIO_VIDEO_DURATION_DEFAULT = 5;
// Polling: SenseAudio docs recommend 5–10 s intervals; we pick 5 s and
// cap total attempts so a stuck job can't pin the chat stream forever.
// 120 attempts × 5 s = 10 min ceiling — covers the real-world
// doubao-seedance latency range (1080p + audio jobs frequently spend
// 3–8 min on the gateway). Below this, the 5-min cap timed out otherwise
// valid jobs; above this the chat surface starts feeling stuck.
const SENSEAUDIO_VIDEO_POLL_INTERVAL_MS_DEFAULT = 5000;
const SENSEAUDIO_VIDEO_MAX_POLLS = 120;
// Periodic progress log every N polls so a long-running job emits some
// signal to the daemon log — without flooding it with one line per
// 5 s. 6 polls = ~30 s between progress lines.
const SENSEAUDIO_VIDEO_PROGRESS_LOG_EVERY = 6;

// SenseAudio's image gateway rejects non-standard pixel sizes with a 400
// `参数错误：size` (verified against logs from a failed call on
// 2026-05-16). We stick to common 16-multiple HD / SD sizes that the
// gateway is known to accept: 1024×1024 for square, 1280×720 / 720×1280
// for widescreen / portrait, 1024×768 / 768×1024 for the 4:3 family.
// The table is duplicated in renderSenseAudioImage (media.ts) for the
// CLI-agent path so both surfaces stay in sync.
const ASPECT_TO_SIZE: Record<string, string> = {
  '1:1': '1024x1024',
  '16:9': '1280x720',
  '9:16': '720x1280',
  '4:3': '1024x768',
  '3:4': '768x1024',
};

/**
 * OpenAI-compatible tool definition for image generation. Injected into
 * the upstream `tools` array on every /api/proxy/senseaudio/stream
 * request so the LLM can decide on its own when to call it. The
 * description deliberately tells the model to embed the returned URL
 * in markdown — the chat UI already renders markdown images inline,
 * so no client-side wiring is required for the bytes to show up.
 */
export const BYOK_SENSEAUDIO_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'generate_image',
      description:
        'Generate an image from a text prompt using SenseAudio image models. Returns a URL pointing to the rendered PNG. After this tool succeeds, embed the URL in your reply with markdown image syntax — ![alt](url) — so the user sees the image inline. Use this whenever the user asks to draw, create, generate, design, or illustrate something visual.',
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
            enum: [...BYOK_SENSEAUDIO_IMAGE_MODELS],
            description:
              'Optional model override. Omit this to use the user-configured default from Settings (or the SenseAudio 2.0 multi-aspect model when unset). Choose senseaudio-image-2.0-260319 for multi-aspect generation, senseaudio-image-1.0-260319 for standard sizes, or doubao-seedream-5-0-260128 for high-resolution output through the ByteDance Seedream gateway. The user explicitly picked a default in their Settings — only override when the user asks for a different style/resolution.',
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
        'Generate a text-to-speech voiceover using SenseAudio TTS. Returns a URL pointing to the rendered MP3. Use this whenever the user asks for narration, voiceover, speech, TTS, or spoken audio. After this tool succeeds, reply with a clickable markdown link to the MP3.',
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
              `Optional SenseAudio voice id. Defaults to ${SENSEAUDIO_DEFAULT_VOICE_ID}.`,
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
        'Generate a short video (4–15 seconds) from a text prompt using SenseAudio\'s ByteDance Seedance gateway. This is an asynchronous call that can take 30 s to a few minutes — the daemon polls the job for you, so the user just sees the chat waiting. After this tool succeeds, embed the returned URL in your reply as a markdown link, e.g. `[▶ Play video](url)`, because the chat\'s markdown renderer does not currently render `<video>` tags inline. Use this whenever the user asks for a video, clip, animation, or motion graphic.',
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
            enum: [...SENSEAUDIO_VIDEO_ASPECT_RATIOS],
            description:
              'Output aspect ratio. 16:9 for cinematic, 9:16 for vertical (phone / TikTok), 1:1 for social square, 4:3 / 3:4 for editorial. Defaults to 16:9.',
          },
          duration: {
            type: 'integer',
            minimum: SENSEAUDIO_VIDEO_DURATION_MIN,
            maximum: SENSEAUDIO_VIDEO_DURATION_MAX,
            description:
              `Video length in seconds (integer). Allowed range ${SENSEAUDIO_VIDEO_DURATION_MIN}–${SENSEAUDIO_VIDEO_DURATION_MAX}; defaults to ${SENSEAUDIO_VIDEO_DURATION_DEFAULT}. Shorter durations finish faster.`,
          },
          resolution: {
            type: 'string',
            enum: [...SENSEAUDIO_VIDEO_RESOLUTIONS],
            description:
              'Output resolution. 480p (fastest), 720p (default, balanced), 1080p (best quality, slowest). Pick 1080p only when the user explicitly asks for high resolution.',
          },
          generate_audio: {
            type: 'boolean',
            description:
              'Whether the model also synthesises an audio track for the clip (background sound, ambience). Defaults to false to keep generation fast; flip to true when the user asks for sound, music, or a "video with audio".',
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
 * Runtime context the BYOK tool executor needs. Passed by the chat
 * route on every call so the tool layer stays free of global state and
 * can be unit-tested with a temp directory.
 */
export interface BYOKToolContext {
  /** Daemon project root — used to look up media-config when the chat
   *  session key is missing. */
  projectRoot: string;
  /** Daemon's PROJECTS_DIR (the `<projectRoot>/.od/projects/` folder
   *  that holds per-project file trees). Generated images land in
   *  `<projectsRoot>/<projectId>/byok-<id>.png` so the project's
   *  FileViewer / DesignFilesPanel discover them automatically and
   *  the file travels with the project on export, archive, rename. */
  projectsRoot: string;
  /** Active project id from the chat surface. Required — the BYOK
   *  chat always runs inside a project, so the tool dispatch refuses
   *  to fire without one rather than dump bytes into a global cache.
   *  Validated upstream via `isSafeId`. */
  projectId: string;
  /** The BYOK chat session's API key — first credential we try. Bypasses
   *  the media-config indirection so the same key the user just pasted
   *  for chat is the same key the image call uses. */
  upstreamApiKey: string;
  /** The BYOK chat session's base URL (may be a custom gateway). Falls
   *  back to api.senseaudio.cn. */
  upstreamBaseUrl?: string;
  /** Default image model the user picked in BYOK Settings, used when the
   *  LLM didn't pass `model` in tool args. Validated upstream — anything
   *  outside `BYOK_SENSEAUDIO_IMAGE_MODELS` is dropped so a stale
   *  client-side config can't smuggle an unregistered model id through.
   *  Falls back to `BYOK_SENSEAUDIO_DEFAULT_IMAGE_MODEL` (the registry's
   *  first SenseAudio image entry) when missing. */
  defaultImageModel?: string;
  /** Default video model the user picked in BYOK Settings / the composer
   *  video picker, used when the LLM didn't pass `model` in tool args.
   *  Validated upstream against `isAIHubMixVideoModel`; falls back to
   *  `BYOK_AIHUBMIX_DEFAULT_VIDEO_MODEL` when missing. */
  defaultVideoModel?: string;
  /** Default speech (TTS) model the user picked in the composer; authoritative
   *  over the LLM's `model` arg. Falls back to BYOK_AIHUBMIX_DEFAULT_SPEECH_MODEL. */
  defaultSpeechModel?: string;
  /** Default speech voice the user picked in the composer; used when neither the
   *  LLM nor the caller supplies a `voice_id`. */
  defaultSpeechVoice?: string;
  /** Test-only override for the video polling interval (ms). Production
   *  uses 5 s (SenseAudio's recommendation) — tests pass small values
   *  (e.g. 1 ms) to keep the suite fast without changing the polling
   *  semantics. */
  videoPollIntervalMs?: number;
  /** Optional per-request init copied from the live chat turn. Used to
   *  forward the current proxy dispatcher AND the client-cancellation
   *  signal into every upstream/download fetch the BYOK tool executor
   *  performs, so a disconnected client stops the tool loop's paid work. */
  requestInit?: Pick<RequestInit, 'dispatcher' | 'signal'>;
}

export interface ImageToolResult {
  ok: boolean;
  /** Daemon-served URL on success. */
  url?: string;
  /** Short human-readable failure reason. Stuffed into the `tool` role
   *  reply so the LLM can apologize / retry. */
  error?: string;
}

function withToolRequestInit(
  ctx: BYOKToolContext,
  init: RequestInit,
): RequestInit {
  return {
    ...ctx.requestInit,
    ...init,
  };
}

export async function executeGenerateSpeech(
  args: { text?: unknown; voice_id?: unknown },
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

  const apiKey = ctx.upstreamApiKey;
  if (!apiKey) return { ok: false, error: 'no SenseAudio API key available' };

  const voiceId =
    typeof args.voice_id === 'string' && args.voice_id.trim()
      ? args.voice_id.trim()
      : SENSEAUDIO_DEFAULT_VOICE_ID;
  const baseUrl = ctx.upstreamBaseUrl || SENSEAUDIO_DEFAULT_BASE_URL;
  let data: {
    data?: { audio?: string };
    base_resp?: { status_code?: number; status_msg?: string };
  };
  try {
    const resp = await fetch(appendSenseAudioApiPath(baseUrl, '/t2a_v2'), withToolRequestInit(ctx, {
      method: 'POST',
      redirect: 'error',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: SENSEAUDIO_TTS_MODEL,
        text,
        stream: false,
        voice_setting: {
          voice_id: voiceId,
          speed: 1,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          format: 'mp3',
          sample_rate: 32000,
          bitrate: 128000,
          channel: 2,
        },
      }),
    }));
    const respText = await resp.text();
    if (!resp.ok) {
      return { ok: false, error: `senseaudio speech ${resp.status}: ${respText.slice(0, 240)}` };
    }
    try {
      data = JSON.parse(respText) as typeof data;
    } catch {
      return { ok: false, error: `senseaudio speech non-JSON: ${respText.slice(0, 200)}` };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  if (data?.base_resp && data.base_resp.status_code !== 0) {
    return {
      ok: false,
      error: `senseaudio speech api error ${data.base_resp.status_code}: ${data.base_resp.status_msg || 'unknown'}`,
    };
  }
  const hex = data?.data?.audio;
  if (typeof hex !== 'string' || !hex) {
    return { ok: false, error: 'senseaudio speech response missing data.audio' };
  }
  if (hex.length % 2 !== 0 || !HEX_AUDIO_PATTERN.test(hex)) {
    return { ok: false, error: 'senseaudio speech response contained invalid hex audio' };
  }
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length === 0) return { ok: false, error: 'senseaudio speech decoded zero bytes' };

  const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  const filename = `byok-speech-${id}.mp3`;
  await writeFile(path.join(dir, filename), bytes);

  return {
    ok: true,
    url: `/api/projects/${encodeURIComponent(ctx.projectId)}/files/${filename}`,
  };
}

function sanitizeAspectRatio(raw: unknown): string {
  if (typeof raw !== 'string') return '1:1';
  return ASPECT_TO_SIZE[raw] ? raw : '1:1';
}

/**
 * Execute the `generate_image` tool. Calls SenseAudio /v1/image/sync,
 * downloads the rendered bytes, writes them to <byokImagesDir>/<id>.png,
 * and returns a daemon-served URL. Pure async — caller is responsible
 * for emitting any SSE events (e.g. "tool result ready").
 *
 * Failure modes return `{ok: false, error}` rather than throwing so the
 * caller can feed the message back to the LLM as a tool_result; that
 * lets the model apologize / suggest a retry instead of the chat
 * silently stopping.
 */
export async function executeGenerateImage(
  args: { prompt?: unknown; aspect_ratio?: unknown; model?: unknown },
  ctx: BYOKToolContext,
): Promise<ImageToolResult> {
  const promptRaw = typeof args.prompt === 'string' ? args.prompt.trim() : '';
  if (!promptRaw) return { ok: false, error: 'prompt is required' };
  const prompt =
    promptRaw.length > PROMPT_MAX_LENGTH
      ? promptRaw.slice(0, PROMPT_MAX_LENGTH)
      : promptRaw;

  const aspect = sanitizeAspectRatio(args.aspect_ratio);
  const size = ASPECT_TO_SIZE[aspect];

  // Model resolution order — LLM args > user's Settings default > registry
  // default. The allowlist guards every step so a hallucinated or stale id
  // can never reach the senseaudio /v1/image/sync wire — the catalogue is
  // the source of truth.
  const senseAudioImageModel = isSenseAudioImageModel(args.model)
    ? args.model
    : isSenseAudioImageModel(ctx.defaultImageModel)
      ? ctx.defaultImageModel
      : BYOK_SENSEAUDIO_DEFAULT_IMAGE_MODEL;

  // Resolve the project folder up front. ensureProject runs
  // `isSafeId` internally, so an attacker who somehow bypassed the
  // chat-routes guard and slipped `../escape` into projectId fails
  // here before we make any upstream call. The returned `dir` is
  // reused at writeFile time below.
  let dir: string;
  try {
    dir = await ensureProject(ctx.projectsRoot, ctx.projectId);
  } catch (err) {
    return {
      ok: false,
      error: `invalid projectId for image storage: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Prefer the BYOK session's key (what the user is actively using).
  // Fall back to media-config (env var > stored) so a user who set
  // OD_SENSEAUDIO_API_KEY but forgot to fill the chat panel still
  // gets a working tool call.
  let apiKey = ctx.upstreamApiKey;
  let baseUrl = ctx.upstreamBaseUrl || SENSEAUDIO_DEFAULT_BASE_URL;
  if (!apiKey) {
    const resolved = await resolveProviderConfig(ctx.projectRoot, 'senseaudio');
    apiKey = resolved.apiKey || '';
    if (resolved.baseUrl) baseUrl = resolved.baseUrl;
  }
  if (!apiKey) {
    return { ok: false, error: 'no SenseAudio API key available' };
  }

  const trimmedBase = baseUrl.replace(/\/+$/, '');

  // Log the resolved image model + size before the upstream call so
  // `tools-dev logs` shows which SenseAudio image model a chat-driven
  // generation actually hit. Mirrors the AIHubMix/video submit logs; it's a
  // server-side call, so it never appears in the browser Network tab.
  console.log(
    `[proxy:senseaudio] generate_image submit POST ${trimmedBase}/v1/image/sync model=${senseAudioImageModel} size=${size}`,
  );

  let imageUrl: string;
  try {
    const resp = await fetch(`${trimmedBase}/v1/image/sync`, withToolRequestInit(ctx, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: senseAudioImageModel,
        prompt,
        size,
      }),
    }));
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return {
        ok: false,
        error: `senseaudio image ${resp.status}: ${text.slice(0, 240)}`,
      };
    }
    const data = (await resp.json()) as {
      url?: string;
      error_message?: string;
      base_resp?: { status_code?: number; status_msg?: string };
    };
    if (data?.base_resp && data.base_resp.status_code !== 0) {
      return {
        ok: false,
        error: `senseaudio image api error ${data.base_resp.status_code}: ${data.base_resp.status_msg || 'unknown'}`,
      };
    }
    if (typeof data?.error_message === 'string' && data.error_message) {
      return { ok: false, error: `senseaudio image: ${data.error_message}` };
    }
    if (typeof data?.url !== 'string' || !data.url) {
      return { ok: false, error: 'senseaudio image response missing url' };
    }
    imageUrl = data.url;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const imageUrlCheck = await assertExternalAssetUrl(imageUrl);
  if (!imageUrlCheck.ok) return { ok: false, error: imageUrlCheck.error };

  let bytes: Buffer;
  try {
    const imgResp = await fetch(imageUrl, withToolRequestInit(ctx, { redirect: 'error' }));
    if (!imgResp.ok) {
      return { ok: false, error: `image download ${imgResp.status}` };
    }
    bytes = Buffer.from(await imgResp.arrayBuffer());
  } catch (err) {
    return {
      ok: false,
      error: `image download failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (bytes.length === 0) {
    return { ok: false, error: 'image download returned zero bytes' };
  }

  // Persist into the active project's folder. `dir` was resolved up
  // front via ensureProject — no DB write, no metadata side-effects —
  // and the resulting path slots straight into the existing project
  // file plumbing: listFiles enumerates it for the FileViewer,
  // readProjectFile serves it via GET /api/projects/<id>/files/<filename>,
  // and project archive / export pick it up automatically because it
  // lives under the project's own directory.
  //
  // Filename pattern `byok-<timestamp>-<random>.png` keeps tool
  // outputs distinguishable from user uploads at a glance while
  // staying url-safe.
  const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  const filename = `byok-${id}.png`;
  await writeFile(path.join(dir, filename), bytes);

  // Return a relative URL through the project file serving route. The
  // web's Next.js rewrites `/api/:path*` to the daemon (see
  // apps/web/next.config.ts), so the chat UI loads the image
  // same-origin — satisfying the strict CSP (`img-src 'self' data:
  // blob:`) without any CORS plumbing.
  return {
    ok: true,
    url: `/api/projects/${encodeURIComponent(ctx.projectId)}/files/${filename}`,
  };
}

function sanitizeVideoAspectRatio(raw: unknown): (typeof SENSEAUDIO_VIDEO_ASPECT_RATIOS)[number] {
  if (typeof raw !== 'string') return '16:9';
  return (SENSEAUDIO_VIDEO_ASPECT_RATIOS as readonly string[]).includes(raw)
    ? (raw as (typeof SENSEAUDIO_VIDEO_ASPECT_RATIOS)[number])
    : '16:9';
}

function sanitizeVideoResolution(raw: unknown): (typeof SENSEAUDIO_VIDEO_RESOLUTIONS)[number] {
  if (typeof raw !== 'string') return '720p';
  return (SENSEAUDIO_VIDEO_RESOLUTIONS as readonly string[]).includes(raw)
    ? (raw as (typeof SENSEAUDIO_VIDEO_RESOLUTIONS)[number])
    : '720p';
}

function sanitizeVideoDuration(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return SENSEAUDIO_VIDEO_DURATION_DEFAULT;
  const rounded = Math.round(raw);
  if (rounded < SENSEAUDIO_VIDEO_DURATION_MIN) return SENSEAUDIO_VIDEO_DURATION_MIN;
  if (rounded > SENSEAUDIO_VIDEO_DURATION_MAX) return SENSEAUDIO_VIDEO_DURATION_MAX;
  return rounded;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute the `generate_video` tool. SenseAudio's video API is
 * asynchronous-only: POST /v1/video/create returns a task_id, then
 * GET /v1/video/status?id=<task_id> reports `pending` / `processing`
 * → `completed` (with `video_url`) or `failed` (with `error_message`).
 * We poll every `videoPollIntervalMs` (default 5 s) and bail after
 * `SENSEAUDIO_VIDEO_MAX_POLLS` so a stuck upstream can't pin the
 * chat stream forever.
 *
 * The chat tool waits for the whole loop, so the daemon's outbound
 * SSE response from /api/proxy/senseaudio/stream stays open for the
 * duration. That's intentional — the next chat turn cannot begin
 * until we have a URL to feed back into the tool_result.
 */
export async function executeGenerateVideo(
  args: {
    prompt?: unknown;
    aspect_ratio?: unknown;
    duration?: unknown;
    resolution?: unknown;
    generate_audio?: unknown;
  },
  ctx: BYOKToolContext,
): Promise<ImageToolResult> {
  const promptRaw = typeof args.prompt === 'string' ? args.prompt.trim() : '';
  if (!promptRaw) return { ok: false, error: 'prompt is required' };
  const prompt =
    promptRaw.length > PROMPT_MAX_LENGTH
      ? promptRaw.slice(0, PROMPT_MAX_LENGTH)
      : promptRaw;

  const ratio = sanitizeVideoAspectRatio(args.aspect_ratio);
  const resolution = sanitizeVideoResolution(args.resolution);
  const duration = sanitizeVideoDuration(args.duration);
  const generateAudio = args.generate_audio === true;

  let dir: string;
  try {
    dir = await ensureProject(ctx.projectsRoot, ctx.projectId);
  } catch (err) {
    return {
      ok: false,
      error: `invalid projectId for video storage: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let apiKey = ctx.upstreamApiKey;
  let baseUrl = ctx.upstreamBaseUrl || SENSEAUDIO_DEFAULT_BASE_URL;
  if (!apiKey) {
    const resolved = await resolveProviderConfig(ctx.projectRoot, 'senseaudio');
    apiKey = resolved.apiKey || '';
    if (resolved.baseUrl) baseUrl = resolved.baseUrl;
  }
  if (!apiKey) {
    return { ok: false, error: 'no SenseAudio API key available' };
  }
  const trimmedBase = baseUrl.replace(/\/+$/, '');

  // Step 1: POST /v1/video/create → task_id.
  let taskId: string;
  try {
    const resp = await fetch(`${trimmedBase}/v1/video/create`, withToolRequestInit(ctx, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: SENSEAUDIO_VIDEO_MODEL,
        content: [{ type: 'text', text: prompt }],
        duration,
        resolution,
        ratio,
        provider_specific: { generate_audio: generateAudio },
      }),
    }));
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return {
        ok: false,
        error: `senseaudio video create ${resp.status}: ${text.slice(0, 240)}`,
      };
    }
    const data = (await resp.json()) as { task_id?: string };
    if (typeof data?.task_id !== 'string' || !data.task_id) {
      return { ok: false, error: 'senseaudio video create response missing task_id' };
    }
    taskId = data.task_id;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Step 2: poll /v1/video/status until completed / failed / timeout.
  const pollIntervalMs = ctx.videoPollIntervalMs ?? SENSEAUDIO_VIDEO_POLL_INTERVAL_MS_DEFAULT;
  let videoUrl = '';
  for (let attempt = 0; attempt < SENSEAUDIO_VIDEO_MAX_POLLS; attempt++) {
    await sleep(pollIntervalMs);
    let statusResp: Response;
    try {
      statusResp = await fetch(
        `${trimmedBase}/v1/video/status?id=${encodeURIComponent(taskId)}`,
        withToolRequestInit(ctx, {
          method: 'GET',
          headers: { authorization: `Bearer ${apiKey}` },
        }),
      );
    } catch (err) {
      return {
        ok: false,
        error: `senseaudio video poll failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (!statusResp.ok) {
      const text = await statusResp.text().catch(() => '');
      return {
        ok: false,
        error: `senseaudio video status ${statusResp.status}: ${text.slice(0, 240)}`,
      };
    }
    const data = (await statusResp.json()) as {
      status?: string;
      progress?: number;
      video_url?: string;
      error_message?: string;
    };
    if (data?.status === 'completed') {
      if (typeof data.video_url !== 'string' || !data.video_url) {
        return { ok: false, error: 'senseaudio video status completed but missing video_url' };
      }
      videoUrl = data.video_url;
      break;
    }
    if (data?.status === 'failed') {
      return {
        ok: false,
        error: `senseaudio video failed: ${data.error_message || 'unknown reason'}`,
      };
    }
    // pending / processing — continue polling. Emit a periodic log line
    // so a stuck job surfaces in the daemon log instead of silently
    // burning attempts.
    if ((attempt + 1) % SENSEAUDIO_VIDEO_PROGRESS_LOG_EVERY === 0) {
      const pct = typeof data.progress === 'number' ? data.progress : '?';
      console.log(
        `[proxy:senseaudio] generate_video poll ${attempt + 1}/${SENSEAUDIO_VIDEO_MAX_POLLS} task=${taskId} status=${data.status ?? 'unknown'} progress=${pct}`,
      );
    }
  }
  if (!videoUrl) {
    return {
      ok: false,
      error: `senseaudio video timed out after ${SENSEAUDIO_VIDEO_MAX_POLLS} polls`,
    };
  }

  // Step 3: download the mp4 bytes and persist into the project folder.
  // Re-validate the returned URL through validateBaseUrlResolved so a
  // malicious gateway can't point us at 169.254.169.254 (AWS / Azure
  // metadata service) or RFC1918 hosts via the response payload.
  const videoUrlCheck = await assertExternalAssetUrl(videoUrl);
  if (!videoUrlCheck.ok) return { ok: false, error: videoUrlCheck.error };

  let bytes: Buffer;
  try {
    const videoResp = await fetch(videoUrl, withToolRequestInit(ctx, { redirect: 'error' }));
    if (!videoResp.ok) {
      return { ok: false, error: `video download ${videoResp.status}` };
    }
    bytes = Buffer.from(await videoResp.arrayBuffer());
  } catch (err) {
    return {
      ok: false,
      error: `video download failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (bytes.length === 0) {
    return { ok: false, error: 'video download returned zero bytes' };
  }
  const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  const filename = `byok-video-${id}.mp4`;
  await writeFile(path.join(dir, filename), bytes);

  return {
    ok: true,
    url: `/api/projects/${encodeURIComponent(ctx.projectId)}/files/${filename}`,
  };
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
