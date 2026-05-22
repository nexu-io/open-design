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
import { writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { assertExternalAssetUrl } from './connectionTest.js';
import { resolveProviderConfig } from './media-config.js';
import { IMAGE_MODELS } from './media-models.js';
import { ensureProject } from './projects.js';

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
  /** Test-only override for the video polling interval (ms). Production
   *  uses 5 s (SenseAudio's recommendation) — tests pass small values
   *  (e.g. 1 ms) to keep the suite fast without changing the polling
   *  semantics. */
  videoPollIntervalMs?: number;
}

export interface ImageToolResult {
  ok: boolean;
  /** Daemon-served URL on success. */
  url?: string;
  /** Short human-readable failure reason. Stuffed into the `tool` role
   *  reply so the LLM can apologize / retry. */
  error?: string;
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
    const resp = await fetch(appendSenseAudioApiPath(baseUrl, '/t2a_v2'), {
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
    });
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
  let imageUrl: string;
  try {
    const resp = await fetch(`${trimmedBase}/v1/image/sync`, {
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
    });
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
    const imgResp = await fetch(imageUrl, { redirect: 'error' });
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
    const resp = await fetch(`${trimmedBase}/v1/video/create`, {
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
    });
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
        {
          method: 'GET',
          headers: { authorization: `Bearer ${apiKey}` },
        },
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
    const videoResp = await fetch(videoUrl, { redirect: 'error' });
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
