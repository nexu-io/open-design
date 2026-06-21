// media-adapters — pure, isomorphic model-capability + request-mapping layer.
//
// This module is package-shaped (Phase 1 lives in open-design; later extracted
// to a public, generic npm package consumed by both open-design and
// aihubmix-video). It contains NO transport (fetch/auth/poll/storage) and NO
// proprietary model data baked into the interpreter — the model capability data
// is INJECTED (seeded now from a const, later fetched from AIHubMix's
// /api/v1/models + contract.json).
//
// The capability shape deliberately mirrors OpenRouter's GET /api/v1/videos/models
// (supported_resolutions / aspect_ratios / sizes / durations / frame_images /
// allowed_passthrough_parameters), so the eventual remote source is a drop-in.

/**
 * Request-shape family. Determined from the *resolved* upstream model name
 * (i2v variant when a reference image is present), mirroring aihubmix-video's
 * create-task.ts branching.
 *   • `seedance` — multimodal `content[]` array (ByteDance Ark).
 *   • `wan` — Alibaba DashScope/wanx wire: `{ input:{ prompt, media[] }, parameters:{ resolution, duration, … } }`.
 *     Covers wan* and happyhorse* (both proxied to DashScope by the gateway).
 *   • `veo` — Google Veo via the Gemini `predictLongRunning` link. Flat JSON, but
 *     `seconds` MUST be a NUMBER and the only size hint is `size` (no `aspect_ratio`).
 *     Reference image rides as `input_reference`. Verified against a working
 *     veo-3.1-lite-generate-preview call.
 *   • `generic` — flat JSON `{ prompt, seconds (string), input_reference }` (sora/…).
 */
export type MediaFamily = 'seedance' | 'wan' | 'veo' | 'generic';

export type MediaType = 'video' | 'image' | 'audio';

/** Vendor-specific param passthrough declaration (= aihubmix-video ExtraBodyParamDef). */
export interface ExtraBodyParamDef {
  name: string;
  type: 'string' | 'number' | 'boolean';
  default?: string | number | boolean;
  description?: string;
}

/**
 * Per-model capability *description* (layer ①). Fields aligned with OpenRouter's
 * videos/models where possible so a future swap to the remote `/api/v1/models`
 * (+ contract.json) is a data-source change, not a reshape.
 */
export interface ModelCapability {
  /** Catalogue id, e.g. `doubao-seedance-2-0-260128` (NO `aihubmix-` prefix here). */
  id: string;
  /** Upstream model name for text-to-video / base. */
  apiModel: string;
  /** Upstream model name used when a reference image is present (image-to-video). */
  apiModelI2V?: string;
  mediaType: MediaType;
  /** Capability tags: t2v / i2v / r2v / t2i / i2i / edit / tts ... */
  caps: string[];
  /**
   * Optional explicit family override. When omitted, the family is derived from
   * the resolved upstream model name (see deriveVideoFamily). Set this for
   * models whose name doesn't pattern-match (e.g. a new vendor).
   */
  family?: MediaFamily;
  /** Per-model base URL override (else the caller's default AIHubMix base). */
  baseUrl?: string;

  // ── OpenRouter-aligned constraint declaration ────────────────────────────
  supportedDurations?: number[];
  supportedSizes?: string[];
  supportedAspectRatios?: string[];
  supportedResolutions?: string[];
  /** Which reference-frame roles the model accepts, e.g. ['first_frame']. Empty/absent ⇒ no i2v. */
  supportedFrameImages?: string[];
  generateAudio?: boolean;
  seed?: boolean;

  /** Whitelist of vendor-specific params the caller may pass through. */
  allowedPassthroughParameters?: string[];
  /** Defaults for vendor-specific params merged into the request body. */
  extraBodyDefaults?: ExtraBodyParamDef[];
}

/**
 * Unified video request input. The caller resolves any reference image to a
 * data URL BEFORE calling (the package performs no I/O). `passthrough` carries
 * vendor-specific params; only keys in `allowedPassthroughParameters` survive.
 */
export interface VideoBuildInput {
  prompt: string;
  durationSeconds?: number;
  aspectRatio?: string;
  size?: string;
  resolution?: string;
  /** First-frame reference image as a data URL (data:image/...;base64,...). */
  imageRef?: { dataUrl: string };
  /** Additional reference images (seedance reference_image / extras). */
  extraImageRefs?: Array<{ dataUrl: string }>;
  generateAudio?: boolean;
  seed?: number;
  /** Vendor-specific params; filtered by allowedPassthroughParameters. */
  passthrough?: Record<string, unknown>;
}

/**
 * Result of building a request. Transport-free: the caller attaches auth +
 * base URL and performs the fetch. `body` is a plain object — the caller
 * JSON.stringify's it (all current families are JSON; no multipart).
 */
export interface BuiltVideoRequest {
  /** Resolved upstream model name actually sent (apiModel or apiModelI2V). */
  wireModel: string;
  family: MediaFamily;
  /** Path suffix to append to the provider base URL, e.g. `/videos`. */
  pathSuffix: string;
  contentType: string;
  body: Record<string, unknown>;
  /** Whether a reference image was attached (i2v). */
  hasReference: boolean;
}
