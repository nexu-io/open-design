// media-adapters — public entrypoint (Phase 1, in-repo; extract to a package later).
export * from './types.js';
export * from './capabilities.js';
export * from './video.js';
export { AIHUBMIX_VIDEO_SEED } from './seed.js';

import { createCapabilityRegistry } from './capabilities.js';
import { AIHUBMIX_VIDEO_SEED } from './seed.js';

/**
 * Default registry seeded with the ported aihubmix-video video models.
 * Phase 2: seed from a live AIHubMix /api/v1/models fetch (with this as fallback).
 */
export const aihubmixMediaRegistry = createCapabilityRegistry(AIHUBMIX_VIDEO_SEED);
