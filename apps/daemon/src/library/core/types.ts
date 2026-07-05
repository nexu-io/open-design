/**
 * @module library/core/types
 *
 * Shared record projections for the OD Library domain — the foundation types
 * every concern subdirectory reads. These sit in `core/` because the store
 * produces them, the asset-orchestration layer consumes them, and the sync and
 * tokens layers pass them around; keeping the definitions here (rather than in
 * `store/`) is what lets `store/` import from `core/` while nothing in `core/`
 * imports a sibling.
 */

import type { LibraryAsset } from '@open-design/contracts';

/**
 * A persisted Library asset row plus the on-disk `filePath` used for raw
 * serving. Owned assets carry an absolute path; referenced assets resolve their
 * project-relative path lazily. Extends the public `LibraryAsset` contract with
 * the one internal field the daemon needs to stream bytes.
 */
export interface LibraryAssetRecord extends LibraryAsset {
  /** Absolute path for owned assets; project-relative resolution otherwise. */
  filePath?: string;
}

/**
 * A persisted browser-extension pairing token row. The token itself is never
 * stored — only its SHA-256 hash — alongside the extension origin it authorizes
 * and last-used bookkeeping.
 */
export interface LibraryTokenRow {
  tokenHash: string;
  label: string;
  extensionOrigin: string;
  createdAt: number;
  lastUsedAt: number;
}
