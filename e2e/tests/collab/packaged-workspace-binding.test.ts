// @vitest-environment node

// P0: connect the packaged feature gate to a real daemon transaction. Unit
// tests already pin the emitted env byte-for-byte; this witness proves that the
// exact env can drive Personal/Team authority and that persisted project homes
// survive a complete daemon restart.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, test } from 'vitest';

import {
  startFakeCollabHub,
  type FakeCollabHub,
} from '@/playwright/fake-collab-hub';
import { requestJson } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

const TEAM_ID = 'ws-packaged-transaction-team';
const IDENTITY = {
  controlKey: 'packaged-transaction-owner-key',
  memberId: 'mem-packaged-transaction-owner',
  name: 'Packaged Owner',
  role: 'owner' as const,
};
const PERSONAL_ID = `personal-${IDENTITY.memberId}`;
const PERSONAL_MEMBER_ID = `personal-member-${IDENTITY.memberId}`;

let hub: FakeCollabHub | null = null;
let externalRoot: string | null = null;

afterEach(async () => {
  await hub?.close();
  hub = null;
  if (externalRoot) await rm(externalRoot, { force: true, recursive: true });
  externalRoot = null;
});

describe('packaged Workspace Team transaction', () => {
  test(
    '[P0] feature-test transport keeps Personal and Team project homes across a daemon restart',
    { timeout: 360_000 },
    async () => {
      externalRoot = await mkdtemp(join(tmpdir(), 'od-packaged-workspace-e2e-'));
      const sharedDataDir = join(externalRoot, 'persisted-daemon-data');
      hub = await startFakeCollabHub({
        root: join(externalRoot, 'hub'),
        workspaceId: TEAM_ID,
        workspaceName: 'Packaged Transaction Team',
        clients: [IDENTITY],
        includePersonalWorkspace: true,
      });
      const velaBin = await hub.writeVelaBin(join(externalRoot, 'fake-vela'));
      // apps/packaged/tests/workspace-team.test.ts pins the feature gate that
      // emits this exact set. E2E consumes the public process environment,
      // keeping the guarded packaged leaf out of the broad test runtime.
      const packagedEnv = {
        OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
        OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli',
        OD_COLLAB_TRANSPORT: 'vela-cli',
        OD_RESOURCE_TRANSPORT: 'vela-cli',
        OD_VELA_WEB_URL: 'https://feature-test.vela.example',
      };
      expect(packagedEnv).toEqual({
        OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
        OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli',
        OD_COLLAB_TRANSPORT: 'vela-cli',
        OD_RESOURCE_TRANSPORT: 'vela-cli',
        OD_VELA_WEB_URL: 'https://feature-test.vela.example',
      });
      const runtimeEnv = {
        ...packagedEnv,
        AMR_HOME: join(externalRoot, 'empty-amr-home'),
        VELA_API_URL: hub.url,
        VELA_BIN: velaBin,
        VELA_CONTROL_KEY: IDENTITY.controlKey,
      };
      const first = await createSmokeSuite('packaged-workspace-first', {
        dataDir: sharedDataDir,
      });
      let personalProjectId = '';
      let teamProjectId = '';

      await first.with.toolsDev(
        async ({ webUrl }) => {
          personalProjectId = await createProject(
            webUrl,
            'Packaged Personal Project',
            workspaceHeaders({
              workspaceId: PERSONAL_ID,
              workspaceMemberId: PERSONAL_MEMBER_ID,
              workspaceType: 'personal',
            }),
          );
          teamProjectId = await createProject(
            webUrl,
            'Packaged Team Project',
            workspaceHeaders({
              workspaceId: TEAM_ID,
              workspaceMemberId: IDENTITY.memberId,
              workspaceType: 'team',
            }),
          );
          await expectWorkspaceLists(webUrl, personalProjectId, teamProjectId);
        },
        { env: runtimeEnv },
      );

      // A new namespace/process pair reopens the same packaged daemon data
      // root. No in-memory selection or cache survives this boundary.
      const restarted = await createSmokeSuite('packaged-workspace-restarted', {
        dataDir: sharedDataDir,
      });
      await restarted.with.toolsDev(
        async ({ webUrl }) => {
          await expectWorkspaceLists(webUrl, personalProjectId, teamProjectId);
          const personalScope = await readScope(webUrl, personalProjectId, workspaceHeaders({
            workspaceId: PERSONAL_ID,
            workspaceMemberId: PERSONAL_MEMBER_ID,
            workspaceType: 'personal',
          }));
          const teamScope = await readScope(webUrl, teamProjectId, workspaceHeaders({
            workspaceId: TEAM_ID,
            workspaceMemberId: IDENTITY.memberId,
            workspaceType: 'team',
          }));
          expect(personalScope.scope).toMatchObject({
            kind: 'personal',
            workspaceId: PERSONAL_ID,
          });
          expect(teamScope.scope).toMatchObject({ kind: 'team', workspaceId: TEAM_ID });
        },
        { env: runtimeEnv },
      );
    },
  );
});

type ScopeIdentity = {
  workspaceId: string;
  workspaceMemberId: string;
  workspaceType: 'personal' | 'team';
};

function workspaceHeaders(identity: ScopeIdentity): Record<string, string> {
  return {
    'x-od-workspace-id': identity.workspaceId,
    'x-od-workspace-member-id': identity.workspaceMemberId,
    'x-od-workspace-type': identity.workspaceType,
    'x-od-workspace-role': 'owner',
    'x-od-workspace-member-status': 'active',
    'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-can-share-projects': 'true',
    'x-od-workspace-can-write-synced-files': 'true',
    'x-od-workspace-can-manage-shared-resources': 'true',
  };
}

async function createProject(
  webUrl: string,
  name: string,
  headers: Record<string, string>,
): Promise<string> {
  const created = await requestJson<{ project: { id: string } }>(webUrl, '/api/projects', {
    method: 'POST',
    headers,
    body: {
      designSystemId: null,
      id: randomUUID(),
      metadata: { kind: 'prototype' },
      name,
      pendingPrompt: null,
      skillId: null,
    },
  });
  return created.project.id;
}

async function expectWorkspaceLists(
  webUrl: string,
  personalProjectId: string,
  teamProjectId: string,
): Promise<void> {
  const personal = await requestJson<{ projects: Array<{ id: string }> }>(
    webUrl,
    `/api/workspaces/${PERSONAL_ID}/projects?view=drafts`,
    {
      headers: workspaceHeaders({
        workspaceId: PERSONAL_ID,
        workspaceMemberId: PERSONAL_MEMBER_ID,
        workspaceType: 'personal',
      }),
    },
  );
  const team = await requestJson<{ projects: Array<{ id: string }> }>(
    webUrl,
    `/api/workspaces/${TEAM_ID}/projects?view=drafts`,
    {
      headers: workspaceHeaders({
        workspaceId: TEAM_ID,
        workspaceMemberId: IDENTITY.memberId,
        workspaceType: 'team',
      }),
    },
  );
  expect(personal.projects.map(({ id }) => id)).toContain(personalProjectId);
  expect(personal.projects.map(({ id }) => id)).not.toContain(teamProjectId);
  expect(team.projects.map(({ id }) => id)).toContain(teamProjectId);
  expect(team.projects.map(({ id }) => id)).not.toContain(personalProjectId);
}

async function readScope(
  webUrl: string,
  projectId: string,
  headers: Record<string, string>,
): Promise<{ scope: { kind: string; workspaceId: string | null } }> {
  return await requestJson(webUrl, `/api/projects/${projectId}/workspace-scope`, { headers });
}
