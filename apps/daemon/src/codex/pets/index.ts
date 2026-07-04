/**
 * @module codex/pets
 *
 * Codex hatch-pet registry: lists the user's and the bundled curated pets and
 * safely resolves a single pet's spritesheet for the download route. Resolves
 * the Codex home through the domain foundation.
 */

export {
  resolveCodexPetsRoot,
  listCodexPets,
  readCodexPetSpritesheet,
} from './codex-pets.js';
export type {
  CodexPetSummaryRecord,
  CodexPetListResult,
} from './codex-pets.js';
