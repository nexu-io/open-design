// Projection of `message_artifacts` rows into the `ChatArtifactRef` DTO the
// web client consumes. The DTO itself is owned by `packages/contracts`; this
// file only decides which of its fields a given row can honestly fill.
//
// PRIVACY: only ids, labels and route URLs cross this boundary. Storage keys
// and absolute paths never do — a URL addresses a snapshot by id and the route
// resolves the key internally. Digests, byte sizes and failure codes are
// diagnostics and live on the snapshot metadata endpoint, not on a card.
//
// HONESTY: a URL is emitted ONLY once its bytes are installed and verified.
// Handing out a URL for a half-written snapshot renders as a broken image,
// which is strictly worse than the live-preview fallback it displaced.

import type Database from 'better-sqlite3';
import type { ProjectFileKind } from '@open-design/contracts';

import {
  getChatArtifactSnapshot,
  listMessageArtifactRows,
  listMessageArtifactRowsForConversation,
  type ChatArtifactSnapshotRow,
  type MessageArtifactRow,
} from './store.js';
import type { ChatArtifactRef, ChatArtifactRefState } from './types.js';

const PROJECT_FILE_KINDS: ReadonlySet<string> = new Set<ProjectFileKind>([
  'html', 'image', 'video', 'audio', 'sketch', 'text', 'code',
  'pdf', 'document', 'presentation', 'spreadsheet', 'binary',
]);

export function chatArtifactSnapshotContentUrl(projectId: string, snapshotId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/chat-artifact-snapshots/${encodeURIComponent(snapshotId)}/content`;
}

export function chatArtifactSnapshotThumbnailUrl(projectId: string, snapshotId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/chat-artifact-snapshots/${encodeURIComponent(snapshotId)}/thumbnail`;
}

export function projectChatArtifactRefs(
  db: Database.Database,
  projectId: string,
  messageId: string,
): ChatArtifactRef[] {
  return listMessageArtifactRows(db, messageId).map((row) => toRef(db, projectId, row));
}

/**
 * One query per conversation instead of one per message. `listMessages` reads
 * whole conversations, so a per-row lookup would be a straight N+1.
 */
export function projectConversationChatArtifactRefs(
  db: Database.Database,
  projectId: string,
  conversationId: string,
): Map<string, ChatArtifactRef[]> {
  const grouped = listMessageArtifactRowsForConversation(db, conversationId);
  const out = new Map<string, ChatArtifactRef[]>();
  for (const [messageId, rows] of grouped) {
    out.set(messageId, rows.map((row) => toRef(db, projectId, row)));
  }
  return out;
}

function toRef(
  db: Database.Database,
  projectId: string,
  row: MessageArtifactRow,
): ChatArtifactRef {
  const snapshot = row.snapshotId ? getChatArtifactSnapshot(db, row.snapshotId) : null;
  const ref: ChatArtifactRef = {
    id: row.id,
    label: row.labelAtCapture,
    kind: projectFileKind(row.kind),
    displayPolicy: row.displayPolicy,
    snapshotState: refState(snapshot),
  };
  if (row.workspaceArtifactId) ref.workspaceArtifactId = row.workspaceArtifactId;
  if (!snapshot || snapshot.captureState !== 'ready') return ref;
  ref.snapshotId = snapshot.id;
  if (snapshot.contentDigest) {
    ref.snapshotUrl = chatArtifactSnapshotContentUrl(projectId, snapshot.id);
  }
  if (snapshot.thumbnailDigest) {
    ref.thumbnailUrl = chatArtifactSnapshotThumbnailUrl(projectId, snapshot.id);
  }
  return ref;
}

/**
 * A ref with no snapshot row never had a capture attempted for it — that is
 * `legacy_unavailable`, not `failed`. Both fall back to a live preview, but
 * only `failed` is worth reporting, and calling a card that was never captured
 * a failure buries the real failures in noise.
 */
function refState(snapshot: ChatArtifactSnapshotRow | null): ChatArtifactRefState {
  if (!snapshot) return 'legacy_unavailable';
  if (snapshot.captureState === 'ready') return 'ready';
  if (snapshot.captureState === 'pending') return 'pending';
  return 'failed';
}

function projectFileKind(kind: string): ProjectFileKind {
  return PROJECT_FILE_KINDS.has(kind) ? (kind as ProjectFileKind) : 'binary';
}
