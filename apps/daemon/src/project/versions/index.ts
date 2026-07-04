/** @module versions/index
 * File-version layer: the per-file version store under `.file-versions/` — create/list/read/restore version history, rename/delete bookkeeping, and the per-file write lock.
 * Depends only on core/ (path validation, id checks, MIME/kind classification); no sibling subdirectory imports.
 */
export * from './file-versions.js';
