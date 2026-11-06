import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  ensureWorkspaceProject,
  insertProject,
  openDatabase,
} from '../../src/db.js';
import {
  accountScopedRunWorkspaceScopeForProject,
  openDesignAmrTraceEnvForRun,
  pinRunWorkspaceScopeForProject,
} from '../../src/runtimes/project-amr-trace-env.js';

let tempDir: string | null = null;

afterEach(() => {
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

function projectDb(input: {
  projectId: string;
  workspaceId?: string;
  memberId?: string;
}) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-amr-project-scope-'));
  const db = openDatabase(tempDir);
  const now = Date.now();
  insertProject(db, {
    id: input.projectId,
    name: input.projectId,
    createdAt: now,
    updatedAt: now,
  });
  if (input.workspaceId) {
    ensureWorkspaceProject(db, {
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      visibility: 'personal',
      createdByWorkspaceMemberId: input.memberId ?? null,
    });
  }
  return db;
}

describe('openDesignAmrTraceEnvForRun', () => {
  it('pins the creator member with the Workspace and does not follow later project rebinding', () => {
    const db = projectDb({
      projectId: 'project-a',
      workspaceId: 'workspace-a',
      memberId: 'member-a',
    });
    const scope = pinRunWorkspaceScopeForProject(db, 'project-a');
    db.prepare(`UPDATE workspace_projects
      SET workspace_id = ?, created_by_workspace_member_id = ?
      WHERE project_id = ?`).run('workspace-b', 'member-b', 'project-a');
    expect(scope).toMatchObject({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
    });
    expect(pinRunWorkspaceScopeForProject(db, 'project-a')).toMatchObject({
      workspaceId: 'workspace-b',
      workspaceMemberId: 'member-b',
    });
  });

  it('does not resolve project scope for a non-AMR runtime', async () => {
    const db = projectDb({
      projectId: 'project-a',
      workspaceId: 'workspace-a',
      memberId: 'member-a',
    });
    await expect(openDesignAmrTraceEnvForRun({
      agentId: 'claude',
      runId: 'run-claude',
      runAttempt: 0,
      projectId: 'project-a',
    })).resolves.toEqual({});
  });

  it('carries the persisted Team binding into the final AMR spawn environment', async () => {
    const db = projectDb({
      projectId: 'project-a',
      workspaceId: 'workspace-a',
      memberId: 'member-a',
    });
    const env = await openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-a',
      conversationId: 'conversation-a',
      runAttempt: 0,
      projectId: 'project-a',
      workspaceScope: pinRunWorkspaceScopeForProject(db, 'project-a'),
    });

    expect(env).toMatchObject({
      OPEN_DESIGN_RUN_ID: 'run-a',
      OPEN_DESIGN_SESSION_ID: 'conversation-a',
      OPEN_DESIGN_WORKSPACE_ID: 'workspace-a',
    });
  });

  it('uses the Team Workspace for a private draft bound to that Team', async () => {
    const db = projectDb({
      projectId: 'project-team-draft',
      workspaceId: 'workspace-team',
      memberId: 'member-team',
    });
    const env = await openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-team-draft',
      runAttempt: 0,
      projectId: 'project-team-draft',
      workspaceScope: pinRunWorkspaceScopeForProject(db, 'project-team-draft'),
    });

    expect(env.OPEN_DESIGN_WORKSPACE_ID).toBe('workspace-team');
  });

  it('passes a persisted Personal Workspace explicitly instead of treating it as unscoped', async () => {
    const db = projectDb({
      projectId: 'project-personal',
      workspaceId: 'workspace-personal',
      memberId: 'member-personal',
    });
    const env = await openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-personal',
      runAttempt: 0,
      projectId: 'project-personal',
      workspaceScope: pinRunWorkspaceScopeForProject(db, 'project-personal'),
    });

    expect(env.OPEN_DESIGN_WORKSPACE_ID).toBe('workspace-personal');
  });

  it('spawns a truly unbound local project on the signed-in account wallet', async () => {
    const db = projectDb({ projectId: 'project-legacy' });
    const env = await openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-legacy',
      runAttempt: 0,
      projectId: 'project-legacy',
      workspaceScope: accountScopedRunWorkspaceScopeForProject('project-legacy'),
    });
    expect(env.OPEN_DESIGN_RUN_ID).toBe('run-legacy');
    expect(env).not.toHaveProperty('OPEN_DESIGN_WORKSPACE_ID');
  });

  it('does not infer account scope from a missing run proof', async () => {
    projectDb({ projectId: 'project-proof-missing' });
    await expect(openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-proof-missing',
      runAttempt: 0,
      projectId: 'project-proof-missing',
      workspaceScope: null,
    })).rejects.toMatchObject({
      code: 'AMR_WORKSPACE_SCOPE_REQUIRED',
      projectId: 'project-proof-missing',
    });
  });

  it('refuses AMR scratch execution without a Workspace-bound project', async () => {
    const db = projectDb({ projectId: 'project-control' });
    await expect(openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-scratch',
      runAttempt: 0,
      projectId: null,
    })).rejects.toMatchObject({
      code: 'AMR_WORKSPACE_SCOPE_REQUIRED',
      projectId: null,
    });
  });
});
