// Chat artifact versioning — shared vocabulary.
//
// Two identities, deliberately kept apart (see
// specs/current/chat-artifact-versioning-design.md §3):
//
//   * `workspace_artifacts` is the MUTABLE latest pointer. It answers "what is
//     in Design Files right now" and survives overwrite and rename.
//   * `chat_artifact_snapshots` is the IMMUTABLE message evidence. It answers
//     "what did this turn produce" and never follows the workspace file.
//
// A card's cover and its click target are allowed to disagree, and for HTML
// they are SUPPOSED to: the cover is the frozen static shot of that turn, the
// click opens today's latest. That is the product ruling, not a bug.

import type { ChatArtifactSnapshotState as ContractChatArtifactSnapshotState } from '@open-design/contracts';

/** Lifecycle of one immutable capture. */
export type ChatArtifactSnapshotState = 'pending' | 'ready' | 'failed' | 'orphaned';

/**
 * Why a capture did not produce exact bytes. Every code here means "we refused
 * to guess": none of them ever licenses installing the CURRENT bytes as if they
 * were the historical ones.
 */
export type ChatArtifactFailureCode =
  | 'source_changed'
  | 'source_missing'
  | 'source_unreadable'
  // A cover-only code: the entry HTML exists, but its local dependency graph
  // could not be closed into a self-contained document, so there is nothing the
  // renderer could be handed that is guaranteed to be THIS turn's page.
  | 'dependencies_incomplete'
  | 'blob_missing'
  | 'digest_mismatch'
  // Not a failure of anything: this kind's originals are excluded by policy
  // (user ruling 2026-09-02 — video / audio). It exists only so a RESIDUAL
  // pending intent, written by a build that still stored them, has an honest
  // terminal state. Nothing writes a fresh one; captures for excluded kinds
  // are skipped before any row is inserted.
  | 'not_captured'
  | 'quota_exceeded'
  | 'too_large'
  | 'renderer_unavailable'
  | 'timeout'
  | 'interrupted'
  | 'internal_error';

/**
 * The wire DTO is owned by `packages/contracts`. It is re-exported here so
 * daemon modules have one import site, and so a contract change surfaces as a
 * compile error rather than a silently divergent projection.
 *
 * Note what it deliberately does NOT carry: digests, byte sizes and failure
 * codes. Those are diagnostics, and they live on the snapshot metadata
 * endpoint below — a chat card has no business rendering them.
 */
export type {
  ChatArtifactDisplayPolicy,
  ChatArtifactRef,
} from '@open-design/contracts';

/**
 * The projection's own view of a capture's lifecycle. `orphaned` never reaches
 * a client — it is an internal GC classification — so the wire union in
 * contracts is deliberately narrower than {@link ChatArtifactSnapshotState}.
 */
export type ChatArtifactRefState = ContractChatArtifactSnapshotState;

/** Metadata projection for the workspace-artifact resolve endpoint. */
export interface WorkspaceArtifactMetadata {
  id: string;
  projectId: string;
  /** null once the workspace file was deleted (tombstone). */
  currentPath: string | null;
  kind: string;
  mime?: string;
  currentDigest?: string;
  currentSize?: number;
  currentMtime?: number;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Metadata projection for the snapshot inspect endpoint. */
export interface ChatArtifactSnapshotMetadata {
  id: string;
  projectId: string;
  workspaceArtifactId?: string;
  sourcePathAtCapture: string;
  kind: string;
  mime?: string;
  contentDigest?: string;
  thumbnailDigest?: string;
  byteSize?: number;
  state: ChatArtifactSnapshotState;
  failureCode?: ChatArtifactFailureCode;
  runId?: string;
  mediaTaskId?: string;
  createdAt: number;
  readyAt?: number;
}

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;

/** Content address guard. Anything else must never reach the filesystem. */
export function isContentDigest(value: unknown): value is string {
  return typeof value === 'string' && DIGEST_RE.test(value);
}

/**
 * The hex half of a `sha256:<hex>` address, or null. Callers that build a
 * storage path MUST go through this so a caller-supplied string can never
 * become a path segment.
 */
export function digestHex(value: unknown): string | null {
  return isContentDigest(value) ? value.slice('sha256:'.length) : null;
}
