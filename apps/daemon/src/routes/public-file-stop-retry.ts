import type { Express, Request } from 'express';
import type { PublicFileStopRetryRequest, PublicFileStopRetryResponse } from '@open-design/contracts';
import type { VerifiedWorkspaceRequestContextResult } from '../collab/request-workspace-context.js';
import type { PublicFileMutations } from '../collab/public-file-mutations.js';
import { createPublicFileStopStartup, type StopQueuePublicFilePublicationStore, type PreparePublicFileStop } from '../collab/public-file-publication-store.js';

export interface PublicFileStopRetryDeps {
  /** Verify membership only: do not resolve the deleted project. */
  verify(req: Request): Promise<VerifiedWorkspaceRequestContextResult>;
  store: StopQueuePublicFilePublicationStore;
  prepare: PreparePublicFileStop;
  mutations: PublicFileMutations;
}

function retryRequest(value: unknown): PublicFileStopRetryRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['projectId', 'filePath', 'slug'].includes(key))) return null;
  const { projectId, filePath, slug } = body;
  if (typeof projectId !== 'string' || !projectId.trim() || typeof slug !== 'string' || !slug.trim()
    || typeof filePath !== 'string' || !filePath || filePath.includes('\\') || filePath.includes('\0')
    || filePath.split('/').some(part => !part || part === '.' || part === '..')) return null;
  return { projectId, filePath, slug };
}

/** Only an original owner's persisted deletion intent authorizes this operation. */
export function registerPublicFileStopRetryRoutes(app: Express, deps: PublicFileStopRetryDeps): void {
  app.post('/api/public-file-stops/retry', async (req, res) => {
    const input = retryRequest(req.body);
    if (!input) return res.status(400).json({ error: 'INVALID_STOP_RETRY' });
    try {
      const verified = await deps.verify(req);
      if (!verified.ok) return res.status(verified.status).json({ error: verified.code });
      const context = verified.context;
      if (context.memberStatus !== 'active' || context.lifecycleState !== 'active') {
        return res.status(403).json({ error: 'WORKSPACE_ACCESS_DENIED' });
      }
      const task = deps.store.listStops().find(item =>
        item.resourceTeamId === (context.teamId ?? context.workspaceId)
        && item.ownerMemberId === context.workspaceMemberId
        && item.projectId === input.projectId && item.filePath === input.filePath && item.slug === input.slug);
      if (!task) return res.status(404).json({ error: 'PUBLIC_FILE_STOP_TASK_NOT_FOUND' });
      // Explicit user action permits ONE attempt even at the automatic cap.
      // The original budget is neither reset nor extended into an automatic loop.
      const result = await createPublicFileStopStartup({
        ...deps.store, listRetryableStops: () => [task],
      }, deps.prepare, deps.mutations)();
      if (result.stopped === 1) {
        const response: PublicFileStopRetryResponse = { ...input, status: 'stopped' };
        return res.json(response);
      }
      if (result.failed) return res.status(502).json({ error: 'PUBLIC_FILE_STOP_FAILED' });
      if (result.persistenceFailures) return res.status(503).json({ error: 'PUBLIC_FILE_STOP_STORAGE_UNAVAILABLE' });
      return res.status(409).json({ error: 'PUBLIC_FILE_STOP_RETRY_DEFERRED' });
    } catch {
      return res.status(503).json({ error: 'PUBLIC_FILE_STOP_RETRY_UNAVAILABLE' });
    }
  });
}
