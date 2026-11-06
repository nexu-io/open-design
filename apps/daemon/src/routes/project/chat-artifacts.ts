// Read endpoints for immutable chat artifact snapshots.
//
// AUTHORITY: every route runs the SAME gate as `/raw` — project lookup, then
// `authorizeProjectRequest({ mode: 'read' })`, then the Team-mirror revocation
// check — and only then compares the snapshot's own `project_id` against the
// route's project. An unguessable UUID is not an authorization mechanism, so
// knowing a snapshot id gets a caller nothing without project read authority.
//
// PRIVACY: a caller never supplies a storage key or a path. It supplies an id;
// the daemon resolves the key internally and never reveals it.
//
// SAFETY: only image / video / audio bytes are served inline. Anything else —
// SVG and any future HTML source snapshot included — is forced to
// `application/octet-stream` with an attachment disposition, so a snapshot can
// never execute script in the app's own origin.

import type { Express, Request, Response } from 'express';

import type { AuthorizeProjectRequest } from '../../collab/project-request-authority.js';
import type { RouteDeps } from '../../server-context.js';
import { createChatArtifactBlobStore } from '../../chat-artifacts/blob-store.js';
import {
  getChatArtifactBlob,
  getChatArtifactSnapshot,
  getWorkspaceArtifact,
  type ChatArtifactSnapshotRow,
} from '../../chat-artifacts/store.js';
import { projectChatArtifactRefs } from '../../chat-artifacts/refs.js';
import type {
  ChatArtifactFailureCode,
  ChatArtifactSnapshotMetadata,
  WorkspaceArtifactMetadata,
} from '../../chat-artifacts/types.js';

export interface RegisterProjectChatArtifactRoutesDeps
  extends RouteDeps<'db' | 'http' | 'paths' | 'projectStore'> {
  authorizeProjectRequest: AuthorizeProjectRequest;
}

/** Mime types safe to hand a browser inline from the app's own origin. */
const INLINE_SAFE_MIME = /^(?:image\/(?:png|jpeg|gif|webp|avif)|video\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+)$/iu;

export function registerProjectChatArtifactRoutes(
  app: Express,
  ctx: RegisterProjectChatArtifactRoutesDeps,
): void {
  const { db, authorizeProjectRequest } = ctx;
  const { sendApiError } = ctx.http;
  const { RUNTIME_DATA_DIR } = ctx.paths;
  const { getProject } = ctx.projectStore;
  const blobs = createChatArtifactBlobStore({ dataDir: RUNTIME_DATA_DIR });

  /**
   * Shared read gate. Returns false once it has already answered the request.
   * Deliberately identical in shape to the `/raw` chain so snapshot bytes can
   * never be reachable under weaker authority than the file they came from.
   */
  async function authorizeRead(
    req: Request,
    res: Response,
    projectId: string,
  ): Promise<boolean> {
    const project = getProject(db, projectId);
    if (!project) {
      sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      return false;
    }
    if (!await authorizeProjectRequest(req, res, projectId, {
      mode: 'read',
      allowNavigationQuery: true,
    })) return false;
    if (project?.metadata?.teamMirrorRevokedAt) {
      sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      return false;
    }
    return true;
  }

  /**
   * Resolve a snapshot inside the route's project. A snapshot belonging to a
   * DIFFERENT project is a 404, not a 403: the caller has no authority to learn
   * that the id exists at all.
   */
  function snapshotInProject(
    projectId: string,
    snapshotId: string,
    res: Response,
  ): ChatArtifactSnapshotRow | null {
    const snapshot = getChatArtifactSnapshot(db, snapshotId);
    if (!snapshot || snapshot.projectId !== projectId) {
      sendApiError(res, 404, 'ARTIFACT_NOT_FOUND', 'snapshot not found');
      return null;
    }
    return snapshot;
  }

  // ---- Message refs -------------------------------------------------------

  app.get(
    '/api/projects/:id/conversations/:cid/messages/:mid/artifacts',
    async (req, res) => {
      const projectId = String(req.params.id);
      if (!await authorizeRead(req, res, projectId)) return;
      const owned = db
        .prepare(
          `SELECT m.id AS id FROM messages m
             JOIN conversations c ON c.id = m.conversation_id
            WHERE m.id = ? AND m.conversation_id = ? AND c.project_id = ?`,
        )
        .get(String(req.params.mid), String(req.params.cid), projectId) as
          | { id: string }
          | undefined;
      if (!owned) {
        return sendApiError(res, 404, 'NOT_FOUND', 'message not found');
      }
      res.set('Cache-Control', 'no-store');
      return res.json({ artifacts: projectChatArtifactRefs(db, projectId, owned.id) });
    },
  );

  // ---- Snapshot metadata --------------------------------------------------

  app.get('/api/projects/:id/chat-artifact-snapshots/:sid', async (req, res) => {
    const projectId = String(req.params.id);
    if (!await authorizeRead(req, res, projectId)) return;
    const snapshot = snapshotInProject(projectId, String(req.params.sid), res);
    if (!snapshot) return;
    res.set('Cache-Control', 'no-store');
    return res.json({ snapshot: snapshotMetadata(db, snapshot) });
  });

  // ---- Snapshot bytes -----------------------------------------------------

  app.get('/api/projects/:id/chat-artifact-snapshots/:sid/content', async (req, res) => {
    const projectId = String(req.params.id);
    if (!await authorizeRead(req, res, projectId)) return;
    const snapshot = snapshotInProject(projectId, String(req.params.sid), res);
    if (!snapshot) return;
    return sendSnapshotBlob(req, res, snapshot, snapshot.contentDigest);
  });

  app.get('/api/projects/:id/chat-artifact-snapshots/:sid/thumbnail', async (req, res) => {
    const projectId = String(req.params.id);
    if (!await authorizeRead(req, res, projectId)) return;
    const snapshot = snapshotInProject(projectId, String(req.params.sid), res);
    if (!snapshot) return;
    return sendSnapshotBlob(req, res, snapshot, snapshot.thumbnailDigest);
  });

  // ---- Workspace latest ---------------------------------------------------

  app.get('/api/projects/:id/workspace-artifacts/:aid', async (req, res) => {
    const projectId = String(req.params.id);
    if (!await authorizeRead(req, res, projectId)) return;
    const artifact = getWorkspaceArtifact(db, String(req.params.aid));
    if (!artifact || artifact.projectId !== projectId) {
      return sendApiError(res, 404, 'ARTIFACT_NOT_FOUND', 'artifact not found');
    }
    const metadata: WorkspaceArtifactMetadata = {
      id: artifact.id,
      projectId: artifact.projectId,
      currentPath: artifact.currentPath,
      kind: artifact.kind,
      deleted: artifact.deletedAt !== null,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
    };
    if (artifact.mime) metadata.mime = artifact.mime;
    if (artifact.currentDigest) metadata.currentDigest = artifact.currentDigest;
    if (artifact.currentSize !== null) metadata.currentSize = artifact.currentSize;
    if (artifact.currentMtime !== null) metadata.currentMtime = artifact.currentMtime;
    res.set('Cache-Control', 'no-store');
    return res.json({ artifact: metadata });
  });

  async function sendSnapshotBlob(
    req: Request,
    res: Response,
    snapshot: ChatArtifactSnapshotRow,
    digest: string | null,
  ): Promise<unknown> {
    if (snapshot.captureState !== 'ready' || !digest) {
      // Honest 404 with the reason. The client degrades on this rather than
      // being handed the current workspace file as a stand-in.
      return sendApiError(
        res,
        404,
        'ARTIFACT_NOT_FOUND',
        'snapshot content is not available',
        {
          details: {
            state: snapshot.captureState,
            failureCode: snapshot.failureCode ?? null,
          },
        },
      );
    }
    const blob = getChatArtifactBlob(db, digest);
    if (!blob) {
      return sendApiError(res, 404, 'ARTIFACT_NOT_FOUND', 'snapshot content is not available');
    }
    // The database's claim is checked against the disk before a single byte is
    // sent. A corrupted store fails loudly instead of serving wrong content
    // under an immutable cache header.
    let verified = false;
    try {
      verified = await blobs.verifyBlob(blob.storageKey, blob.byteSize);
    } catch {
      verified = false;
    }
    if (!verified) {
      return sendApiError(res, 410, 'ARTIFACT_NOT_FOUND', 'snapshot content failed verification', {
        details: { reason: 'blob_verification_failed' },
      });
    }

    const etag = `"${digest}"`;
    // Content addressing makes this genuinely immutable: the bytes behind this
    // id can never change, so a conditional request is always answerable.
    if (req.headers['if-none-match'] === etag) {
      res.status(304);
      res.set('ETag', etag);
      res.set('Cache-Control', 'private, max-age=31536000, immutable');
      return res.end();
    }

    const declared = blob.mime ?? snapshot.mime ?? '';
    const inline = INLINE_SAFE_MIME.test(declared);
    res.set('ETag', etag);
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Type', inline ? declared : 'application/octet-stream');
    res.set('Content-Length', String(blob.byteSize));
    if (!inline) {
      // Never let a snapshot render as a document in the app's own origin.
      res.set('Content-Disposition', `attachment; filename="${safeFilename(snapshot)}"`);
    }
    const stream = blobs.createBlobReadStream(blob.storageKey);
    stream.on('error', () => {
      if (!res.headersSent) {
        sendApiError(res, 500, 'INTERNAL_ERROR', 'failed to read snapshot content');
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
    return undefined;
  }
}

function snapshotMetadata(
  db: RegisterProjectChatArtifactRoutesDeps['db'],
  snapshot: ChatArtifactSnapshotRow,
): ChatArtifactSnapshotMetadata {
  const metadata: ChatArtifactSnapshotMetadata = {
    id: snapshot.id,
    projectId: snapshot.projectId,
    sourcePathAtCapture: snapshot.sourcePathAtCapture,
    kind: snapshot.kind,
    state: snapshot.captureState,
    createdAt: snapshot.createdAt,
  };
  if (snapshot.workspaceArtifactId) metadata.workspaceArtifactId = snapshot.workspaceArtifactId;
  if (snapshot.mime) metadata.mime = snapshot.mime;
  if (snapshot.contentDigest) metadata.contentDigest = snapshot.contentDigest;
  if (snapshot.thumbnailDigest) metadata.thumbnailDigest = snapshot.thumbnailDigest;
  if (snapshot.failureCode) {
    metadata.failureCode = snapshot.failureCode as ChatArtifactFailureCode;
  }
  if (snapshot.runId) metadata.runId = snapshot.runId;
  if (snapshot.mediaTaskId) metadata.mediaTaskId = snapshot.mediaTaskId;
  if (snapshot.readyAt !== null) metadata.readyAt = snapshot.readyAt;
  const digest = snapshot.contentDigest ?? snapshot.thumbnailDigest;
  if (digest) {
    const blob = getChatArtifactBlob(db, digest);
    if (blob) metadata.byteSize = blob.byteSize;
  }
  return metadata;
}

/** Capture-time basename, stripped to something safe for a header. */
function safeFilename(snapshot: ChatArtifactSnapshotRow): string {
  const base = snapshot.sourcePathAtCapture.split('/').pop() ?? 'snapshot';
  return base.replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 120) || 'snapshot';
}
