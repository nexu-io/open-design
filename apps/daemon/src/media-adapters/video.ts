// Video request builder (layer ②) — pure, transport-free.
//
// Mirrors aihubmix-video's lib/server/video/create-task.ts family branching:
//   • seedance (apiModel starts `doubao-seedance-`) → JSON with a multimodal
//     `content[]` array (text + image_url{url,role:first_frame}); duration/ratio/resolution.
//   • wan (wan* / happyhorse* — both DashScope/wanx-backed on the gateway) →
//     { model, input:{ prompt, media:[{type:first_frame,url}] }, parameters:{ resolution, duration, prompt_extend, watermark } }.
//   • veo (veo* — Google Veo via the Gemini predictLongRunning link) → flat JSON
//     { model, prompt, seconds (NUMBER), size?, input_reference? }. The gateway's
//     OpenAI→Gemini shim wants seconds as an integer and only honours `size`;
//     sending the string "8" or an extra `aspect_ratio` makes it fail.
//   • generic (sora / …) → flat JSON
//     { model, prompt, seconds (string), aspect_ratio?, size?, input_reference? } with the
//     reference image as a data URL.
// The caller resolves the reference image to a data URL beforehand and attaches
// auth + base URL afterward; this module only shapes the body.

import type {
  BuiltVideoRequest,
  MediaFamily,
  ModelCapability,
  VideoBuildInput,
} from './types.js';

/** Resolve the upstream model name: i2v variant when a reference image is present. */
export function resolveWireModel(cap: ModelCapability, hasReference: boolean): string {
  return hasReference && cap.apiModelI2V ? cap.apiModelI2V : cap.apiModel;
}

/** Derive the request family from the resolved upstream model name (or explicit override). */
export function deriveVideoFamily(wireModel: string, cap?: ModelCapability): MediaFamily {
  if (cap?.family) return cap.family;
  const m = wireModel.toLowerCase();
  if (m.startsWith('doubao-seedance-')) return 'seedance';
  // wan* and happyhorse* are both proxied to Alibaba DashScope/wanx, which uses
  // the input.media + parameters wire shape (verified against a working
  // happyhorse-1.0-i2v call). Route them through the `wan` family.
  if (m.startsWith('wan') || m.startsWith('happyhorse')) return 'wan';
  // veo* goes through the gateway's OpenAI→Gemini predictLongRunning shim, which
  // wants seconds as a NUMBER and only `size` (no aspect_ratio). Its own family
  // so it doesn't inherit generic's string-seconds shape (verified against a
  // working veo-3.1-lite-generate-preview call).
  if (m.startsWith('veo')) return 'veo';
  return 'generic';
}

/**
 * Snap a requested duration to the model's allowed set (e.g. Veo 4/6/8, wan 5/10).
 * Falls back to a 3–12 clamp when the model declares no constraint. Ties prefer
 * the shorter value.
 */
export function snapDuration(cap: ModelCapability, requested: number | undefined): number {
  const req = Number.isFinite(requested) ? (requested as number) : 5;
  const allowed = cap.supportedDurations;
  if (!allowed || allowed.length === 0) {
    return Math.min(12, Math.max(3, Math.round(req)));
  }
  return allowed.reduce(
    (best, v) => (Math.abs(v - req) < Math.abs(best - req) ? v : best),
    allowed[0]!,
  );
}

/**
 * Seedance and wan accept resolution ONLY as a quality token (`480p`/`720p`/
 * `1080p`), never a `WxH` pixel string. Callers may hand us either: an explicit
 * token from the tool's `resolution` arg, or a pixel `size` like `1280x720`
 * derived from an aspect ratio. Passing a pixel string straight through makes
 * Doubao Seedance 400 with "the parameter resolution ... is not valid ... in
 * i2v". Normalise to the nearest lowercase token by the short side (720→720p,
 * 1080→1080p, …); default to 720p when nothing usable is supplied. (wan wants
 * the uppercase form `720P`, so its branch upper-cases the result.)
 */
export function snapResolutionToken(
  resolution: string | undefined,
  size: string | undefined,
): string {
  const token = (resolution || '').trim().toLowerCase();
  if (/^(480|720|1080)p$/.test(token)) return token;
  const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec((size || resolution || '').trim());
  if (m) {
    const shortSide = Math.min(parseInt(m[1]!, 10), parseInt(m[2]!, 10));
    if (shortSide <= 480) return '480p';
    if (shortSide <= 720) return '720p';
    return '1080p';
  }
  return '720p';
}

/**
 * Veo (via the gateway's Gemini predictLongRunning shim) only accepts a handful
 * of `size` values — the gateway derives `resolution` from `size`, and anything
 * that maps outside 720p/1080p (e.g. a 1:1 `1024x1024`) 400s with
 * "The string value `1024p` for `resolution` is invalid". Snap whatever the
 * caller hands us to the nearest valid Veo size by orientation; default to
 * landscape 720p. Known-good sizes pass through untouched.
 */
const VEO_VALID_SIZES = new Set(['1280x720', '720x1280', '1920x1080', '1080x1920']);
export function snapVeoSize(size: string | undefined): string {
  const s = (size || '').trim().toLowerCase().replace('×', 'x');
  if (VEO_VALID_SIZES.has(s)) return s;
  const m = /^(\d+)\s*x\s*(\d+)$/.exec(s);
  if (m) return parseInt(m[2]!, 10) > parseInt(m[1]!, 10) ? '720x1280' : '1280x720';
  return '1280x720';
}

/**
 * Snap a requested `size` to the model's declared `supportedSizes` by
 * orientation. Sora 400s on an unsupported size (e.g. a 1:1 `1024x1024` —
 * "Supported values are: '720x1280','1280x720',…"), so a caller-derived size
 * that isn't on the list is mapped to a supported one of the same orientation
 * (portrait↔portrait, else landscape). Returns the size unchanged when the
 * model declares no constraint; falls back to the first supported size when the
 * input is missing/unparseable.
 */
export function snapSizeToSupported(
  size: string | undefined,
  supported: string[] | undefined,
): string | undefined {
  if (!supported || supported.length === 0) return size;
  const norm = (v: string) => v.trim().toLowerCase().replace('×', 'x');
  const s = norm(size || '');
  const exact = supported.find((v) => norm(v) === s);
  if (exact) return exact;
  const dims = /^(\d+)\s*x\s*(\d+)$/.exec(s);
  const portrait = dims ? parseInt(dims[2]!, 10) > parseInt(dims[1]!, 10) : false;
  const match = supported.find((v) => {
    const m = /^(\d+)\s*x\s*(\d+)$/.exec(norm(v));
    return m ? parseInt(m[2]!, 10) > parseInt(m[1]!, 10) === portrait : false;
  });
  return match || supported[0];
}

/** Apply extraBodyDefaults, then overlay caller passthrough filtered by the whitelist. */
function mergeExtraBody(
  body: Record<string, unknown>,
  cap: ModelCapability,
  passthrough: Record<string, unknown> | undefined,
): void {
  for (const def of cap.extraBodyDefaults ?? []) {
    if (def.default !== undefined) body[def.name] = def.default;
  }
  if (passthrough && cap.allowedPassthroughParameters?.length) {
    const allow = new Set(cap.allowedPassthroughParameters);
    for (const [k, v] of Object.entries(passthrough)) {
      if (allow.has(k) && v !== undefined) body[k] = v;
    }
  }
}

/** Build the seedance multimodal content array (text + reference images). */
function buildSeedanceContent(input: VideoBuildInput): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: input.prompt }];
  if (input.imageRef?.dataUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: input.imageRef.dataUrl },
      role: 'first_frame',
    });
  }
  for (const ref of input.extraImageRefs ?? []) {
    if (ref?.dataUrl) {
      content.push({
        type: 'image_url',
        image_url: { url: ref.dataUrl },
        role: 'reference_image',
      });
    }
  }
  return content;
}

/**
 * Build the upstream video request body for a model. Pure: no fetch, no auth.
 * Caller: POST `${baseUrl}${pathSuffix}` with auth headers + JSON.stringify(body).
 */
export function buildVideoRequest(cap: ModelCapability, input: VideoBuildInput): BuiltVideoRequest {
  const hasReference = Boolean(input.imageRef?.dataUrl);
  const wireModel = resolveWireModel(cap, hasReference);
  const family = deriveVideoFamily(wireModel, cap);
  const seconds = snapDuration(cap, input.durationSeconds);

  let body: Record<string, unknown>;
  if (family === 'seedance') {
    body = {
      model: wireModel,
      prompt: input.prompt,
      duration: seconds,
      content: buildSeedanceContent(input),
    };
    // Seedance wants a resolution TOKEN (480p/720p/1080p), not a WxH pixel
    // string. Normalise whichever the caller supplied, so an aspect-derived
    // `size` like 1280x720 never reaches the wire as an invalid resolution.
    body.resolution = snapResolutionToken(input.resolution, input.size);
    if (input.aspectRatio) body.ratio = input.aspectRatio;
    if (typeof input.generateAudio === 'boolean') body.generate_audio = input.generateAudio;
    if (typeof input.seed === 'number') body.seed = input.seed;
  } else if (family === 'wan') {
    // Alibaba DashScope/wanx wire (wan* + happyhorse*). The reference image is
    // the FIRST FRAME inside input.media; everything tunable lives under
    // `parameters`. Verified against a working happyhorse-1.0-i2v call.
    const wanInput: Record<string, unknown> = { prompt: input.prompt };
    if (hasReference) {
      wanInput.media = [{ type: 'first_frame', url: input.imageRef!.dataUrl }];
    }
    const parameters: Record<string, unknown> = {
      resolution: snapResolutionToken(input.resolution, input.size).toUpperCase(),
      duration: seconds,
      prompt_extend: true,
      watermark: false,
    };
    if (input.aspectRatio) parameters.aspect_ratio = input.aspectRatio;
    if (typeof input.seed === 'number') parameters.seed = input.seed;
    body = { model: wireModel, input: wanInput, parameters };
  } else if (family === 'veo') {
    // Google Veo via the gateway's OpenAI→Gemini predictLongRunning shim. Unlike
    // the generic branch, `seconds` MUST be a number and `size` is the only size
    // hint it honours — sending the string "8" or an extra `aspect_ratio` makes
    // it fail. TEXT-TO-VIDEO ONLY: every reference-image form (inlineData /
    // referenceImages) is rejected by the shim, so we never attach one here —
    // the caller gates i2v out via the capability's caps.
    body = {
      model: wireModel,
      prompt: input.prompt,
      seconds,
      // Always a valid Veo size — the gateway derives resolution from it, so a
      // 1:1/4:3 pixel string would 400 as an invalid resolution.
      size: snapVeoSize(input.size),
    };
    if (typeof input.generateAudio === 'boolean') body.generate_audio = input.generateAudio;
    if (typeof input.seed === 'number') body.seed = input.seed;
  } else {
    // Generic OpenAI-style /videos (sora). `seconds` is a STRING here (Sora's
    // enum "4"/"8"/"12") and the size hint is `size` — NOT `aspect_ratio`, which
    // Sora rejects with "Unknown parameter: 'aspect_ratio'". Reference rides as
    // input_reference (data URL).
    body = {
      model: wireModel,
      prompt: input.prompt,
      seconds: String(seconds),
    };
    // Snap to a Sora-supported size; an out-of-list size (e.g. 1:1 1024x1024) 400s.
    const genericSize = snapSizeToSupported(input.size, cap.supportedSizes);
    if (genericSize) body.size = genericSize;
    if (input.resolution) body.resolution = input.resolution;
    if (hasReference) body.input_reference = input.imageRef!.dataUrl;
    if (typeof input.generateAudio === 'boolean') body.generate_audio = input.generateAudio;
    if (typeof input.seed === 'number') body.seed = input.seed;
  }

  mergeExtraBody(body, cap, input.passthrough);

  return {
    wireModel,
    family,
    pathSuffix: '/videos',
    contentType: 'application/json',
    body,
    hasReference,
  };
}

export interface NormalizedVideoResponse {
  id?: string;
  status?: string;
  /** Inline asset URL when the upstream returns one. */
  url?: string;
  error?: string;
}

/** Best-effort normalization of an async-submit / poll response across families. */
export function normalizeVideoResponse(raw: unknown): NormalizedVideoResponse {
  const d = (raw ?? {}) as Record<string, any>;
  const id = d.id || d.task_id || d.data?.id || d.data?.task_id;
  const status = d.status || d.data?.status;
  const url =
    d.video_url
    || d.url
    || d.output_url
    || d.data?.video_url
    || d.data?.url
    || (Array.isArray(d.data) ? d.data[0]?.url : undefined)
    || (Array.isArray(d.unsigned_urls) ? d.unsigned_urls[0] : undefined);
  const error =
    d.error?.message || (typeof d.error === 'string' ? d.error : undefined) || d.failure_reason || d.message;
  return {
    ...(id ? { id: String(id) } : {}),
    ...(status ? { status: String(status) } : {}),
    ...(url ? { url: String(url) } : {}),
    ...(error ? { error: String(error) } : {}),
  };
}
