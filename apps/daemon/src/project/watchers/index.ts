/** @module watchers/index
 * File-watcher layer: the refcounted per-project chokidar watcher registry that feeds live file-change SSE streams.
 * Depends only on core/ (directory resolution and the ignored-directory policy); no sibling subdirectory imports.
 */
export * from './watchers.js';
