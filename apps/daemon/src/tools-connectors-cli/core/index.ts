/** @module core/index
 * Foundation kernel: shared types & tuning constants, CLI option/IO helpers,
 * GitHub path derivation, design-file scoring/predicates, git & child-process
 * primitives, and the daemon connector API layer. Every sibling subdirectory may
 * import core directly; core itself never imports from a sibling subdirectory.
 */
export * from './api.js';
export * from './cli-io.js';
export * from './design-scoring.js';
export * from './git-process.js';
export * from './github-paths.js';
export * from './types.js';
