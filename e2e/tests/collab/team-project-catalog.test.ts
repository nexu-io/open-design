// @vitest-environment node

import { access, chmod, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { requestJson, requestText } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

const TEAM = {
  workspaceId: 'ws-team-catalog',
  workspaceName: 'Catalog team',
  workspaceType: 'team' as const,
  workspaceMemberId: 'mem-team-catalog',
  role: 'member' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
};
const PERSONAL = {
  workspaceId: 'ws-personal-catalog',
  workspaceName: 'Ada workspace',
  workspaceType: 'personal' as const,
  workspaceMemberId: 'mem-personal-catalog',
  role: 'owner' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
};

let authority: Server;
let authorityUrl: string;
let authorityWorkspace: 'team' | 'personal' = 'team';

function workspaceHeaders(workspace: typeof TEAM | typeof PERSONAL): Record<string, string> {
  return {
    'x-od-workspace-id': workspace.workspaceId,
    'x-od-workspace-member-id': workspace.workspaceMemberId,
  };
}

beforeAll(async () => {
  authority = createServer((req, res) => {
    if (req.url === '/api/v1/workspaces/current' && req.method === 'GET') {
      const current = authorityWorkspace === 'team' ? TEAM : PERSONAL;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ...current,
        billingState: authorityWorkspace === 'team' ? 'active' : 'free',
        planId: authorityWorkspace === 'team' ? 'team_plus' : null,
        providerMode: 'platform_credits',
        seatSummary: authorityWorkspace === 'team'
          ? { seatLimit: 5, usedSeats: 2 }
          : { seatLimit: 1, usedSeats: 1 },
      }));
      return;
    }
    if (req.url === '/api/v1/workspaces' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ items: [authorityWorkspace === 'team' ? TEAM : PERSONAL] }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise<void>((resolve) => authority.listen(0, '127.0.0.1', resolve));
  const address = authority.address();
  if (address == null || typeof address === 'string') throw new Error('mock catalog authority has no port');
  authorityUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => authority.close(() => resolve()));
});

async function writeTeamProjectsVelaBin(path: string): Promise<string> {
  await writeFile(
    path,
    `#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'collab') process.exit(0);
if (args[0] === 'resource' && args[1] === 'head') {
  process.stdout.write(JSON.stringify({ version: 7, versionId: 'v7' }) + '\\n');
  process.exit(0);
}
if (args[0] === 'resource' && args[1] === 'push') {
  process.stdout.write(JSON.stringify({ version: 8, versionId: 'v8' }) + '\\n');
  process.exit(0);
}
if (args[0] === 'resource' && args[1] === 'pull') {
  const failOnceFile = process.env.FAKE_PULL_FAIL_ONCE_FILE;
  if (failOnceFile && !existsSync(failOnceFile)) {
    writeFileSync(failOnceFile, 'failed-once');
    process.stderr.write('transient pull failure\\n');
    process.exit(1);
  }
  const targetDir = args[4];
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(
    targetDir + '/index.html',
    '<!doctype html><html><body data-e2e="first-materialized">shared</body></html>',
  );
  writeFileSync(
    targetDir + '/open-design.json',
    JSON.stringify({ name: 'First-open materialized project', createdAt: 1, updatedAt: 2 }),
  );
  process.stdout.write(JSON.stringify({ version: 7, versionId: 'v7' }) + '\\n');
  process.exit(0);
}
if (args[0] !== 'team-projects') process.exit(1);
if (args[1] === '--help') {
  process.stdout.write('team-projects list\\n');
  process.exit(0);
}
if (args[1] === 'upsert' || args[1] === 'remove') {
  if (process.env.FAKE_TEAM_PROJECT_MUTATION_LOG) {
    appendFileSync(
      process.env.FAKE_TEAM_PROJECT_MUTATION_LOG,
      JSON.stringify({ args, workspaceId: process.env.OPEN_DESIGN_WORKSPACE_ID ?? null }) + '\\n',
    );
  }
  process.stdout.write('{}\\n');
  process.exit(0);
}
if (args[1] === 'get' && args[2] === 'first-open-shared-project') {
  process.stdout.write(JSON.stringify({
    id: 'catalog-first-open',
    workspaceId: 'ws-team-catalog',
    projectId: 'first-open-shared-project',
    resourceId: 'resource-first-open',
    ownerMemberId: 'mem-first-open-owner',
    displayName: 'First-open materialized project',
    syncState: 'synced',
    lastSyncedVersionId: 'v7',
    createdAt: '2026-07-31T00:00:00Z',
    updatedAt: '2026-07-31T00:01:00Z',
    access: { canView: true, canComment: true, canEdit: false, frozen: false },
  }) + '\\n');
  process.exit(0);
}
if (args[1] === 'list' || args[1] === undefined) {
  const projects = [
    {
      projectId: 'shared-project-1',
      resourceId: 'resource-1',
      ownerMemberId: 'mem-owner',
      displayName: 'Shared durable project',
      syncState: 'synced',
      lastSyncedVersionId: 'v7',
      createdAt: '2026-07-31T00:00:00Z',
      updatedAt: '2026-07-31T00:01:00Z',
    },
    {
      projectId: 'shared-project-pending',
      resourceId: 'resource-pending',
      ownerMemberId: 'mem-owner',
      displayName: 'Not durable yet',
      syncState: 'pending_upload',
      createdAt: '2026-07-31T00:00:00Z',
      updatedAt: '2026-07-31T00:00:00Z',
    },
  ];
  if (process.env.FAKE_STALE_TEAM_PROJECT === '1') {
    projects.push({
      projectId: 'stale-unshare-project',
      resourceId: 'resource-stale-unshare',
      ownerMemberId: 'mem-team-catalog',
      displayName: 'Stale shared project',
      syncState: 'synced',
      lastSyncedVersionId: 'stale-v1',
      createdAt: '2026-07-31T00:00:00Z',
      updatedAt: '2026-07-31T00:02:00Z',
    });
  }
  if (process.env.FAKE_FIRST_OPEN_PROJECT === '1') {
    projects.push({
      projectId: 'first-open-shared-project',
      resourceId: 'resource-first-open',
      ownerMemberId: 'mem-first-open-owner',
      displayName: 'First-open materialized project',
      syncState: 'synced',
      lastSyncedVersionId: 'v7',
      createdAt: '2026-07-31T00:00:00Z',
      updatedAt: '2026-07-31T00:01:00Z',
    });
  }
  process.stdout.write(JSON.stringify({ projects }) + '\\n');
  process.exit(0);
}
process.exit(1);
`,
    'utf8',
  );
  await chmod(path, 0o755);
  return path;
}

describe('team shared-project catalog', () => {
  test(
    'reads the active team catalog through the workspace-scoped vela CLI and hides non-durable rows',
    { timeout: 240_000 },
    async () => {
      const suite = await createSmokeSuite('collab-team-project-catalog');
      authorityWorkspace = 'team';
      const velaBin = await writeTeamProjectsVelaBin(join(suite.scratchDir, 'fake-vela-team-projects'));

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          const context = await requestJson<{ context: { workspaceId: string } | null }>(
            webUrl,
            '/api/workspace/context',
            { headers: workspaceHeaders(TEAM) },
          );
          expect(context.context?.workspaceId).toBe(TEAM.workspaceId);

          const catalog = await requestJson<{
            projects: Array<{
              projectId: string;
              ownerMemberId: string;
              name?: string;
              sharedAt: string;
            }>;
          }>(webUrl, '/api/workspace/projects/team', {
            headers: workspaceHeaders(TEAM),
          });
          expect(catalog.projects).toHaveLength(1);
          expect(catalog.projects[0]).toMatchObject({
            projectId: 'shared-project-1',
            ownerMemberId: 'mem-owner',
            name: 'Shared durable project',
          });
          expect(catalog.projects[0]?.projectId).not.toBe('shared-project-pending');
        },
        {
          env: {
            AMR_HOME: join(suite.scratchDir, 'empty-amr-home'),
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli',
            VELA_API_URL: authorityUrl,
            VELA_CONTROL_KEY: 'e2e-team-catalog-control-key',
            VELA_BIN: velaBin,
          },
        },
      );
    },
  );

  test(
    'does not expose team shared projects while the active workspace is personal',
    { timeout: 240_000 },
    async () => {
      const suite = await createSmokeSuite('collab-personal-project-catalog');
      authorityWorkspace = 'personal';
      const velaBin = await writeTeamProjectsVelaBin(join(suite.scratchDir, 'fake-vela-team-projects'));

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          const context = await requestJson<{ context: { workspaceType: string } | null }>(
            webUrl,
            '/api/workspace/context',
            { headers: workspaceHeaders(PERSONAL) },
          );
          expect(context.context?.workspaceType).toBe('personal');

          const catalog = await fetch(
            new URL('/api/workspace/projects/team', webUrl),
            { headers: workspaceHeaders(PERSONAL) },
          );
          expect(catalog.status).toBe(403);
          expect(await catalog.json()).toMatchObject({
            error: 'WORKSPACE_ACCESS_DENIED',
          });
        },
        {
          env: {
            AMR_HOME: join(suite.scratchDir, 'empty-amr-home'),
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli',
            VELA_API_URL: authorityUrl,
            VELA_CONTROL_KEY: 'e2e-personal-catalog-control-key',
            VELA_BIN: velaBin,
          },
        },
      );
    },
  );

  test(
    'does not resurrect a locally unshared project when the team catalog remains stale',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-stale-unshare-catalog');
      authorityWorkspace = 'team';
      const velaBin = await writeTeamProjectsVelaBin(join(suite.scratchDir, 'fake-vela-team-projects'));
      const headers = {
        'x-od-workspace-id': TEAM.workspaceId,
        'x-od-workspace-type': TEAM.workspaceType,
        'x-od-workspace-member-id': TEAM.workspaceMemberId,
        'x-od-workspace-role': TEAM.role,
        'x-od-workspace-lifecycle-state': TEAM.lifecycleState,
        'x-od-workspace-member-status': TEAM.memberStatus,
        'x-od-workspace-can-share-projects': 'true',
        'x-od-workspace-can-write-synced-files': 'true',
      };

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          await requestJson(webUrl, '/api/workspace/context', {
            method: 'PUT',
            body: {
              ...TEAM,
              billingState: 'active',
              planId: 'team_plus',
              providerMode: 'platform_credits',
              seatSummary: { seatLimit: 5, usedSeats: 2 },
            },
          });
          const created = await requestJson<{ project: { id: string } }>(
            webUrl,
            '/api/projects',
            {
              method: 'POST',
              headers,
              body: {
                id: 'stale-unshare-project',
                name: 'Stale unshare project',
                designSystemId: null,
                skillId: null,
                metadata: { kind: 'prototype' },
                pendingPrompt: null,
              },
            },
          );

          for (const visibility of ['team', 'personal'] as const) {
            const move = await fetch(
              new URL(
                `/api/workspaces/${TEAM.workspaceId}/projects/${created.project.id}/move`,
                webUrl,
              ),
              {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...headers },
                body: JSON.stringify({ visibility }),
              },
            );
            expect(move.status).toBe(200);
          }

          const scope = await requestJson<{
            scope: { workspaceId: string; visibility: string };
          }>(webUrl, `/api/projects/${created.project.id}/workspace-scope`, {
            headers,
          });
          expect(scope.scope).toMatchObject({
            workspaceId: TEAM.workspaceId,
            visibility: 'personal',
          });

          // The stale upstream catalog is unavailable after the local
          // unshare. Fail closed instead of merging its old shared row back
          // into the authoritative local Personal state.
          const list = await fetch(
            new URL(`/api/workspaces/${TEAM.workspaceId}/projects?view=all`, webUrl),
            { headers },
          );
          expect(list.status).toBe(502);
          expect(await list.json()).toMatchObject({
            error: { code: 'TEAM_PROJECT_CATALOG_UNAVAILABLE' },
          });
        },
        {
          env: {
            AMR_HOME: join(suite.scratchDir, 'empty-amr-home'),
            FAKE_STALE_TEAM_PROJECT: '1',
            OD_RESOURCE_TRANSPORT: 'stub',
            OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli',
            VELA_API_URL: authorityUrl,
            VELA_CONTROL_KEY: 'e2e-stale-unshare-control-key',
            VELA_BIN: velaBin,
          },
        },
      );
    },
  );

  test(
    'materializes a missing shared project on its first status read',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-first-open-materialization');
      authorityWorkspace = 'team';
      const velaBin = await writeTeamProjectsVelaBin(join(suite.scratchDir, 'fake-vela-first-open'));
      const headers = {
        'x-od-workspace-id': TEAM.workspaceId,
        'x-od-workspace-type': TEAM.workspaceType,
        'x-od-workspace-member-id': TEAM.workspaceMemberId,
        'x-od-workspace-role': TEAM.role,
        'x-od-workspace-lifecycle-state': TEAM.lifecycleState,
        'x-od-workspace-member-status': TEAM.memberStatus,
        'x-od-workspace-can-share-projects': 'true',
        'x-od-workspace-can-write-synced-files': 'false',
      };

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          const first = await requestJson<{
            awaitingFirstMaterialization?: boolean;
            ownerMemberId?: string | null;
          }>(
            webUrl,
            '/api/projects/first-open-shared-project/collab/status',
            { headers },
          );
          expect(first.ownerMemberId).toBe('mem-first-open-owner');
          expect(first.awaitingFirstMaterialization).toBe(true);

          let settled = false;
          for (let attempt = 0; attempt < 40; attempt += 1) {
            const status = await requestJson<{
              awaitingFirstMaterialization?: boolean;
              materializedVersion?: number | null;
            }>(
              webUrl,
              '/api/projects/first-open-shared-project/collab/status',
              { headers },
            );
            if (
              status.awaitingFirstMaterialization === false &&
              status.materializedVersion === 7
            ) {
              settled = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          expect(settled, 'the first-open pull should materialize without a second open').toBe(true);

          const files = await requestJson<{ files: Array<{ name: string }> }>(
            webUrl,
            '/api/projects/first-open-shared-project/files',
            { headers },
          );
          expect(files.files.some((file) => file.name === 'index.html')).toBe(true);
          const html = await requestText(
            webUrl,
            '/api/projects/first-open-shared-project/raw/index.html',
            { headers },
          );
          expect(html).toContain('data-e2e="first-materialized"');
        },
        {
          env: {
            AMR_HOME: join(suite.scratchDir, 'empty-amr-home'),
            FAKE_FIRST_OPEN_PROJECT: '1',
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            OD_RESOURCE_TRANSPORT: 'vela-cli',
            OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli',
            VELA_API_URL: authorityUrl,
            VELA_CONTROL_KEY: 'e2e-first-open-control-key',
            VELA_BIN: velaBin,
          },
        },
      );
    },
  );

  test(
    'retries a transient first-open pull failure and materializes on a later status tick',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-first-open-pull-retry');
      authorityWorkspace = 'team';
      const velaBin = await writeTeamProjectsVelaBin(join(suite.scratchDir, 'fake-vela-pull-retry'));
      const failOnceFile = join(suite.scratchDir, 'pull-failed-once');
      const headers = {
        'x-od-workspace-id': TEAM.workspaceId,
        'x-od-workspace-type': TEAM.workspaceType,
        'x-od-workspace-member-id': TEAM.workspaceMemberId,
        'x-od-workspace-role': TEAM.role,
        'x-od-workspace-lifecycle-state': TEAM.lifecycleState,
        'x-od-workspace-member-status': TEAM.memberStatus,
        'x-od-workspace-can-share-projects': 'true',
        'x-od-workspace-can-write-synced-files': 'false',
      };

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          const first = await requestJson<{ awaitingFirstMaterialization?: boolean }>(
            webUrl,
            '/api/projects/first-open-shared-project/collab/status',
            { headers },
          );
          expect(first.awaitingFirstMaterialization).toBe(true);

          let settled = false;
          for (let attempt = 0; attempt < 60; attempt += 1) {
            const status = await requestJson<{
              awaitingFirstMaterialization?: boolean;
              materializedVersion?: number | null;
            }>(
              webUrl,
              '/api/projects/first-open-shared-project/collab/status',
              { headers },
            );
            if (
              status.awaitingFirstMaterialization === false &&
              status.materializedVersion === 7
            ) {
              settled = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          await access(failOnceFile);
          expect(settled, 'a transient transport error must not strand the placeholder').toBe(true);
        },
        {
          env: {
            AMR_HOME: join(suite.scratchDir, 'empty-amr-home'),
            FAKE_FIRST_OPEN_PROJECT: '1',
            FAKE_PULL_FAIL_ONCE_FILE: failOnceFile,
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            OD_RESOURCE_TRANSPORT: 'vela-cli',
            OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli',
            VELA_API_URL: authorityUrl,
            VELA_CONTROL_KEY: 'e2e-first-open-retry-key',
            VELA_BIN: velaBin,
          },
        },
      );
    },
  );

  test(
    'writes an owner rename through to the team catalog without requiring another file publish',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-team-project-rename-catalog');
      authorityWorkspace = 'team';
      const velaBin = await writeTeamProjectsVelaBin(
        join(suite.scratchDir, 'fake-vela-rename-catalog'),
      );
      const mutationLog = join(suite.scratchDir, 'team-project-mutations.jsonl');
      const projectId = 'shared-project-rename-through';
      const headers = {
        'x-od-workspace-id': TEAM.workspaceId,
        'x-od-workspace-type': TEAM.workspaceType,
        'x-od-workspace-member-id': TEAM.workspaceMemberId,
        'x-od-workspace-role': TEAM.role,
        'x-od-workspace-lifecycle-state': TEAM.lifecycleState,
        'x-od-workspace-member-status': TEAM.memberStatus,
        'x-od-workspace-can-share-projects': 'true',
        'x-od-workspace-can-write-synced-files': 'true',
      };

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          await requestJson(webUrl, '/api/projects', {
            method: 'POST',
            headers,
            body: {
              id: projectId,
              name: 'Before catalog rename',
              designSystemId: null,
              skillId: null,
              metadata: { kind: 'prototype' },
              pendingPrompt: null,
            },
          });

          const share = await fetch(
            new URL(
              `/api/workspaces/${TEAM.workspaceId}/projects/${projectId}/move`,
              webUrl,
            ),
            {
              method: 'POST',
              headers: { 'content-type': 'application/json', ...headers },
              body: JSON.stringify({ visibility: 'team' }),
            },
          );
          const shareBody = await share.text();
          expect(share.status, shareBody).toBe(200);

          await expect.poll(async () => {
            const log = await readFile(mutationLog, 'utf8').catch(() => '');
            return log.includes('"upsert"');
          }).toBe(true);
          await writeFile(mutationLog, '', 'utf8');

          const rename = await fetch(new URL(`/api/projects/${projectId}`, webUrl), {
            method: 'PATCH',
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify({ name: 'Renamed without a file edit' }),
          });
          expect(rename.status).toBe(200);

          await expect.poll(async () => {
            const lines = (await readFile(mutationLog, 'utf8').catch(() => ''))
              .trim()
              .split('\n')
              .filter(Boolean)
              .map((line) => JSON.parse(line) as { args: string[] });
            return lines.some(({ args }) => {
              const displayNameIndex = args.indexOf('--display-name');
              return (
                args[0] === 'team-projects' &&
                args[1] === 'upsert' &&
                args[2] === projectId &&
                displayNameIndex >= 0 &&
                args[displayNameIndex + 1] === 'Renamed without a file edit'
              );
            });
          }).toBe(true);
        },
        {
          env: {
            AMR_HOME: join(suite.scratchDir, 'empty-amr-home'),
            FAKE_TEAM_PROJECT_MUTATION_LOG: mutationLog,
            OD_RESOURCE_TRANSPORT: 'stub',
            OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli',
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            VELA_API_URL: authorityUrl,
            VELA_CONTROL_KEY: 'e2e-rename-catalog-control-key',
            VELA_BIN: velaBin,
          },
        },
      );
    },
  );
});
