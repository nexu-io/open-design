// Media-generation dispatcher. The unifying contract is:
//
//   skills + metadata + system-prompt
//        ↓ (the code agent decides what to make)
//   `od media generate --surface … --model … --output … --prompt …`
//        ↓ (this module routes to a provider)
//   bytes written to <projectsRoot>/<projectId>/<output>
//        ↓
//   FileViewer renders it.
//
// Every surface (image / video / audio) flows through this single
// entrypoint. Providers live behind the `provider` field on each model
// entry in media-models.js — when a real integration ships we route to
// it; otherwise we emit a deterministic, lightweight placeholder
// (labelled SVG-PNG, silent WAV/MP3, blank MP4) so the framework works
// without API keys.
//
// Today we ship real integrations for:
//   * provider 'openai'     → OpenAI Images API (gpt-image-* / dall-e-*),
//                              plus text-to-speech via /v1/audio/speech,
//                              with auto-detection for Azure OpenAI
//                              deployments based on the configured base URL
//   * provider 'volcengine' → Volcengine Ark async tasks API for
//                              Doubao Seedance 2.0 (video) and Seedream
//                              (image)
//   * provider 'grok'       → xAI Imagine API: synchronous
//                              /v1/images/generations for grok-imagine-image
//                              and async /v1/videos/generations + GET poll
//                              for grok-imagine-video (t2v + i2v + audio)
//
// The fallback stub handlers are gated behind OD_MEDIA_ALLOW_STUBS=1; in
// release builds they throw StubProviderDisabledError (mapped to HTTP
// 503) instead of writing placeholder bytes that look like a successful
// generation. Real-provider failures still produce a stub byte payload
// when stubs are allowed, but they tag the response with providerError
// so the CLI can exit non-zero and the agent can't silently narrate the
// placeholder as the final result.

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFile as execFileCb, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Agent as UndiciAgent } from 'undici';
import {
  AUDIO_DURATIONS_SEC,
  type AudioKind,
  type MediaModel,
  type MediaProvider,
  type MediaSurface,
  VIDEO_LENGTHS_SEC,
  findMediaModel,
  findProvider,
  modelsForSurface,
} from './media-models.js';
import { resolveProviderConfig } from './media-config.js';
import {
  ensureProject,
  kindFor,
  mimeFor,
  sanitizeName,
} from './projects.js';

const execFile = promisify(execFileCb);
type ProviderConfig = { apiKey?: string; baseUrl?: string; model?: string };
type ProgressFn = (message: string) => void;
type ImageRef = { path: string; abs: string; mime: string; size: number; dataUrl: string };
type MediaContext = {
  surface: MediaSurface;
  model: string;
  modelDef: MediaModel;
  provider: MediaProvider | null;
  prompt: string;
  aspect: string | undefined;
  length: number | undefined;
  duration: number | undefined;
  voice: string;
  audioKind: AudioKind | undefined;
  language: string;
  loop: boolean;
  promptInfluence: number | undefined;
  compositionDir: string | null;
  imageRef: ImageRef | null;
};
type RenderResult = { bytes: Buffer; providerNote: string; suggestedExt?: string };
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errorStringProp(err: unknown, key: string): string {
  return isRecord(err) && typeof err[key] === 'string' ? err[key] : '';
}
const NANOBANANA_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
// Verify the current Nano Banana / Gemini image model name against:
// https://ai.google.dev/gemini-api/docs/models
const NANOBANANA_DEFAULT_MODEL = 'gemini-3.1-flash-image-preview';
const NANOBANANA_DEFAULT_IMAGE_SIZE = '1K';

const DEFAULT_OUTPUT_BY_SURFACE = {
  image: 'image.png',
  video: 'video.mp4',
  audio: 'audio.mp3',
};

const SURFACES = new Set(['image', 'video', 'audio']);
const AUDIO_KINDS = new Set(['music', 'speech', 'sfx']);

// Stubs ship a 1×1 PNG / ~24-byte mp4 / silent WAV / single-frame mp3 so
// the dispatch path is exercisable before real provider integrations
// land. On a release build that lands as "successful" but functionally
// empty bytes — confusing to users. We therefore gate the stub renderers
// behind OD_MEDIA_ALLOW_STUBS=1 and otherwise return a 503 (mapped from
// the StubProviderDisabledError thrown below) with a clear message.
class StubProviderDisabledError extends Error {
  code = 'STUB_PROVIDER_DISABLED';
  status = 503;
  constructor(model: string) {
    super(
      `provider not configured: ${model}. Add your API key in Settings -> Media Providers to enable real generation.`,
    );
    this.name = 'StubProviderDisabledError';
  }
}

function stubsAllowed() {
  const v = process.env.OD_MEDIA_ALLOW_STUBS;
  return v === '1' || v === 'true';
}

/**
 * Resolve a project-relative `--image` path into a base64 data URL the
 * upstream model APIs (Volcengine i2v, OpenAI image-edit, etc.) accept
 * directly. Returns null when no path was supplied.
 *
 * Security: refuses anything that escapes the project directory.
 * Without this guard, an agent (or a hallucinated arg) could ask the
 * daemon to upload `/etc/passwd` to a paid model.
 */
async function resolveProjectImage(rel: unknown, projectDir: string): Promise<ImageRef | null> {
  if (typeof rel !== 'string' || !rel.trim()) return null;
  const projectRootResolved = path.resolve(projectDir);
  const abs = path.resolve(projectRootResolved, rel.trim());
  if (
    abs !== projectRootResolved &&
    !abs.startsWith(projectRootResolved + path.sep)
  ) {
    throw new Error(
      `--image path "${rel}" resolves outside the project directory.`,
    );
  }
  let info;
  try {
    info = await stat(abs);
  } catch {
    throw new Error(`--image not found: ${rel}`);
  }
  if (!info.isFile()) {
    throw new Error(`--image is not a regular file: ${rel}`);
  }
  // Cap at 16 MB. Beyond this, base64 inflation alone (≈4/3) starts
  // hitting body-size limits at the upstream APIs and our own express
  // 4mb body cap on inbound requests; bigger payloads should travel
  // via the dedicated upload endpoint, not the dispatcher.
  const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
  if (info.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `--image too large (${info.size} bytes; max ${MAX_IMAGE_BYTES}).`,
    );
  }
  const bytes = await readFile(abs);
  const ext = path.extname(abs).toLowerCase();
  // Tight allowlist: only what i2v / image-edit endpoints actually
  // consume. Avoids smuggling arbitrary content through as data URLs.
  const mime = ({
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  })[ext];
  if (!mime) {
    throw new Error(
      `--image has unsupported extension "${ext}". Use png, jpg, jpeg, webp, or gif.`,
    );
  }
  return {
    path: rel.trim(),
    abs,
    mime,
    size: bytes.length,
    dataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
  };
}

function clampNumber(value: unknown, allowed: number[]): number | undefined {
  // Accept exact registry values; otherwise snap to the nearest allowed
  // bucket so a hallucinated `Number.MAX_SAFE_INTEGER` can't bill an
  // entire month of credits when real providers plug in.
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (allowed.length === 0) return undefined;
  if (allowed.includes(value)) return value;
  let best = allowed[0]!;
  let bestDiff = Math.abs(value - best);
  for (const a of allowed) {
    const d = Math.abs(value - a);
    if (d < bestDiff) {
      best = a;
      bestDiff = d;
    }
  }
  return best;
}

function clampWithWarning(value: unknown, allowed: number[], flagName: string): { value: number | undefined; warning: string | null } {
  const clamped = clampNumber(value, allowed);
  if (
    typeof value === 'number'
    && Number.isFinite(value)
    && typeof clamped === 'number'
    && clamped !== value
  ) {
    return {
      value: clamped,
      warning: `--${flagName} ${value} clamped to ${clamped} (allowed: ${allowed.join(', ')})`,
    };
  }
  return { value: clamped, warning: null };
}

/**
 * Generate a media artifact and write it into the project's files dir.
 *
 * @param {Object} args
 * @param {string} args.projectRoot   - Repo root (.od/ lives directly under).
 * @param {string} args.projectsRoot  - Absolute path to <repo>/.od/projects.
 * @param {string} args.projectId
 * @param {'image'|'video'|'audio'} args.surface
 * @param {string} args.model
 * @param {string} [args.prompt]
 * @param {string} [args.output]
 * @param {string} [args.aspect]
 * @param {number} [args.length]
 * @param {number} [args.duration]
 * @param {string} [args.voice]
 * @param {string} [args.audioKind]
 * @param {string} [args.language]
 * @returns {Promise<{ name: string, size: number, mtime: number, kind: string, mime: string, model: string, surface: string, providerNote: string, providerId: string }>}
 */
export async function generateMedia(args: {
  projectRoot: string; projectsRoot: string; projectId: string; surface: MediaSurface; model: string;
  prompt?: string; output?: string; aspect?: string; length?: number; duration?: number; voice?: string;
  audioKind?: AudioKind; language?: string; loop?: boolean; promptInfluence?: number;
  compositionDir?: string; image?: string; onProgress?: ProgressFn;
}) {
  const {
    projectRoot,
    projectsRoot,
    projectId,
    surface,
    model,
    prompt,
    output,
    aspect,
    length,
    duration,
    voice,
    audioKind,
    language,
    loop,
    promptInfluence,
    compositionDir,
    image,
  } = args;

  if (!projectRoot) throw new Error('projectRoot required');
  if (!projectsRoot) throw new Error('projectsRoot required');
  if (typeof projectId !== 'string' || !projectId) {
    throw new Error('projectId required');
  }
  if (!SURFACES.has(surface)) {
    throw new Error(`unsupported surface: ${surface}`);
  }
  if (typeof model !== 'string' || !model) {
    throw new Error('model required');
  }
  if (surface === 'audio' && audioKind && !AUDIO_KINDS.has(audioKind)) {
    throw new Error(
      `unsupported audioKind: ${audioKind}. Allowed: music | speech | sfx.`,
    );
  }
  const def = findMediaModel(model);
  if (!def) {
    throw new Error(
      `unknown model: ${model}. Pass --model from the registered list (see /api/media/models).`,
    );
  }
  // Reject cross-surface combinations (e.g. surface=image + model=seedance-2)
  // here so the dispatcher never silently routes a video model id through
  // the image renderer. We compare against the surface-specific list — for
  // audio we further restrict to the kind-specific bucket so a `music`
  // surface can't bill an `elevenlabs-v3` (speech) call.
  const resolvedAudioKind =
    surface === 'audio' ? audioKind || 'music' : undefined;
  const allowed = modelsForSurface(surface, resolvedAudioKind);
  if (!allowed.some((m) => m.id === model)) {
    const ids = allowed.map((m) => m.id).join(', ');
    const where =
      surface === 'audio' ? `audio · ${resolvedAudioKind}` : surface;
    throw new Error(
      `model "${model}" is not registered for surface "${where}". Allowed: ${ids}.`,
    );
  }

  // Clamp registry-bound numeric inputs to their allowed buckets so a
  // hallucinated --length 9999999 doesn't reach a real provider as-is
  // when stubs are swapped for paid integrations.
  const lengthClamp =
    surface === 'video'
      ? clampWithWarning(length, VIDEO_LENGTHS_SEC, 'length')
      : { value: undefined, warning: null };
  const usesProviderSpecificAudioDuration =
    def.provider === 'elevenlabs'
    && surface === 'audio'
    && resolvedAudioKind === 'sfx';
  const durationClamp =
    surface === 'audio' && !usesProviderSpecificAudioDuration
      ? clampWithWarning(duration, AUDIO_DURATIONS_SEC, 'duration')
      : { value: undefined, warning: null };
  const clampedLength = lengthClamp.value;
  const clampedDuration = usesProviderSpecificAudioDuration
    ? duration
    : durationClamp.value;
  const warnings = [lengthClamp.warning, durationClamp.warning].filter(Boolean);

  const dir = await ensureProject(projectsRoot, projectId);
  const safeOut = sanitizeName(
    output || autoOutputName(surface, model, resolvedAudioKind),
  );
  const target = path.join(dir, safeOut);
  await mkdir(path.dirname(target), { recursive: true });

  // Reference image for image-to-video / image-edit flows. The agent
  // passes a project-relative path; we read it once here, validate it
  // stays inside the project, and turn it into a base64 data URL the
  // upstream APIs accept directly. Renderers consume `ctx.imageRef`
  // and decide how to splice the data URL into their request.
  const imageRef = await resolveProjectImage(image, dir);

  const ctx = {
    surface,
    model,
    modelDef: def,
    provider: findProvider(def.provider),
    prompt: prompt || '',
    aspect: aspect || defaultAspectFor(surface),
    length: clampedLength,
    duration: clampedDuration,
    voice: voice || '',
    audioKind: resolvedAudioKind,
    language: language || '',
    loop: loop === true,
    promptInfluence: typeof promptInfluence === 'number' && Number.isFinite(promptInfluence)
      ? promptInfluence
      : undefined,
    // Project-relative path to the directory the agent scaffolded with
    // hyperframes.json / meta.json / index.html. Only consumed by the
    // hyperframes renderer; null/empty for every other provider.
    compositionDir: typeof compositionDir === 'string' ? compositionDir : null,
    // Resolved reference image for i2v / image-edit flows. `null` when
    // the agent didn't pass --image. See resolveProjectImage below.
    imageRef,
  };

  const credentials = await resolveProviderConfig(projectRoot, def.provider);

  let bytes: Buffer;
  let providerNote: string;
  let suggestedExt: string | undefined;
  // Tracks whether the bytes came from a real provider call or from the
  // stub fallback. Surfaces in the response so the CLI/agent can tell a
  // legitimate placeholder ("provider not integrated yet") apart from a
  // silent failure ("API call blew up, here's a 67-byte PNG"). Without
  // this flag the chat agent narrates the stub as if it's the expected
  // output, and the user sees a blank file.
  let providerError: string | null = null;
  let usedStubFallback = false;
  // True only when the dispatcher intentionally returned a stub because
  // no real renderer is wired up for this (provider, surface) pair.
  let intentionalStub = false;
  try {
    if (def.provider === 'openai' && surface === 'image') {
      const result = await renderOpenAIImage(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (
      def.provider === 'openai'
      && surface === 'audio'
      && ctx.audioKind === 'speech'
    ) {
      const result = await renderOpenAISpeech(ctx, credentials, safeOut);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'volcengine' && surface === 'video') {
      const result = await renderVolcengineVideo(ctx, credentials, args.onProgress);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'volcengine' && surface === 'image') {
      const result = await renderVolcengineImage(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'grok' && surface === 'image') {
      const result = await renderGrokImage(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'grok' && surface === 'video') {
      const result = await renderGrokVideo(ctx, credentials, args.onProgress);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'nanobanana' && surface === 'image') {
      const result = await renderNanoBananaImage(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (
      def.provider === 'elevenlabs'
      && surface === 'audio'
      && ctx.audioKind === 'speech'
    ) {
      const result = await renderElevenLabsTTS(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (
      def.provider === 'elevenlabs'
      && surface === 'audio'
      && ctx.audioKind === 'sfx'
    ) {
      const result = await renderElevenLabsSfx(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'hyperframes' && surface === 'video') {
      // HyperFrames is templated by the agent (it reads the vendored
      // skill at skills/hyperframes/SKILL.md and writes a composition
      // HTML based on the user's prompt). But the actual `npx
      // hyperframes render` step runs HERE in the daemon process, not
      // in the agent's shell. Reason: the agent's shell on macOS
      // (Claude Code in particular) is wrapped in `sandbox-exec`, and
      // puppeteer's Chrome subprocess hangs partway through frame
      // capture under that sandbox. The daemon process is unsandboxed,
      // so puppeteer behaves correctly. Agent-side npx is reserved for
      // the lighter HF subcommands (lint, transcribe, tts) that don't
      // need to spawn Chrome.
      const result = await renderHyperFramesViaCli(ctx, dir, args.onProgress);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'minimax' && surface === 'audio') {
      const result = await renderMinimaxTTS(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else if (def.provider === 'fishaudio' && surface === 'audio') {
      const result = await renderFishAudioTTS(ctx, credentials);
      bytes = result.bytes;
      providerNote = result.providerNote;
      suggestedExt = result.suggestedExt;
    } else {
      // No real renderer wired up for this (provider, surface). Gate the
      // stub fallback behind OD_MEDIA_ALLOW_STUBS so release builds don't
      // silently write placeholder bytes to disk and confuse the user.
      if (!stubsAllowed()) {
        throw new StubProviderDisabledError(model);
      }
      const result = await renderStub(ctx, safeOut);
      bytes = result.bytes;
      providerNote = result.providerNote;
      intentionalStub = true;
    }
  } catch (err) {
    // Stub-disabled errors are intentional — propagate so the daemon
    // maps them to 503 and the CLI surfaces a clear "configure a real
    // provider" message rather than writing fake bytes.
    if (err instanceof StubProviderDisabledError) {
      throw err;
    }
    // A real provider failed (network blip, 4xx, missing key, …). We
    // still want to fall back to a stub so the agent's chat loop
    // doesn't dead-end — but only when stubs are allowed for this
    // build. Otherwise re-throw so the CLI exits non-zero with the
    // real upstream message.
    if (!stubsAllowed()) {
      throw err;
    }
    const stub = await renderStub(ctx, safeOut);
    bytes = stub.bytes;
    const msg = errorMessage(err);
    providerNote = `[${def.provider} error → stub] ${msg}`;
    providerError = msg;
    usedStubFallback = true;
    // Also log to daemon stderr so the failure is visible in the daemon
    // terminal — easiest place for the developer/operator to spot it.
    try {
      console.error(
        `[media] ${def.provider}/${surface}/${model} failed: ${msg}`,
      );
    } catch {
      // best-effort logging only
    }
  }
  // Tag the providerNote with `[stub]` only when the bytes actually came
  // from the stub renderer — either as the intentional fallback for an
  // unintegrated (provider, surface) pair, or because a real-provider
  // call failed and we wrote a placeholder. Real-provider successes keep
  // the renderer's own note (e.g. "openai/gpt-image-2 · 1:1 · 1.2 MB")
  // untouched so the FileViewer toolbar shows the truth.
  if (intentionalStub || usedStubFallback) {
    providerNote = `[stub] ${providerNote}`;
  }

  // If the real provider returned a different extension than the
  // requested filename, swap it. Saves the agent from having to guess
  // (.png vs .jpg vs .webp) before it knows what the model emits.
  let finalOut = safeOut;
  if (suggestedExt) {
    const dot = safeOut.lastIndexOf('.');
    const stem = dot > 0 ? safeOut.slice(0, dot) : safeOut;
    finalOut = `${stem}${suggestedExt}`;
  }
  const finalTarget = path.join(dir, finalOut);
  await writeFile(finalTarget, bytes);
  const st = await stat(finalTarget);
  return {
    name: finalOut,
    size: st.size,
    mtime: st.mtimeMs,
    kind: kindFor(finalOut),
    mime: mimeFor(finalOut),
    model,
    surface,
    providerNote,
    providerId: def.provider,
    providerError,
    usedStubFallback,
    intentionalStub,
    warnings,
  };
}

function autoOutputName(surface: MediaSurface, model: string, audioKind?: AudioKind): string {
  const base = DEFAULT_OUTPUT_BY_SURFACE[surface] || 'artifact.bin';
  const stamp = Date.now().toString(36);
  // Slug the model id so the filename stays short and shell-safe.
  const slug = String(model).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32);
  const tag = surface === 'audio' && audioKind ? `${audioKind}-${slug}` : slug;
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  return `${stem}-${tag}-${stamp}${ext}`;
}

function defaultAspectFor(surface: MediaSurface): string | undefined {
  if (surface === 'image') return '1:1';
  if (surface === 'video') return '16:9';
  return undefined;
}

// ---------------------------------------------------------------------------
// Provider: OpenAI Images API (gpt-image-2, gpt-image-1.5, dall-e-3 …)
//
// We support both the canonical OpenAI endpoint AND Azure-hosted
// OpenAI deployments behind the same provider slot — Azure is detected
// from the base URL (`*.azure.com` host or a `/deployments/<name>`
// segment in the path). For Azure we additionally:
//   * append `?api-version=…` (default 2024-02-01, unless the user has
//     already encoded one into the base URL),
//   * send the api-key header in addition to Authorization (Azure
//     accepts either; some setups only honor api-key),
//   * drop the `model` field from the body since the deployment in the
//     path already names the model.
// ---------------------------------------------------------------------------

const AZURE_DEFAULT_API_VERSION = '2024-02-01';
const OPENAI_IMAGE_HEADERS_TIMEOUT_MS = 10 * 60 * 1000;
const OPENAI_IMAGE_BODY_TIMEOUT_MS = 10 * 60 * 1000;
const openAIImageDispatcher = new UndiciAgent({
  headersTimeout: OPENAI_IMAGE_HEADERS_TIMEOUT_MS,
  bodyTimeout: OPENAI_IMAGE_BODY_TIMEOUT_MS,
});

async function renderOpenAIImage(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error('no OpenAI credential — configure an API key in Settings, set OPENAI_API_KEY, or refresh Codex/Hermes OAuth');
  }
  const rawBase = credentials.baseUrl || 'https://api.openai.com/v1';
  const azure = detectAzureEndpoint(rawBase);
  const url = buildOpenAIImageUrl(rawBase, azure);

  const body: Record<string, unknown> = {
    prompt: ctx.prompt || 'A high-quality reference image.',
    n: 1,
    size: openaiSizeFor(ctx.model, ctx.aspect),
  };
  // For non-Azure calls, include `model` in the body. Azure infers it
  // from the deployment in the path so omitting it keeps payloads
  // compatible across both flavors.
  if (!azure) {
    body.model = ctx.model;
  }
  // gpt-image-* returns b64_json by default and rejects response_format,
  // so we only pass it for dall-e-* (where it's required).
  if (ctx.model.startsWith('dall-e-')) {
    body.response_format = 'b64_json';
    body.quality = ctx.model === 'dall-e-3' ? 'hd' : 'standard';
  } else {
    // gpt-image-* accepts quality 'high' | 'medium' | 'low'.
    body.quality = 'high';
  }

  const headers: Record<string, string> = {
    'authorization': `Bearer ${credentials.apiKey}`,
    'content-type': 'application/json',
  };
  if (azure) {
    // Azure's canonical auth header. Some deployments accept Bearer
    // (the curl example we tested against does) but api-key is what
    // their docs document, so send both. OpenAI ignores unknown
    // headers, so this is harmless on the standard endpoint too.
    headers['api-key'] = credentials.apiKey;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    dispatcher: openAIImageDispatcher as unknown as NonNullable<RequestInit['dispatcher']>,
  });
  const text = await resp.text();
  if (!resp.ok) {
    const tag = azure ? 'azure-openai' : 'openai';
    throw new Error(`${tag} ${resp.status}: ${truncate(text, 240)}`);
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`openai non-JSON response: ${truncate(text, 200)}`);
  }
  const entry = data && Array.isArray(data.data) ? data.data[0] : null;
  if (!entry) throw new Error('openai response had no data[0]');
  let bytes;
  if (entry.b64_json) {
    bytes = Buffer.from(entry.b64_json, 'base64');
  } else if (entry.url) {
    const imgResp = await fetch(entry.url);
    if (!imgResp.ok) throw new Error(`openai image fetch ${imgResp.status}`);
    const arr = await imgResp.arrayBuffer();
    bytes = Buffer.from(arr);
  } else {
    throw new Error('openai response had neither b64_json nor url');
  }

  const tag = azure ? 'azure-openai' : 'openai';
  return {
    bytes,
    providerNote: `${tag}/${ctx.model} · ${ctx.aspect} · ${bytes.length} bytes`,
    suggestedExt: '.png',
  };
}

/**
 * Heuristic: do we think this base URL points at an Azure OpenAI
 * deployment rather than the public OpenAI API?
 *
 *   true examples
 *     https://x.cognitiveservices.azure.com/openai/deployments/gpt-image-2
 *     https://x.openai.azure.com/openai/deployments/foo
 *     /openai/deployments/foo?api-version=2024-02-01
 *   false examples
 *     https://api.openai.com/v1
 *     http://localhost:8080/v1
 */
function detectAzureEndpoint(baseUrl: string): boolean {
  if (typeof baseUrl !== 'string' || !baseUrl) return false;
  if (/\.azure\.com\b/i.test(baseUrl)) return true;
  if (/\/openai\/deployments\//i.test(baseUrl)) return true;
  return false;
}

/**
 * Build the full /images/generations URL, preserving any user-supplied
 * query string (e.g. an explicit `?api-version=2024-12-01`) and
 * appending the default api-version for Azure when the user didn't
 * specify one. Returns a string ready for `fetch`.
 */
function buildOpenAIImageUrl(baseUrl: string, isAzure: boolean): string {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    // Bad URL — fall back to naive concat so the upstream error is
    // surfaced through the normal HTTP path rather than a parse crash.
    const stripped = baseUrl.replace(/\/$/, '');
    return `${stripped}/images/generations`;
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') + '/images/generations';
  if (isAzure && !parsed.searchParams.has('api-version')) {
    parsed.searchParams.set('api-version', AZURE_DEFAULT_API_VERSION);
  }
  return parsed.toString();
}

function openaiSizeFor(model: string, aspect?: string): string {
  // gpt-image-1.5 / gpt-image-2 accept arbitrary sizes up to 4096; we
  // pick concrete ones tuned to common aspects so the API never
  // negotiates them down silently.
  if (model.startsWith('gpt-image-')) {
    if (aspect === '16:9') return '1792x1024';
    if (aspect === '9:16') return '1024x1792';
    if (aspect === '4:3') return '1408x1056';
    if (aspect === '3:4') return '1056x1408';
    return '1024x1024';
  }
  if (model === 'dall-e-3') {
    if (aspect === '16:9') return '1792x1024';
    if (aspect === '9:16') return '1024x1792';
    return '1024x1024';
  }
  // dall-e-2 only supports 256/512/1024 squares.
  return '1024x1024';
}

const OPENAI_TTS_VOICES = new Set([
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'sage',
  'shimmer',
  'verse',
]);

function buildOpenAISpeechUrl(baseUrl: string, isAzure: boolean): string {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    const stripped = baseUrl.replace(/\/$/, '');
    return `${stripped}/audio/speech`;
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') + '/audio/speech';
  if (isAzure && !parsed.searchParams.has('api-version')) {
    parsed.searchParams.set('api-version', AZURE_DEFAULT_API_VERSION);
  }
  return parsed.toString();
}

function openaiSpeechFormatFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.wav') return 'wav';
  if (ext === '.flac') return 'flac';
  if (ext === '.aac') return 'aac';
  if (ext === '.opus' || ext === '.ogg' || ext === '.oga') return 'opus';
  return 'mp3';
}

async function renderOpenAISpeech(ctx: MediaContext, credentials: ProviderConfig, fileName: string): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error('no OpenAI credential — configure an API key in Settings, set OPENAI_API_KEY, or refresh Codex/Hermes OAuth');
  }
  const rawBase = credentials.baseUrl || 'https://api.openai.com/v1';
  const azure = detectAzureEndpoint(rawBase);
  const url = buildOpenAISpeechUrl(rawBase, azure);
  const format = openaiSpeechFormatFor(fileName);
  const text = (ctx.prompt && ctx.prompt.trim()) || 'This is a test.';

  let voiceId = 'alloy';
  let instructions = '';
  const requestedVoice = (ctx.voice && ctx.voice.trim()) || '';
  if (requestedVoice) {
    if (OPENAI_TTS_VOICES.has(requestedVoice)) {
      voiceId = requestedVoice;
    } else {
      // gpt-4o-mini-tts accepts free-form speaking style instructions.
      // If the UI metadata carries prose rather than a concrete voice id,
      // preserve it here instead of surfacing a provider error.
      instructions = requestedVoice;
    }
  }

  const body: Record<string, unknown> = {
    input: text,
    voice: voiceId,
    response_format: format,
  };
  if (!azure) {
    body.model = ctx.model;
  }
  if (instructions && ctx.model === 'gpt-4o-mini-tts') {
    body.instructions = instructions;
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${credentials.apiKey}`,
    'content-type': 'application/json',
  };
  if (azure) {
    headers['api-key'] = credentials.apiKey;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    const tag = azure ? 'azure-openai' : 'openai';
    throw new Error(`${tag} speech ${resp.status}: ${truncate(text, 240)}`);
  }
  const arr = await resp.arrayBuffer();
  const bytes = Buffer.from(arr);
  if (bytes.length === 0) {
    throw new Error('openai speech returned zero bytes');
  }
  const tag = azure ? 'azure-openai' : 'openai';
  const noteBits = [`${tag}/${ctx.model}`, voiceId, `${format}`, `${bytes.length} bytes`];
  if (instructions) noteBits.splice(2, 0, 'styled');
  return {
    bytes,
    providerNote: noteBits.join(' · '),
    suggestedExt: format === 'opus' ? '.ogg' : `.${format}`,
  };
}

// ---------------------------------------------------------------------------
// Provider: Volcengine Ark — Doubao Seedance 2.0 video.
//
// Docs:
//   POST /api/v3/contents/generations/tasks   → { id }
//   GET  /api/v3/contents/generations/tasks/{id} → { status, content: { video_url } }
// We submit, poll until succeeded/failed, then fetch the produced
// video_url and return the raw bytes. The temporary URL Volcengine
// returns is only valid for ~24h, so streaming the bytes into the
// project folder is required to keep them addressable.
// ---------------------------------------------------------------------------

async function renderVolcengineVideo(ctx: MediaContext, credentials: ProviderConfig, onProgress?: ProgressFn): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no Volcengine Ark API key — configure it in Settings or set ARK_API_KEY',
    );
  }
  const baseUrl = (credentials.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '');

  // Seedance accepts inline `--resolution`, `--duration`, `--ratio` and
  // `--camerafixed` flags inside the prompt text. We append a flags
  // suffix so user prompts that already contain them still win.
  const ratio = volcengineRatioFor(ctx.aspect);
  const durationSec = ctx.length || 5;
  const resolution = '720p';
  const promptText = (ctx.prompt && ctx.prompt.trim()) || 'A short cinematic clip.';
  const suffixFlags: string[] = [];
  if (!/--resolution\b/.test(promptText)) suffixFlags.push(`--resolution ${resolution}`);
  if (!/--duration\b/.test(promptText)) suffixFlags.push(`--duration ${durationSec}`);
  if (!/--ratio\b/.test(promptText)) suffixFlags.push(`--ratio ${ratio}`);
  const fullText = suffixFlags.length
    ? `${promptText} ${suffixFlags.join(' ')}`
    : promptText;

  // Seedance i2v (and seedance-2.0/-fast which support both modes)
  // accept an additional `image_url` content entry — Volcengine treats
  // it as the first frame and animates from there. We pass the data
  // URL directly; the API does not require a public URL. When no
  // image is provided, this is a regular t2v call.
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: fullText }];
  if (ctx.imageRef && ctx.imageRef.dataUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: ctx.imageRef.dataUrl },
    });
  }

  const taskBody = {
    model: ctx.model,
    content,
  };

  const taskResp = await fetch(`${baseUrl}/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(taskBody),
  });
  const taskText = await taskResp.text();
  if (!taskResp.ok) {
    throw new Error(`volcengine task create ${taskResp.status}: ${truncate(taskText, 240)}`);
  }
  let taskData: any;
  try {
    taskData = JSON.parse(taskText);
  } catch {
    throw new Error(`volcengine non-JSON: ${truncate(taskText, 200)}`);
  }
  const taskId = taskData && taskData.id;
  if (!taskId) throw new Error('volcengine task response missing id');

  // Poll until succeeded/failed. Keep a hard cap, but make it long
  // enough for real Seedance queues: fast t2v often returns in 30-120s,
  // while i2v and busy-region t2v can exceed the old 6-minute ceiling.
  const startedAt = Date.now();
  const configuredMaxMs = Number(process.env.OD_VOLCENGINE_VIDEO_MAX_POLL_MS);
  const maxMs =
    Number.isFinite(configuredMaxMs) && configuredMaxMs >= 60_000
      ? configuredMaxMs
      : 12 * 60 * 1000;
  let videoUrl: string | null = null;
  let lastStatus = '';
  // Emit a "task accepted" line right away so the agent's chat shows
  // something within the first second instead of going silent for the
  // full poll loop. cc's Bash tool considers a long-quiet pipe stuck
  // and times out at ~2 minutes — Volcengine i2v routinely takes
  // 3-5 minutes, so without this stream, every i2v dispatch dies
  // mid-flight.
  if (typeof onProgress === 'function') {
    const mode = ctx.imageRef ? 'i2v' : 't2v';
    onProgress(`volcengine ${mode} task ${taskId} accepted; polling status…`);
  }
  while (Date.now() - startedAt < maxMs) {
    await sleep(4000);
    const pollResp = await fetch(`${baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
      headers: { 'authorization': `Bearer ${credentials.apiKey}` },
    });
    const pollText = await pollResp.text();
    if (!pollResp.ok) {
      throw new Error(`volcengine poll ${pollResp.status}: ${truncate(pollText, 240)}`);
    }
    let pollData: any;
    try {
      pollData = JSON.parse(pollText);
    } catch {
      throw new Error(`volcengine poll non-JSON: ${truncate(pollText, 200)}`);
    }
    lastStatus = pollData.status || '';
    // Forward each poll tick. Heartbeat doubles as a "command is alive"
    // signal for the agent's bash tool — the daemon's SSE stream emits
    // an event for every line, which cc renders into the chat as live
    // output so its watchdog never marks the call as hung.
    if (typeof onProgress === 'function') {
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      onProgress(`volcengine task ${taskId} status=${lastStatus || 'pending'} (elapsed ${elapsedSec}s)`);
    }
    if (lastStatus === 'succeeded') {
      videoUrl = pollData?.content?.video_url || null;
      break;
    }
    if (lastStatus === 'failed' || lastStatus === 'cancelled') {
      const reason = pollData?.error?.message || lastStatus;
      throw new Error(`volcengine task ${lastStatus}: ${reason}`);
    }
  }
  if (!videoUrl) {
    throw new Error(`volcengine task did not finish in time (last status: ${lastStatus || 'unknown'})`);
  }

  const dlResp = await fetch(videoUrl);
  if (!dlResp.ok) throw new Error(`volcengine video fetch ${dlResp.status}`);
  const arr = await dlResp.arrayBuffer();
  const bytes = Buffer.from(arr);

  return {
    bytes,
    providerNote: `volcengine/${ctx.model} · ${ratio} · ${durationSec}s · ${bytes.length} bytes`,
    suggestedExt: '.mp4',
  };
}

function volcengineRatioFor(aspect?: string): string {
  // Seedance accepts a fixed list of ratios; map the OD vocabulary to
  // its canonical strings.
  if (!aspect) return '16:9';
  if (aspect === '1:1' || aspect === '16:9' || aspect === '9:16' || aspect === '4:3' || aspect === '3:4') {
    return aspect;
  }
  return '16:9';
}

// Volcengine Seedream / Seededit images. Same auth, different endpoint:
// POST /api/v3/images/generations (OpenAI-compatible payload).
async function renderVolcengineImage(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error('no Volcengine Ark API key — configure it in Settings or set ARK_API_KEY');
  }
  const baseUrl = (credentials.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '');

  const body = {
    model: ctx.model,
    prompt: ctx.prompt || 'A high-quality reference image.',
    response_format: 'b64_json',
    size: openaiSizeFor(ctx.model, ctx.aspect),
  };
  const resp = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`volcengine image ${resp.status}: ${truncate(text, 240)}`);
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`volcengine image non-JSON: ${truncate(text, 200)}`);
  }
  const entry = data && Array.isArray(data.data) ? data.data[0] : null;
  if (!entry) throw new Error('volcengine image response had no data[0]');
  let bytes;
  if (entry.b64_json) {
    bytes = Buffer.from(entry.b64_json, 'base64');
  } else if (entry.url) {
    const imgResp = await fetch(entry.url);
    if (!imgResp.ok) throw new Error(`volcengine image fetch ${imgResp.status}`);
    bytes = Buffer.from(await imgResp.arrayBuffer());
  } else {
    throw new Error('volcengine image response missing b64_json/url');
  }
  return {
    bytes,
    providerNote: `volcengine/${ctx.model} · ${ctx.aspect} · ${bytes.length} bytes`,
    suggestedExt: '.png',
  };
}

// ---------------------------------------------------------------------------
// Provider: xAI Grok Imagine.
//
// Docs: https://docs.x.ai/developers/model-capabilities/{images,video}/generation
//   * Image: POST /v1/images/generations — synchronous, returns
//            {data:[{b64_json|url}]}; we ask for b64_json so the bytes
//            arrive in one round-trip.
//   * Video: POST /v1/videos/generations — may return the finished video
//            inline ({status:'done', video:{url}}) or an async stub
//            ({id, status:'pending'}); in the async case we poll
//            GET /v1/videos/{id} until status flips to done/failed.
//
// xAI's video model produces native audio (background music + SFX +
// ambient) synchronised with the visual; that's the headline
// differentiator vs Seedance and Sora and is why grok-imagine-video
// declares the `audio` capability.
// ---------------------------------------------------------------------------

async function renderGrokImage(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no xAI API key — configure it in Settings or set XAI_API_KEY',
    );
  }
  const baseUrl = (credentials.baseUrl || 'https://api.x.ai/v1').replace(/\/$/, '');

  const aspectRatio = grokAspectFor(ctx.aspect);
  const body = {
    model: ctx.model,
    prompt: ctx.prompt || 'A high-quality reference image.',
    n: 1,
    aspect_ratio: aspectRatio,
    response_format: 'b64_json',
  };
  const resp = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`grok image ${resp.status}: ${truncate(text, 240)}`);
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`grok image non-JSON: ${truncate(text, 200)}`);
  }
  const entry = data && Array.isArray(data.data) ? data.data[0] : null;
  if (!entry) throw new Error('grok image response had no data[0]');
  let bytes;
  if (entry.b64_json) {
    bytes = Buffer.from(entry.b64_json, 'base64');
  } else if (entry.url) {
    const imgResp = await fetch(entry.url);
    if (!imgResp.ok) throw new Error(`grok image fetch ${imgResp.status}`);
    bytes = Buffer.from(await imgResp.arrayBuffer());
  } else {
    throw new Error('grok image response missing b64_json/url');
  }
  // xAI's Imagine returns JPEG by default (no format option in the API
  // surface), but PNG/WebP are technically possible. Sniff the magic
  // bytes so the on-disk extension matches reality — saving JPEG bytes
  // as `.png` confuses Finder previews and any downstream consumer that
  // trusts the extension.
  return {
    bytes,
    providerNote: `grok/${ctx.model} · ${aspectRatio} · ${bytes.length} bytes`,
    suggestedExt: sniffImageExt(bytes),
  };
}

async function renderNanoBananaImage(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no Nano Banana API key — configure it in Settings or set OD_NANOBANANA_API_KEY',
    );
  }

  const baseUrl = (credentials.baseUrl || NANOBANANA_DEFAULT_BASE_URL).replace(/\/$/, '');
  const wireModel = (credentials.model || ctx.model || NANOBANANA_DEFAULT_MODEL).trim();
  const body = {
    contents: [{
      parts: [{
        text: ctx.prompt || 'A high-quality reference image.',
      }],
    }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: nanoBananaAspectFor(ctx.aspect),
        imageSize: NANOBANANA_DEFAULT_IMAGE_SIZE,
      },
    },
  };

  const resp = await fetch(`${baseUrl}/v1beta/models/${encodeURIComponent(wireModel)}:generateContent`, {
    method: 'POST',
    headers: nanoBananaHeaders(baseUrl, credentials.apiKey),
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`nano-banana image ${resp.status}: ${truncate(text, 240)}`);
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`nano-banana image non-JSON: ${truncate(text, 200)}`);
  }
  const bytes = inlineImageBytesFromGenerateContent(data);
  return {
    bytes,
    providerNote: `nano-banana/${wireModel} · ${nanoBananaAspectFor(ctx.aspect)} · ${NANOBANANA_DEFAULT_IMAGE_SIZE} · ${bytes.length} bytes`,
    suggestedExt: sniffImageExt(bytes),
  };
}

function nanoBananaHeaders(baseUrl: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (usesOfficialGoogleApiKeyHeader(baseUrl)) {
    headers['x-goog-api-key'] = apiKey;
    return headers;
  }
  headers.authorization = `Bearer ${apiKey}`;
  return headers;
}

function usesOfficialGoogleApiKeyHeader(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.hostname === 'generativelanguage.googleapis.com';
  } catch {
    return false;
  }
}

function nanoBananaAspectFor(aspect?: string): string {
  if (
    aspect === '1:1'
    || aspect === '16:9'
    || aspect === '9:16'
    || aspect === '4:3'
    || aspect === '3:4'
  ) {
    return aspect;
  }
  return '1:1';
}

function inlineImageBytesFromGenerateContent(data: any): Buffer {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const inline = part?.inlineData;
      if (typeof inline?.data === 'string' && inline.data) {
        return Buffer.from(inline.data, 'base64');
      }
    }
  }
  throw new Error('nano-banana image response missing candidates[].content.parts[].inlineData.data');
}

function sniffImageExt(bytes: Buffer): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return '.jpg';
  }
  if (
    bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    return '.png';
  }
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return '.webp';
  }
  return '.png';
}

async function renderGrokVideo(ctx: MediaContext, credentials: ProviderConfig, onProgress?: ProgressFn): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no xAI API key — configure it in Settings or set XAI_API_KEY',
    );
  }
  const baseUrl = (credentials.baseUrl || 'https://api.x.ai/v1').replace(/\/$/, '');

  // Grok caps duration at 15s. The dispatcher already clamps to
  // VIDEO_LENGTHS_SEC (which goes up to 30) — re-clamp here so a user
  // who picked 30 doesn't bounce off the upstream API with a 4xx.
  const requested = ctx.length || 5;
  const durationSec = Math.min(Math.max(requested, 1), 15);
  const aspectRatio = grokAspectFor(ctx.aspect);

  const body: Record<string, unknown> = {
    model: ctx.model,
    prompt: ctx.prompt || 'A short cinematic clip.',
    duration: durationSec,
    aspect_ratio: aspectRatio,
    resolution: '720p',
  };
  if (ctx.imageRef && ctx.imageRef.dataUrl) {
    // grok-imagine-video accepts a base64 data URI in `image` for i2v.
    // Same surface as Seedance — the dispatcher already produced the
    // data URL via resolveProjectImage, so we just hand it through.
    body.image = ctx.imageRef.dataUrl;
  }

  const submitResp = await fetch(`${baseUrl}/videos/generations`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const submitText = await submitResp.text();
  if (!submitResp.ok) {
    throw new Error(`grok video submit ${submitResp.status}: ${truncate(submitText, 240)}`);
  }
  let submitData: any;
  try {
    submitData = JSON.parse(submitText);
  } catch {
    throw new Error(`grok video non-JSON: ${truncate(submitText, 200)}`);
  }

  // Two paths: (a) the API returned the finished video synchronously
  // (cached/short jobs), in which case we skip polling; (b) we got an
  // {id, status:'pending'} stub and need to poll GET /videos/{id}
  // until status flips to done/failed/expired.
  let videoUrl = submitData?.video?.url || null;
  let lastStatus = submitData?.status || '';
  const requestId = submitData?.id || submitData?.request_id || null;

  if (!videoUrl && requestId) {
    const startedAt = Date.now();
    const configuredMaxMs = Number(process.env.OD_GROK_VIDEO_MAX_POLL_MS);
    const maxMs =
      Number.isFinite(configuredMaxMs) && configuredMaxMs >= 60_000
        ? configuredMaxMs
        : 8 * 60 * 1000;
    if (typeof onProgress === 'function') {
      const mode = ctx.imageRef ? 'i2v' : 't2v';
      onProgress(`grok ${mode} task ${requestId} accepted; polling status…`);
    }
    while (Date.now() - startedAt < maxMs) {
      await sleep(4000);
      const pollResp = await fetch(`${baseUrl}/videos/${encodeURIComponent(requestId)}`, {
        headers: { 'authorization': `Bearer ${credentials.apiKey}` },
      });
      const pollText = await pollResp.text();
      if (!pollResp.ok) {
        throw new Error(`grok poll ${pollResp.status}: ${truncate(pollText, 240)}`);
      }
      let pollData: any;
      try {
        pollData = JSON.parse(pollText);
      } catch {
        throw new Error(`grok poll non-JSON: ${truncate(pollText, 200)}`);
      }
      lastStatus = pollData.status || '';
      if (typeof onProgress === 'function') {
        const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
        onProgress(`grok task ${requestId} status=${lastStatus || 'pending'} (elapsed ${elapsedSec}s)`);
      }
      if (lastStatus === 'done' || lastStatus === 'succeeded') {
        videoUrl = pollData?.video?.url || null;
        break;
      }
      if (lastStatus === 'failed' || lastStatus === 'expired') {
        const reasonRaw = pollData?.error?.message || pollData?.error || lastStatus;
        const reason = typeof reasonRaw === 'string' ? reasonRaw : JSON.stringify(reasonRaw);
        throw new Error(`grok task ${lastStatus}: ${reason}`);
      }
    }
    // Loop exited without a videoUrl. Distinguish the two reachable
    // cases so operators know which lever to pull: bumping the poll
    // ceiling (timeout) vs filing a bug against the upstream contract
    // (status=done but no video.url).
    if (!videoUrl) {
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      const ceilingSec = Math.round(maxMs / 1000);
      throw new Error(
        `grok video timed out after ${elapsedSec}s waiting for status=done `
        + `(last status: ${lastStatus || 'pending'}, ceiling ${ceilingSec}s). `
        + `If your jobs legitimately need longer, raise OD_GROK_VIDEO_MAX_POLL_MS.`,
      );
    }
  }

  if (!videoUrl) {
    // Submit returned neither an inline video.url nor a request_id —
    // upstream broke its own contract. Surfacing the last status helps
    // pinpoint whether it was a transient API blip or a malformed
    // response we should add a parser branch for.
    throw new Error(
      `grok video submit returned no inline video and no request_id to poll `
      + `(status=${lastStatus || 'unknown'})`,
    );
  }

  const dlResp = await fetch(videoUrl);
  if (!dlResp.ok) throw new Error(`grok video fetch ${dlResp.status}`);
  const arr = await dlResp.arrayBuffer();
  const bytes = Buffer.from(arr);

  return {
    bytes,
    providerNote: `grok/${ctx.model} · ${aspectRatio} · ${durationSec}s · ${bytes.length} bytes`,
    suggestedExt: '.mp4',
  };
}

function grokAspectFor(aspect?: string): string {
  // xAI accepts a wide list (1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 2:1,
  // 1:2, 19.5:9, 9:19.5, 20:9, 9:20, auto). Our MEDIA_ASPECTS subset
  // is a strict subset — pass through known values, otherwise 16:9.
  if (
    aspect === '1:1'
    || aspect === '16:9'
    || aspect === '9:16'
    || aspect === '4:3'
    || aspect === '3:4'
  ) {
    return aspect;
  }
  return '16:9';
}

// ---------------------------------------------------------------------------
// Provider: ElevenLabs — v3 text-to-speech (synchronous).
//
// Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
// The API returns MP3 bytes directly. The catalogue id `elevenlabs-v3`
// maps to the wire model `eleven_v3`, while `--voice` selects the
// voice id in the path.
// ---------------------------------------------------------------------------

const ELEVENLABS_DEFAULT_BASE_URL = 'https://api.elevenlabs.io';
const ELEVENLABS_DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

const ELEVENLABS_TTS_MODEL_MAP = {
  'elevenlabs-v3': 'eleven_v3',
} as Record<string, string>;

const ELEVENLABS_SFX_MODEL_MAP = {
  'elevenlabs-sfx': 'eleven_text_to_sound_v2',
} as Record<string, string>;
const ELEVENLABS_SFX_MAX_PROMPT_CHARS = 450;
const ELEVENLABS_SFX_DEFAULT_PROMPT_INFLUENCE = 0.3;

function clampElevenLabsSfxDuration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 5;
  return Math.min(30, Math.max(0.5, value));
}

function clampElevenLabsSfxPromptInfluence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ELEVENLABS_SFX_DEFAULT_PROMPT_INFLUENCE;
  }
  return Math.min(1, Math.max(0, value));
}

function requireElevenLabsPrompt(text: string, kind: 'TTS' | 'SFX'): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`ElevenLabs ${kind} prompt must not be empty. Pass --prompt before retrying.`);
  }
  return trimmed;
}

function assertElevenLabsSfxPromptLength(text: string) {
  const promptChars = Array.from(text).length;
  if (promptChars > ELEVENLABS_SFX_MAX_PROMPT_CHARS) {
    throw new Error(
      `ElevenLabs SFX prompt exceeds ${ELEVENLABS_SFX_MAX_PROMPT_CHARS} characters (${promptChars}). Shorten --prompt before retrying.`,
    );
  }
}

async function renderElevenLabsTTS(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no ElevenLabs API key - configure it in Settings or set OD_ELEVENLABS_API_KEY',
    );
  }

  const baseUrl = (credentials.baseUrl || ELEVENLABS_DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );
  const wireModel = ELEVENLABS_TTS_MODEL_MAP[ctx.model] || ctx.model;
  const text = requireElevenLabsPrompt(ctx.prompt ?? '', 'TTS');
  const voiceId = (ctx.voice && ctx.voice.trim()) || ELEVENLABS_DEFAULT_VOICE_ID;
  const body = {
    text,
    model_id: wireModel,
    voice_settings: {
      stability: 1,
      similarity_boost: 1,
      style: 0,
      speed: 1,
      use_speaker_boost: true,
    },
  };

  const resp = await fetch(
    `${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': credentials.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`elevenlabs tts ${resp.status}: ${truncate(errText, 240)}`);
  }
  const arr = await resp.arrayBuffer();
  const bytes = Buffer.from(arr);
  if (bytes.length === 0) {
    throw new Error('elevenlabs tts returned zero bytes');
  }
  return {
    bytes,
    providerNote: `elevenlabs/${wireModel} · ${voiceId} · ${bytes.length} bytes`,
    suggestedExt: '.mp3',
  };
}

async function renderElevenLabsSfx(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no ElevenLabs API key - configure it in Settings or set OD_ELEVENLABS_API_KEY',
    );
  }

  const baseUrl = (credentials.baseUrl || ELEVENLABS_DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );
  const wireModel = ELEVENLABS_SFX_MODEL_MAP[ctx.model] || ctx.model;
  const text = requireElevenLabsPrompt(ctx.prompt ?? '', 'SFX');
  assertElevenLabsSfxPromptLength(text);
  const durationSeconds = clampElevenLabsSfxDuration(ctx.duration);
  const promptInfluence = clampElevenLabsSfxPromptInfluence(ctx.promptInfluence);
  const body = {
    text,
    duration_seconds: durationSeconds,
    prompt_influence: promptInfluence,
    ...(ctx.loop ? { loop: true } : {}),
    model_id: wireModel,
  };

  const resp = await fetch(
    `${baseUrl}/v1/sound-generation?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': credentials.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`elevenlabs sfx ${resp.status}: ${truncate(errText, 240)}`);
  }
  const arr = await resp.arrayBuffer();
  const bytes = Buffer.from(arr);
  if (bytes.length === 0) {
    throw new Error('elevenlabs sfx returned zero bytes');
  }
  return {
    bytes,
    providerNote: `elevenlabs/${wireModel} · ${durationSeconds}s${ctx.loop ? ' · loop' : ''} · ${bytes.length} bytes`,
    suggestedExt: '.mp3',
  };
}

// ---------------------------------------------------------------------------
// Provider: MiniMax — Speech-02 family text-to-speech (synchronous).
//
// Docs: https://platform.minimaxi.com — POST /t2a_v2 with a JSON body
// describing the voice + audio settings. Response is JSON with the
// audio bytes hex-encoded under `data.audio`. The MiniMax catalogue we
// surface as the generic id `minimax-tts` resolves to `speech-02-turbo`
// (their fast tier). Voice id defaults to a neutral Mandarin voice but
// the agent can override via the model registry's `voice` slot.
// ---------------------------------------------------------------------------

const MINIMAX_DEFAULT_BASE_URL = 'https://api.minimaxi.chat/v1';

// Map our generic catalogue ids onto MiniMax's actual model ids. The
// `minimax-tts` slot in src/media/models.ts is shorthand for "their
// fast TTS tier"; we substitute the real model name on the wire so
// MiniMax accepts the request without exposing the user to their
// internal naming.
const MINIMAX_TTS_MODEL_MAP = {
  'minimax-tts': 'speech-02-turbo',
} as Record<string, string>;

async function renderMinimaxTTS(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no MiniMax API key — configure it in Settings or set OD_MINIMAX_API_KEY',
    );
  }
  const baseUrl = (credentials.baseUrl || MINIMAX_DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );
  const wireModel = MINIMAX_TTS_MODEL_MAP[ctx.model] || ctx.model;
  const text = (ctx.prompt && ctx.prompt.trim()) || 'This is a test.';
  // Voice id picks: the agent can pass --voice to choose, otherwise we
  // default to a neutral Mandarin male voice that handles both Chinese
  // and English text reasonably. MiniMax's voice catalogue is large
  // (`male-qn-qingse`, `female-shaonv`, etc.) — listed at
  // platform.minimaxi.com under voice management.
  const voiceId = (ctx.voice && ctx.voice.trim()) || 'male-qn-qingse';

  const languageBoost = typeof ctx.language === 'string' ? ctx.language.trim() : '';

  const body = {
    model: wireModel,
    text,
    stream: false,
    ...(languageBoost ? { language_boost: languageBoost } : {}),
    voice_setting: {
      voice_id: voiceId,
      speed: 1.0,
      vol: 1.0,
      pitch: 0,
    },
    audio_setting: {
      sample_rate: 32000,
      format: 'mp3',
    },
  };

  const resp = await fetch(`${baseUrl}/t2a_v2`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const respText = await resp.text();
  if (!resp.ok) {
    throw new Error(`minimax tts ${resp.status}: ${truncate(respText, 240)}`);
  }
  let data: any;
  try {
    data = JSON.parse(respText);
  } catch {
    throw new Error(`minimax tts non-JSON: ${truncate(respText, 200)}`);
  }
  // MiniMax wraps every response in `base_resp`; even an HTTP 200 can
  // be a logical failure (`status_code !== 0`). Surface that distinct
  // class of error so the user knows it's an auth / params issue, not
  // a network blip.
  if (data?.base_resp && data.base_resp.status_code !== 0) {
    throw new Error(
      `minimax tts api error ${data.base_resp.status_code}: ${data.base_resp.status_msg || 'unknown'}`,
    );
  }
  const hex = data?.data?.audio;
  if (typeof hex !== 'string' || !hex) {
    throw new Error('minimax tts response missing data.audio');
  }
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length === 0) {
    throw new Error('minimax tts decoded zero bytes');
  }
  // Pull a few useful descriptors from extra_info for the providerNote
  // so the FileViewer toolbar tells the truth about what was generated.
  const xi = data?.extra_info || {};
  const seconds = xi.audio_length ? Math.round(xi.audio_length / 100) / 10 : '?';

  return {
    bytes,
    providerNote: `minimax/${wireModel} · ${voiceId} · ${seconds}s · ${bytes.length} bytes`,
    suggestedExt: '.mp3',
  };
}

// ---------------------------------------------------------------------------
// Provider: FishAudio — Speech-1.x family text-to-speech (synchronous).
//
// Docs: https://docs.fish.audio — POST /v1/tts with a JSON body.
// FishAudio returns the audio bytes directly (Content-Type: audio/mpeg
// for mp3, audio/wav for wav) rather than wrapping them in JSON, so we
// stream the body straight into a Buffer. The catalogue id we expose
// as `fish-speech-2` resolves to `speech-1.6` (their newer model) on
// the wire; older builds can paste `speech-1.5` via the model picker
// once arbitrary model ids are accepted.
// ---------------------------------------------------------------------------

const FISHAUDIO_DEFAULT_BASE_URL = 'https://api.fish.audio';

const FISHAUDIO_TTS_MODEL_MAP = {
  'fish-speech-2': 'speech-1.6',
} as Record<string, string>;

async function renderFishAudioTTS(ctx: MediaContext, credentials: ProviderConfig): Promise<RenderResult> {
  if (!credentials.apiKey) {
    throw new Error(
      'no FishAudio API key — configure it in Settings or set OD_FISHAUDIO_API_KEY',
    );
  }
  const baseUrl = (credentials.baseUrl || FISHAUDIO_DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );
  const wireModel = FISHAUDIO_TTS_MODEL_MAP[ctx.model] || ctx.model;
  const text = (ctx.prompt && ctx.prompt.trim()) || 'This is a test.';

  // FishAudio's `reference_id` slot pins which voice the synth uses.
  // The agent passes it via --voice (carried in ctx.voice). Empty means
  // FishAudio falls back to its default voice for the chosen model.
  const body: Record<string, unknown> = {
    text,
    format: 'mp3',
    mp3_bitrate: 128,
    model: wireModel,
    normalize: true,
    latency: 'normal',
  };
  if (ctx.voice && ctx.voice.trim()) {
    body.reference_id = ctx.voice.trim();
  }

  const resp = await fetch(`${baseUrl}/v1/tts`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`fishaudio tts ${resp.status}: ${truncate(errText, 240)}`);
  }
  const arr = await resp.arrayBuffer();
  const bytes = Buffer.from(arr);
  if (bytes.length === 0) {
    throw new Error('fishaudio tts returned zero bytes');
  }
  return {
    bytes,
    providerNote: `fishaudio/${wireModel} · ${bytes.length} bytes`,
    suggestedExt: '.mp3',
  };
}

// ---------------------------------------------------------------------------
// Provider: HyperFrames — local HTML→MP4 renderer (heygen-com/hyperframes).
//
// The agent does the creative work: it reads skills/hyperframes/SKILL.md,
// writes a composition (`hyperframes.json` + `meta.json` + `index.html`,
// with a GSAP timeline) into a hidden cache dir under the project, then
// dispatches here with `--composition-dir <relative-path>`.
//
// We run `npx hyperframes render <absolutePath> --output <tmp>/render.mp4`
// from the daemon process (NOT the agent's shell) for two reasons:
//   1. HyperFrames spawns a puppeteer-controlled Chrome to capture frames.
//      Claude Code's Bash tool wraps subprocesses in macOS sandbox-exec,
//      under which Chrome hangs partway through frame capture.
//   2. Pointing --output at a temp dir keeps HF's auto-created
//      `work-<uuid>/` (per-frame jpegs + intermediate compiled HTML)
//      OUT of the project folder. We delete the temp tree in the
//      `finally` block; only the final mp4 bytes are returned to the
//      generic dispatcher flow, which writes them into the project dir
//      under the user-supplied filename.
// ---------------------------------------------------------------------------

const HYPERFRAMES_RENDER_TIMEOUT_MS = 5 * 60 * 1000;

async function renderHyperFramesViaCli(ctx: MediaContext, projectDir: string, onProgress?: ProgressFn): Promise<RenderResult> {
  const compRel = ctx.compositionDir;
  if (typeof compRel !== 'string' || !compRel.trim()) {
    throw new Error(
      'hyperframes-html requires --composition-dir <project-relative-path> ' +
        'pointing at the directory the agent scaffolded with hyperframes.json / ' +
        'meta.json / index.html. The agent should write the composition into ' +
        '$OD_PROJECT_DIR/.hyperframes-cache/<id>/ and pass that path here.',
    );
  }
  // Resolve compositionDir against projectDir and refuse anything that
  // escapes — the agent has free file access to the project but the
  // dispatcher must not let a bad relative path render an arbitrary
  // directory on the host.
  const projectRootResolved = path.resolve(projectDir);
  const compAbs = path.resolve(projectRootResolved, compRel);
  if (
    compAbs !== projectRootResolved &&
    !compAbs.startsWith(projectRootResolved + path.sep)
  ) {
    throw new Error(
      `compositionDir "${compRel}" resolves outside the project directory. ` +
        'Pass a path relative to the project (e.g. ".hyperframes-cache/abc").',
    );
  }
  // Existence check — render against a missing directory hangs HF for
  // a while before failing, so short-circuit with a clear error.
  let compStat;
  try {
    compStat = await stat(compAbs);
  } catch {
    throw new Error(
      `compositionDir not found: ${compRel} (resolved to ${compAbs})`,
    );
  }
  if (!compStat.isDirectory()) {
    throw new Error(`compositionDir is not a directory: ${compRel}`);
  }
  const indexStat = await stat(path.join(compAbs, 'index.html')).catch(
    () => null,
  );
  if (!indexStat || !indexStat.isFile()) {
    throw new Error(
      `compositionDir is missing index.html: ${compRel}. The agent must ` +
        'write index.html (with window.__timelines registration) before dispatch.',
    );
  }

  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'open-design-hf-'));
  const tmpOutput = path.join(tmpRoot, 'render.mp4');
  try {
    // Pin --workers 1 to keep memory bounded (each worker is a Chrome
    // process at ~256 MB). standard quality matches HF's default. We
    // do NOT pass --quiet so progress lines stream out and the agent
    // (and the user reading the chat in real time) can see frame-by-
    // frame capture status instead of staring at a hung pipe.
    await runHyperFramesRender(compAbs, tmpOutput, onProgress);
    const bytes = await readFile(tmpOutput);
    return {
      bytes,
      providerNote: `hyperframes/local-html · ${ctx.aspect} · ${bytes.length} bytes`,
      suggestedExt: '.mp4',
    };
  } catch (err) {
    const stderr =
      errorStringProp(err, 'stderr').trim();
    const message = stderr || errorMessage(err);
    throw new Error(`hyperframes render failed: ${truncate(message, 480)}`);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

/**
 * Run `npx hyperframes render` and stream every line of stdout/stderr
 * through `onProgress`. Resolves on a clean exit, rejects on non-zero
 * exit (with the stderr tail attached so the dispatcher can surface it).
 *
 * Streaming matters for UX: the render typically takes 60–120s and
 * HF prints "Capturing frame N/M" as it goes. Without piping these
 * lines back to the caller, the HTTP request looks hung and the
 * agent's chat tool shows a long quiet spinner — users can't tell
 * whether anything is happening.
 */
function runHyperFramesRender(compAbs: string, tmpOutput: string, onProgress?: ProgressFn): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      'npx',
      [
        '-y',
        'hyperframes',
        'render',
        compAbs,
        '--output',
        tmpOutput,
        '--workers',
        '1',
      ],
      {
        // Inherit env so npx can find the cached hyperframes install
        // and any user-level node config. stdin closed (HF doesn't
        // read from it), stdout/stderr piped so we can stream.
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    // HF uses ANSI escape sequences (cursor moves, color codes, line
    // erases) for its pretty progress bar. Strip those before
    // forwarding so the agent's chat doesn't render a wall of `[2K`.
    // The regex covers CSI sequences (most of what HF emits).
    const stripAnsi = (s: string): string =>
      s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\[\?[0-9]+[hl]/g, '');

    const emit = (chunk: Buffer): void => {
      if (typeof onProgress !== 'function') return;
      const text = stripAnsi(chunk.toString('utf8'));
      // HF refreshes a single progress line many times per second; split
      // on \r and \n so each "Capturing frame X/Y" update reaches the
      // caller as its own line. Drop empty/duplicate lines so the
      // SSE stream stays compact.
      const lines = text.split(/[\r\n]+/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          onProgress(trimmed);
        } catch {
          // best-effort: never let an emitter throw kill the render
        }
      }
    };

    let stderrTail = '';
    child.stdout.on('data', emit);
    child.stderr.on('data', (chunk) => {
      stderrTail += chunk.toString('utf8');
      if (stderrTail.length > 8000) stderrTail = stderrTail.slice(-8000);
      emit(chunk);
    });

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      reject(
        new Error(
          `hyperframes render timed out after ${Math.round(HYPERFRAMES_RENDER_TIMEOUT_MS / 1000)}s`,
        ),
      );
    }, HYPERFRAMES_RENDER_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      const reason = signal ? `signal ${signal}` : `exit ${code}`;
      const tail = stderrTail.trim().split('\n').slice(-12).join('\n');
      const err = new Error(
        `hyperframes render exited ${reason}` + (tail ? `\n${tail}` : ''),
      ) as Error & { stderr: string };
      err.stderr = tail;
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Stub renderer.
//
// Used when no real provider integration ships for (provider, surface)
// or when the real one fails. Produces small but valid bytes so the
// downstream FileViewer round-trip works while the backend matures.
// ---------------------------------------------------------------------------

async function renderStub(ctx: MediaContext, fileName: string): Promise<RenderResult> {
  const note = ctx.provider && !ctx.provider.integrated
    ? `stub-${ctx.surface} · provider '${ctx.provider.id}' integration pending`
    : `stub-${ctx.surface} · model=${ctx.model}`;
  if (ctx.surface === 'image') {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.svg') {
      return { bytes: Buffer.from(svgPlaceholder(ctx), 'utf8'), providerNote: note };
    }
    const png = Buffer.from(
      [
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ],
    );
    return {
      bytes: png,
      providerNote: `${note} · aspect=${ctx.aspect} · prompt=${truncate(ctx.prompt, 60)}`,
    };
  }
  if (ctx.surface === 'video') {
    const ftyp = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
      0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    ]);
    const mdat = Buffer.from([0x00, 0x00, 0x00, 0x08, 0x6d, 0x64, 0x61, 0x74]);
    return {
      bytes: Buffer.concat([ftyp, mdat]),
      providerNote: `${note} · aspect=${ctx.aspect} · length=${ctx.length ?? '?'}s · prompt=${truncate(ctx.prompt, 60)}`,
    };
  }
  // Audio
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.wav') {
    return {
      bytes: silentWav(0.5),
      providerNote: `${note} · kind=${ctx.audioKind} · duration=${ctx.duration ?? '?'}s`,
    };
  }
  const mp3 = Buffer.from([
    0xff, 0xfb, 0x90, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  return {
    bytes: mp3,
    providerNote: `${note} · kind=${ctx.audioKind} · voice=${ctx.voice || '-'} · duration=${ctx.duration ?? '?'}s`,
  };
}

function svgPlaceholder(ctx: MediaContext): string {
  const [w, h] = aspectToBox(ctx.aspect, 800);
  const safe = (s: unknown): string =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
    `<rect width="${w}" height="${h}" fill="#0f1424"/>`,
    `<text x="50%" y="50%" fill="#7da4ff" font-family="ui-sans-serif" font-size="20" text-anchor="middle">${safe(ctx.model)} — ${safe(ctx.prompt).slice(0, 60)}</text>`,
    '</svg>',
  ].join('');
}

function aspectToBox(aspect: string | undefined, base: number): [number, number] {
  const [a, b] = String(aspect || '1:1').split(':').map(Number);
  if (!a || !b) return [base, base];
  if (a >= b) return [base, Math.round((base * b) / a)];
  return [Math.round((base * a) / b), base];
}

function silentWav(seconds: number): Buffer {
  const sampleRate = 8000;
  const numSamples = Math.max(1, Math.round(sampleRate * seconds));
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

function truncate(s: unknown, n: number): string {
  const v = String(s || '');
  if (v.length <= n) return v;
  return v.slice(0, n - 1) + '…';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
