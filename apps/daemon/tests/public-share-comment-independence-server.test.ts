import { expect, it, vi } from 'vitest';
import { startServer, type StartServerResult } from '../src/server.js';
import * as collabSyncRoutes from '../src/routes/collab-sync.js';
import { closeDatabase, insertProject, openDatabase, updateProject } from '../src/db.js';
import { ensureWorkspaceArtifactForPath } from '../src/chat-artifacts/store.js';

it('production public-share identity retains its artifact UUID while comment retirement is pending', async () => {
  const register = collabSyncRoutes.registerCollabSyncRoutes;
  let registered: Parameters<typeof register>[1] | undefined;
  const registration = vi.spyOn(collabSyncRoutes, 'registerCollabSyncRoutes').mockImplementation((app, deps) => {
    registered = deps;
    return register(app, deps);
  });
  let started: StartServerResult | undefined;
  try {
    started = await startServer({ port: 0, returnServer: true }) as StartServerResult;
    const sourceFileId = registered?.sharePublishing?.sourceFileId;
    if (!sourceFileId) throw new Error('production public-share source identity was not registered');
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('test data root unavailable');
    const db = openDatabase(dataDir, { dataDir });
    const projectId = 'public-share-comment-independence';
    const filePath = 'pages/work.html';
    insertProject(db, { id: projectId, name: projectId, createdAt: 1, updatedAt: 1 });
    const artifact = ensureWorkspaceArtifactForPath(db, { projectId, path: filePath, kind: 'html' });
    const fact = { sourceFileId: artifact.id, sourceFilePath: filePath, entryPath: 'index.html',
      resourceId: 'comment-resource', versionId: 'comment-version', retired: false };
    updateProject(db, projectId, { metadata: { _commentFiles: { schemaVersion: 1, revision: 1, files: [fact] } } });
    db.prepare(`INSERT INTO comment_file_retirements
      (project_id, source_file_id, workspace_id, creator_member_id, fact_json, committed)
      VALUES (?, ?, ?, ?, ?, 0)`).run(projectId, artifact.id, 'share-team', 'share-owner', JSON.stringify(fact));
    // This fixture really blocks the comment-aware helper previously used by
    // server wiring. The share callback must preserve the same live identity.
    expect(() => ensureWorkspaceArtifactForPath(db, { projectId, path: filePath, kind: 'html' }))
      .toThrow('COMMENT_FILE_RETIREMENT_PENDING');
    const snapshot = () => ({
      project: db.prepare('SELECT * FROM projects WHERE id=?').get(projectId),
      artifacts: db.prepare('SELECT * FROM workspace_artifacts WHERE project_id=?').all(projectId),
      retirements: db.prepare('SELECT * FROM comment_file_retirements WHERE project_id=?').all(projectId),
    });
    const before = snapshot();
    expect(sourceFileId({ projectId, filePath, resourceTeamId: 'share-team', ownerMemberId: 'share-owner' })).toBe(artifact.id);
    expect(snapshot()).toEqual(before);
  } finally {
    await started?.shutdown();
    if (started?.server.listening) await new Promise<void>(resolve => started!.server.close(() => resolve()));
    registration.mockRestore();
    closeDatabase();
  }
});
