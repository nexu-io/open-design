/**
 * @module library/assets
 *
 * Asset-orchestration layer: the idempotent `registerLibraryAsset` ingest hook,
 * content-addressed owned storage, Figma/element sidecar writing, and raw-bytes
 * path resolution. Builds on `core/` primitives and `store/` persistence.
 */

export * from './register.js';
