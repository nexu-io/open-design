import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';

import {
  closeDatabase,
  ensureWorkspaceProject,
  insertProject,
  openDatabase,
  rebindWorkspaceProject,
} from '../../src/db.js';
import {
  openDesignAmrTraceEnvForRun,
  pinRunWorkspaceScopeForProject,
  type ProjectWorkspaceScopeOutcome,
} from '../../src/runtimes/project-amr-trace-env.js';

let tempDir: string | null = null;

afterEach(() => {
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

function seedProject(input: {
  projectId: string;
  workspaceId?: string;
  memberId?: string;
}) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-amr-persisted-scope-'));
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

describe('AMR persisted project Workspace scope', () => {
  it('pins each initial spawn and retry to its own persisted A/B binding', async () => {
    const db = seedProject({
      projectId: 'project-a',
      workspaceId: 'workspace-a',
      memberId: 'member-a',
    });
    const now = Date.now();
    insertProject(db, {
      id: 'project-b',
      name: 'project-b',
      createdAt: now,
      updatedAt: now,
    });
    ensureWorkspaceProject(db, {
      projectId: 'project-b',
      workspaceId: 'workspace-b',
      visibility: 'personal',
      createdByWorkspaceMemberId: 'member-b',
    });

    const scopeA = pinRunWorkspaceScopeForProject(db, 'project-a');
    const scopeB = pinRunWorkspaceScopeForProject(db, 'project-b');
    const initialA = await openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-a',
      runAttempt: 0,
      projectId: 'project-a',
      workspaceScope: scopeA,
    });
    const retryA = await openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-a',
      runAttempt: 1,
      projectId: 'project-a',
      workspaceScope: scopeA,
    });
    const initialB = await openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-b',
      runAttempt: 0,
      projectId: 'project-b',
      workspaceScope: scopeB,
    });
    const retryB = await openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-b',
      runAttempt: 1,
      projectId: 'project-b',
      workspaceScope: scopeB,
    });

    expect(initialA.OPEN_DESIGN_WORKSPACE_ID).toBe('workspace-a');
    expect(retryA.OPEN_DESIGN_WORKSPACE_ID).toBe('workspace-a');
    expect(initialB.OPEN_DESIGN_WORKSPACE_ID).toBe('workspace-b');
    expect(retryB.OPEN_DESIGN_WORKSPACE_ID).toBe('workspace-b');
  });

  it('keeps a run on its authorized Workspace when the project is rebound before retry', async () => {
    const db = seedProject({
      projectId: 'project-a',
      workspaceId: 'workspace-a',
      memberId: 'member-a',
    });

    const workspaceScope = pinRunWorkspaceScopeForProject(db, 'project-a');
    const initial = await openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-a',
      runAttempt: 0,
      projectId: 'project-a',
      workspaceScope,
    });
    rebindWorkspaceProject(db, 'project-a', {
      workspaceId: 'workspace-b',
      updatedAt: Date.now() + 1,
    });
    const retry = await openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-a',
      runAttempt: 1,
      projectId: 'project-a',
      workspaceScope,
    });

    expect(initial.OPEN_DESIGN_WORKSPACE_ID).toBe('workspace-a');
    expect(retry.OPEN_DESIGN_WORKSPACE_ID).toBe('workspace-a');
  });

  it('keeps the verified Workspace when the project is rebound before the first spawn', async () => {
    const db = seedProject({
      projectId: 'project-a',
      workspaceId: 'workspace-a',
      memberId: 'member-a',
    });

    const workspaceScope = pinRunWorkspaceScopeForProject(db, 'project-a');
    rebindWorkspaceProject(db, 'project-a', {
      workspaceId: 'workspace-b',
      updatedAt: Date.now() + 1,
    });
    const initial = await openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-a',
      runAttempt: 0,
      projectId: 'project-a',
      workspaceScope,
    });

    expect(initial.OPEN_DESIGN_WORKSPACE_ID).toBe('workspace-a');
  });

  it('does not expose membership/current/directory inputs to the billing-scope resolver', async () => {
    expectTypeOf<NonNullable<Parameters<typeof openDesignAmrTraceEnvForRun>[1]>>()
      .toEqualTypeOf<{
        onWorkspaceScopeOutcome?: (outcome: ProjectWorkspaceScopeOutcome) => void;
      }>();
    const db = seedProject({
      projectId: 'project-a',
      workspaceId: 'workspace-a',
      memberId: 'member-a',
    });
    const outcomes: ProjectWorkspaceScopeOutcome[] = [];

    const workspaceScope = pinRunWorkspaceScopeForProject(db, 'project-a');
    const initial = await openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-a',
      runAttempt: 0,
      projectId: 'project-a',
      workspaceScope,
    }, {
      onWorkspaceScopeOutcome: (outcome) => outcomes.push(outcome),
    });
    const retry = await openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-a',
      runAttempt: 1,
      projectId: 'project-a',
      workspaceScope,
    }, {
      onWorkspaceScopeOutcome: (outcome) => outcomes.push(outcome),
    });

    expect(initial.OPEN_DESIGN_WORKSPACE_ID).toBe('workspace-a');
    expect(retry.OPEN_DESIGN_WORKSPACE_ID).toBe('workspace-a');
    expect(outcomes).toEqual([0, 1].map(() => ({
      kind: 'resolved_persisted_binding',
      projectId: 'project-a',
      workspaceId: 'workspace-a',
    })));
  });

  it('passes a persisted Personal Workspace id on initial spawn and retry', async () => {
    const db = seedProject({
      projectId: 'project-personal',
      workspaceId: 'workspace-personal',
      memberId: 'member-personal',
    });
    const workspaceScope = pinRunWorkspaceScopeForProject(db, 'project-personal');
    const initial = await openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-personal',
      runAttempt: 0,
      projectId: 'project-personal',
      workspaceScope,
    });
    const retry = await openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-personal',
      runAttempt: 1,
      projectId: 'project-personal',
      workspaceScope,
    });

    expect(initial.OPEN_DESIGN_WORKSPACE_ID).toBe('workspace-personal');
    expect(retry.OPEN_DESIGN_WORKSPACE_ID).toBe('workspace-personal');
  });

  it('refuses an unbound AMR project on both initial spawn and retry', async () => {
    const db = seedProject({ projectId: 'project-legacy' });
    const outcomes: ProjectWorkspaceScopeOutcome[] = [];
    await expect(openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-legacy',
      runAttempt: 0,
      projectId: 'project-legacy',
      workspaceScope: pinRunWorkspaceScopeForProject(db, 'project-legacy'),
    }, {
      onWorkspaceScopeOutcome: (outcome) => outcomes.push(outcome),
    })).rejects.toMatchObject({
      code: 'AMR_WORKSPACE_SCOPE_REQUIRED',
      projectId: 'project-legacy',
    });
    await expect(openDesignAmrTraceEnvForRun({
      agentId: 'amr',
      runId: 'run-legacy',
      runAttempt: 1,
      projectId: 'project-legacy',
      workspaceScope: pinRunWorkspaceScopeForProject(db, 'project-legacy'),
    }, {
      onWorkspaceScopeOutcome: (outcome) => outcomes.push(outcome),
    })).rejects.toMatchObject({
      code: 'AMR_WORKSPACE_SCOPE_REQUIRED',
      projectId: 'project-legacy',
    });
    expect(outcomes).toHaveLength(2);
    expect(outcomes).toEqual([0, 1].map(() => ({
      kind: 'refused_unbound',
      projectId: 'project-legacy',
      workspaceId: null,
    })));
  });

  it.each(['claude', 'codex', 'opencode', 'byok-opencode'])(
    'does not add Workspace scope or read project binding for the %s runtime',
    async (agentId) => {
      const db = seedProject({
        projectId: 'project-a',
        workspaceId: 'workspace-a',
        memberId: 'member-a',
      });
      const outcomes: ProjectWorkspaceScopeOutcome[] = [];
      const env = await openDesignAmrTraceEnvForRun({
        agentId,
        runId: `run-${agentId}`,
        runAttempt: 0,
        projectId: 'project-a',
      }, {
        onWorkspaceScopeOutcome: (outcome) => outcomes.push(outcome),
      });

      expect(env).not.toHaveProperty('OPEN_DESIGN_WORKSPACE_ID');
      expect(outcomes).toEqual([]);
    },
  );
});
