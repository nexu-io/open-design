/** @module core/index
 * Foundational layer: the project files registry (path-safety, listing, read/write/rename, archives, MIME/kind classification), the ignored-directory policy, and daemon project-root resolution.
 * This is the kernel every other subdirectory may depend on directly; core itself never imports from a sibling subdirectory.
 */
export * from './ignored-dirs.js';
export * from './projects.js';
export * from './root.js';
