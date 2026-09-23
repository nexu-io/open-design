import Database from 'better-sqlite3';
import express from 'express';
import http from 'node:http';
import { expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { registerPublicFileStopRetryRoutes } from '../src/routes/public-file-stop-retry.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { migrateCommentRelayOutbox } from '../src/collab/comment-relay-outbox.js';
import { createPublicFileMutations } from '../src/collab/public-file-mutations.js';

it.each(['success', 'orphan', 'wrong-member', 'wrong-team', 'inactive', 'unauthorized', 'missing-task', 'stale', 'prepared-other-owner', 'network', 'exhausted-fails', 'exhausted-succeeds', 'invalid-path', 'extra-identity'] as const)('HTTP deleted-file stop retry: %s', async mode => {
  const db = new Database(':memory:');
  migratePublicFilePublications(db); migrateCommentRelayOutbox(db);
  const store = createSqlitePublicFilePublicationStore(db);
  const key = { resourceTeamId: 'w', ownerMemberId: 'o', projectId: 'deleted-project', filePath: 'pages/local.html', slug: 'stable' };
  store.set(key, { slug: key.slug, url: 'https://example.test/artifact/deleted-project/stable', fileName: key.filePath });
  const revision = store.getRevision(key)!;
  if (mode !== 'missing-task') store.enqueueStop(key, revision);
  if (mode === 'orphan') store.delete(key);
  if (mode.startsWith('exhausted')) for (let i = 0; i < 4; i++) store.recordStopFailure(key);
  const context: WorkspaceCollabContext = {
    workspaceId: mode === 'wrong-team' ? 'other' : 'w', workspaceType: 'personal',
    workspaceMemberId: mode === 'wrong-member' ? 'other' : 'o', role: 'owner',
    memberStatus: 'active', lifecycleState: mode === 'inactive' ? 'deleted' : 'active',
    billingState: 'active', planId: null, providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  const stop = vi.fn(async () => { if (mode === 'network' || mode === 'exhausted-fails') throw new Error('private upstream diagnostic'); });
  const prepare = vi.fn(async () => {
    if (mode === 'stale') store.set(key, { slug: key.slug, url: 'https://example.test/new', fileName: key.filePath });
    return { resourceTeamId: 'w', ownerMemberId: mode === 'prepared-other-owner' ? 'other' : 'o', stop };
  });
  const app = express(); app.use(express.json());
  registerPublicFileStopRetryRoutes(app, { store, prepare, mutations: createPublicFileMutations(),
    verify: async () => mode === 'unauthorized'
      ? { ok: false, status: 401, code: 'AMR_AUTH_REQUIRED', message: 'login required' }
      : { ok: true, context },
  });
  const server = http.createServer(app);
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('not listening');
    const body = { projectId: key.projectId, filePath: mode === 'invalid-path' ? '../secret' : key.filePath, slug: key.slug,
      ...(mode === 'extra-identity' ? { ownerMemberId: 'o' } : {}) };
    const response = await fetch(`http://127.0.0.1:${address.port}/api/public-file-stops/retry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    const success = ['success', 'orphan', 'exhausted-succeeds'].includes(mode);
    const attempted = success || mode === 'network' || mode === 'exhausted-fails';
    expect(stop).toHaveBeenCalledTimes(attempted ? 1 : 0);
    if (success) {
      expect(response.status).toBe(200); expect(result).toEqual({ ...body, status: 'stopped' });
      expect(store.listStops()).toEqual([]); expect(store.get(key)).toBeNull();
    } else {
      const status = ['wrong-member', 'wrong-team', 'missing-task'].includes(mode) ? 404
        : mode === 'inactive' ? 403 : mode === 'unauthorized' ? 401
        : ['invalid-path', 'extra-identity'].includes(mode) ? 400
        : ['stale', 'prepared-other-owner'].includes(mode) ? 409 : 502;
      expect(response.status).toBe(status);
      expect(JSON.stringify(result)).not.toContain('private');
      if (mode !== 'missing-task') expect(store.listStops()[0]?.failureCount).toBe(mode === 'exhausted-fails' ? 5 : mode === 'network' ? 2 : 1);
      expect(store.get(key)).not.toBeNull();
    }
    // There is no projects table: all authorization above survives its deletion.
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").all()).toEqual([]);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});
