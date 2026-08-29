// @vitest-environment node

// P0 invariant: a project belongs to exactly one workspace, and a workspace
// project listing must never expose another workspace's local projects.
//
// This is intentionally an HTTP-level test rather than a planner/unit test.
// The bug class here is a cross-layer one: project creation writes the
// workspace_projects binding, while the listing route merges local rows with
// remote team rows and applies workspace/type filters. A correct individual
// function is not enough if the two layers disagree.

import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { requestJson } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

type Workspace = {
  workspaceId: string;
  workspaceName: string;
  workspaceType: 'personal' | 'team';
  workspaceMemberId: string;
  role: 'owner' | 'member';
  memberStatus: 'active';
  lifecycleState: 'active';
};

type CreatedProject = {
  project: { id: string; name: string };
};

const PERSONAL: Workspace = {
  workspaceId: 'ws-isolation-personal',
  workspaceName: 'Isolation personal',
  workspaceType: 'personal',
  workspaceMemberId: 'mem-isolation-personal',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
};

const TEAM_A: Workspace = {
  workspaceId: 'ws-isolation-team-a',
  workspaceName: 'Isolation Team A',
  workspaceType: 'team',
  workspaceMemberId: 'mem-isolation-team-a',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
};

const TEAM_B: Workspace = {
  workspaceId: 'ws-isolation-team-b',
  workspaceName: 'Isolation Team B',
  workspaceType: 'team',
  workspaceMemberId: 'mem-isolation-team-b',
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
};

let directoryServer: Server;
let directoryUrl: string;

beforeAll(async () => {
  directoryServer = createServer((req, res) => {
    if (req.url?.startsWith('/api/v1/workspaces') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ items: [PERSONAL, TEAM_A, TEAM_B] }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise<void>((resolve) => directoryServer.listen(0, '127.0.0.1', resolve));
  const address = directoryServer.address();
  if (address == null || typeof address === 'string') throw new Error('directory mock has no port');
  directoryUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => directoryServer.close(() => resolve()));
});

function workspaceHeaders(workspace: Workspace): Record<string, string> {
  return {
    'x-od-workspace-id': workspace.workspaceId,
    'x-od-workspace-type': workspace.workspaceType,
    'x-od-workspace-member-id': workspace.workspaceMemberId,
    'x-od-workspace-role': workspace.role,
    'x-od-workspace-lifecycle-state': workspace.lifecycleState,
    'x-od-workspace-member-status': workspace.memberStatus,
    'x-od-workspace-can-share-projects': workspace.workspaceType === 'team' ? 'true' : 'false',
    'x-od-workspace-can-write-synced-files': 'true',
  };
}

async function createProject(
  webUrl: string,
  name: string,
  workspace: Workspace,
): Promise<CreatedProject['project']> {
  const created = await requestJson<CreatedProject>(webUrl, '/api/projects', {
    method: 'POST',
    headers: workspaceHeaders(workspace),
    body: {
      id: randomUUID(),
      name,
      designSystemId: null,
      skillId: null,
      metadata: { kind: 'prototype' },
      pendingPrompt: null,
    },
  });
  return created.project;
}

describe('workspace project isolation', () => {
  test(
    '[P0] project mutations cannot cross workspace bindings or trust spoofed authority claims',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-workspace-project-isolation');

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          const personalProject = await createProject(webUrl, 'Personal draft', PERSONAL);
          const teamAProject = await createProject(webUrl, 'Team A draft', TEAM_A);
          const teamBProject = await createProject(webUrl, 'Team B draft', TEAM_B);

          // The persisted binding is the source of truth, not the workspace
          // currently selected by another request.
          await expectScope(webUrl, personalProject.id, PERSONAL);
          await expectScope(webUrl, teamAProject.id, TEAM_A);
          await expectScope(webUrl, teamBProject.id, TEAM_B);

          const teamAList = await requestJson<{
            projects: Array<{ id: string }>;
          }>(webUrl, `/api/workspaces/${TEAM_A.workspaceId}/projects?view=drafts`, {
            headers: workspaceHeaders(TEAM_A),
          });
          expect(teamAList.projects.map(({ id }) => id)).toContain(teamAProject.id);
          expect(teamAList.projects.map(({ id }) => id)).not.toContain(teamBProject.id);

          // The route workspace and the asserted membership form one exact
          // authority pair. A caller who belongs to both teams must not be able
          // to combine Team A's headers with Team B's URL and read Team B as if
          // the assertion had named it.
          const crossScopedList = await fetch(
            new URL(`/api/workspaces/${TEAM_B.workspaceId}/projects?view=drafts`, webUrl),
            { headers: workspaceHeaders(TEAM_A) },
          );
          expect(crossScopedList.status).toBe(403);
          expect(await crossScopedList.json()).toMatchObject({
            error: { code: 'WORKSPACE_ACCESS_DENIED' },
          });

          const rename = async (projectId: string, workspace: Workspace, name: string) => {
            const response = await fetch(new URL(`/api/projects/${projectId}`, webUrl), {
              method: 'PATCH',
              headers: { 'content-type': 'application/json', ...workspaceHeaders(workspace) },
              body: JSON.stringify({ name }),
            });
            return response.status;
          };

          expect(await rename(teamAProject.id, TEAM_A, 'Team A renamed')).toBe(200);
          expect(
            await rename(teamAProject.id, TEAM_B, 'Cross-workspace overwrite'),
            'a member of another workspace must not mutate Team A project',
          ).not.toBe(200);
          expect(
            await rename(personalProject.id, TEAM_A, 'Team overwrites personal'),
            'a team request must not mutate a personal-workspace project',
          ).not.toBe(200);
          expect(
            await rename(teamBProject.id, PERSONAL, 'Personal overwrites Team B'),
            'a personal request must not mutate a Team B project',
          ).not.toBe(200);

          const renameWithState = async (
            stateHeaders: Record<string, string>,
            name: string,
          ) => {
            const response = await fetch(
              new URL(`/api/projects/${teamAProject.id}`, webUrl),
              {
                method: 'PATCH',
                headers: {
                  'content-type': 'application/json',
                  ...workspaceHeaders(TEAM_A),
                  ...stateHeaders,
                },
                body: JSON.stringify({ name }),
              },
            );
            return response.status;
          };
          expect(
            await renameWithState(
              { 'x-od-workspace-member-status': 'removed' },
              'Ignored status claim',
            ),
            'the verified directory membership must override a spoofed removed claim',
          ).toBe(200);
          expect(
            await renameWithState(
              { 'x-od-workspace-lifecycle-state': 'locked' },
              'Ignored lifecycle claim',
            ),
            'the verified directory membership must override a spoofed locked claim',
          ).toBe(200);
          expect(
            await renameWithState(
              { 'x-od-workspace-can-write-synced-files': 'false' },
              'Directory-authorized rename',
            ),
            'the daemon must derive write authority from the directory, not request claims',
          ).toBe(200);

          const createRun = async (
            headers?: Record<string, string>,
          ): Promise<number> => {
            const response = await fetch(new URL('/api/runs', webUrl), {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                ...(headers ?? {}),
              },
              body: JSON.stringify({
                agentId: 'claude',
                message: 'Workspace-bound run gate',
                projectId: teamAProject.id,
              }),
            });
            return response.status;
          };
          expect(await createRun(workspaceHeaders(TEAM_A))).toBe(202);
          expect(await createRun(workspaceHeaders(TEAM_B))).not.toBe(202);
          expect(
            await createRun({
              ...workspaceHeaders(TEAM_A),
              'x-od-workspace-member-status': 'removed',
            }),
          ).toBe(202);
          expect(
            await createRun({
              ...workspaceHeaders(TEAM_A),
              'x-od-workspace-lifecycle-state': 'locked',
            }),
          ).toBe(202);
          // Compatibility lane: an unscoped legacy client resolves the
          // account's server-default Team workspace. Explicit Team B still
          // cannot cross into Team A above.
          expect(await createRun()).toBe(202);

          const teamA = await requestJson<CreatedProject>(
            webUrl,
            `/api/projects/${teamAProject.id}`,
            { headers: workspaceHeaders(TEAM_A) },
          );
          expect(teamA.project.name).toBe('Directory-authorized rename');
        },
        {
          env: {
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            VELA_API_URL: directoryUrl,
            VELA_CONTROL_KEY: 'e2e-workspace-isolation-control-key',
          },
        },
      );
    },
  );

  test(
    '[P0] a signed-out no-scope catalog does not expose bound workspace projects',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-workspace-project-isolation-filters');

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          await createProject(webUrl, 'Bound personal project', PERSONAL);
          await createProject(webUrl, 'Bound team project', TEAM_A);

          const response = await requestJson<{ projects: Array<{ name: string }> }>(
            webUrl,
            '/api/projects',
          );
          expect(
            response.projects,
            'the no-scope catalog must contain no project claimed by any workspace',
          ).toEqual([]);
        },
        {
          env: {
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            VELA_API_URL: directoryUrl,
            VELA_CONTROL_KEY: 'e2e-workspace-isolation-filters-control-key',
          },
        },
      );
    },
  );
});

async function expectScope(
  webUrl: string,
  projectId: string,
  workspace: Workspace,
): Promise<void> {
  const response = await requestJson<{
    scope: { kind: string; workspaceId: string | null; context: unknown };
  }>(webUrl, `/api/projects/${projectId}/workspace-scope`, {
    headers: workspaceHeaders(workspace),
  });
  expect(response.scope.workspaceId).toBe(workspace.workspaceId);
  expect(response.scope.kind).toBe(workspace.workspaceType);
}
