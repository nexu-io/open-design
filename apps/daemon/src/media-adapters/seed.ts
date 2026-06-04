// Seed capability data ported from aihubmix-video (lib/models.ts + DB).
//
// TEMPORARY: replace with a live fetch of AIHubMix /api/v1/models (+ contract.json)
// in Phase 2. Consumers must NOT import this directly — they go through the
// registry (createCapabilityRegistry(AIHUBMIX_VIDEO_SEED)) so the swap is local.
//
// AIHubMix's catalogue exposes each variant as its own model_id (e.g.
// `wan2.5-i2v-preview`, `happyhorse-1.0-i2v`), so each entry is keyed by the
// upstream wire id (the `aihubmix-` prefix is stripped by the registry).

import type { ModelCapability } from './types.js';

export const AIHUBMIX_VIDEO_SEED: ModelCapability[] = [
  // ── ByteDance Seedance (火山 Ark) — multimodal content[] array ───────────
  {
    id: 'doubao-seedance-2-0-260128',
    apiModel: 'doubao-seedance-2-0-260128',
    mediaType: 'video',
    family: 'seedance',
    caps: ['t2v', 'i2v'],
    supportedFrameImages: ['first_frame', 'reference_image'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    generateAudio: true,
    seed: true,
  },
  {
    id: 'doubao-seedance-2-0-fast-260128',
    apiModel: 'doubao-seedance-2-0-fast-260128',
    mediaType: 'video',
    family: 'seedance',
    caps: ['t2v', 'i2v'],
    supportedFrameImages: ['first_frame', 'reference_image'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },

  // ── Alibaba Wan / 万相 (DashScope/wanx wire: input.media + parameters) ────
  {
    id: 'wan2.5-t2v-preview',
    apiModel: 'wan2.5-t2v-preview',
    mediaType: 'video',
    family: 'wan',
    caps: ['t2v'],
    supportedDurations: [5, 10],
    supportedResolutions: ['480P', '720P', '1080P'],
  },
  {
    id: 'wan2.5-i2v-preview',
    apiModel: 'wan2.5-i2v-preview',
    mediaType: 'video',
    family: 'wan',
    caps: ['i2v'],
    supportedFrameImages: ['first_frame'],
    supportedDurations: [5, 10],
    supportedResolutions: ['480P', '720P', '1080P'],
  },
  {
    id: 'wan2.6-i2v',
    apiModel: 'wan2.6-i2v',
    mediaType: 'video',
    family: 'wan',
    caps: ['i2v'],
    supportedFrameImages: ['first_frame'],
    supportedResolutions: ['480P', '720P', '1080P'],
  },

  // ── OpenAI Sora — flat shape with input_reference ────────────────────────
  {
    id: 'sora-2',
    apiModel: 'sora-2',
    mediaType: 'video',
    family: 'generic',
    caps: ['t2v', 'i2v'],
    supportedFrameImages: ['first_frame'],
    supportedSizes: ['720x1280', '1280x720'],
    supportedDurations: [4, 8, 12],
  },
  {
    id: 'sora-2-pro',
    apiModel: 'sora-2-pro',
    mediaType: 'video',
    family: 'generic',
    caps: ['t2v', 'i2v'],
    supportedFrameImages: ['first_frame'],
    supportedSizes: ['720x1280', '1280x720', '1792x1024', '1024x1792'],
    supportedDurations: [4, 8, 12],
  },

  // ── Google Veo — own `veo` family (Gemini predictLongRunning shim) ───────
  // TEXT-TO-VIDEO ONLY on the AIHubMix gateway — verified by probing both
  // variants with a reference image in every accepted form (data URL, public
  // URL, {image_url} object): the shim 400s with "`inlineData`/`referenceImages`
  // isn't supported by this model". So no i2v cap and no frame images for any
  // veo here. Working t2v call: flat body, seconds as a NUMBER, `size` only (no
  // aspect_ratio/resolution). Veo only accepts 4/6/8 seconds.
  {
    id: 'veo-3.1-generate-preview',
    apiModel: 'veo-3.1-generate-preview',
    mediaType: 'video',
    family: 'veo',
    caps: ['t2v'],
    supportedDurations: [4, 6, 8],
  },
  {
    id: 'veo-3.1-lite-generate-preview',
    apiModel: 'veo-3.1-lite-generate-preview',
    mediaType: 'video',
    family: 'veo',
    caps: ['t2v'],
    supportedDurations: [4, 6, 8],
  },

  // ── HappyHorse (Alibaba, DashScope/wanx-backed) ──────────────────────────
  // Verified against a working happyhorse-1.0-i2v call: it uses the DashScope
  // wanx wire — { input:{ prompt, media:[{type:first_frame,url}] },
  // parameters:{ resolution:"720P", duration, prompt_extend, watermark } } —
  // NOT the flat input_reference shape. Routed through the `wan` family.
  {
    id: 'happyhorse-1.0-i2v',
    apiModel: 'happyhorse-1.0-i2v',
    mediaType: 'video',
    family: 'wan',
    caps: ['i2v'],
    supportedFrameImages: ['first_frame'],
    supportedDurations: [5],
    supportedResolutions: ['480P', '720P', '1080P'],
  },
];
