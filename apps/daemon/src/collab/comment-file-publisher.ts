import { assertNoPendingCommentFileRetirements } from './comment-file-retirements.js';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { getProject, getWorkspaceProjectByProjectId } from '../db.js';
import type { runVelaCommand } from '../integrations/vela-command.js';
import { parseCommentFileState } from './comment-file-facts.js';
import type { createLocalCommentFiles } from './local-comment-files.js';
import type { ResourceHubPrincipal } from './resource-principal.js';

/** Runs inside the existing publication reservation, through receipt admission.
 * Missing lifetimes retire before upload; only HTML in the committed root roster
 * is admitted afterward. An already-recreated native-agent path is not a witness
 * of unlink and is deliberately outside this policy's managed-lifetime guarantee.
 */
export function createCommentFilePublisher(input: {
  db: Database.Database;
  localFiles: ReturnType<typeof createLocalCommentFiles>;
  resolveRoot: (projectId: string) => Promise<string>;
  listFiles: (root: string) => Promise<string[]>;
  runForWorkspace: (workspaceId: string) => typeof runVelaCommand;
}) {
  return async <Result extends { versionId?: string } | null>(
    projectId: string, principal: ResourceHubPrincipal | null | undefined, publish: () => Promise<Result>,
  ): Promise<Result> => {
    assertNoPendingCommentFileRetirements(input.db, projectId);
    if (!principal) return publish();
    const root = await input.resolveRoot(projectId);
    const facts = parseCommentFileState(getProject(input.db, projectId)?.metadata?._commentFiles)?.files ?? [];
    const missing = facts.filter(fact => {
      if (fact.retired) return false;
      try { fs.lstatSync(path.join(root, fact.sourceFilePath)); return false; }
      catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error;
        return true;
      }
    });
    await input.localFiles.retireMany({ projectId, workspaceId: principal.teamId,
      creatorMemberId: principal.memberId, facts: missing, run: input.runForWorkspace(principal.teamId) });
    const result = await publish();
    if (result?.versionId) {
      const binding = getWorkspaceProjectByProjectId(input.db, projectId);
      if (!binding?.resourceHubResourceId) throw new Error('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
      const committedRoot = await input.resolveRoot(projectId);
      const paths = (await input.listFiles(committedRoot)).filter(name => /\.html?$/i.test(name))
        .map(name => ({ sourceFilePath: name, entryPath: name }));
      await input.localFiles.admit({ projectId, workspaceId: principal.teamId,
        creatorMemberId: principal.memberId, resourceId: binding.resourceHubResourceId,
        versionId: result.versionId, paths, run: input.runForWorkspace(principal.teamId) });
    }
    return result;
  };
}
