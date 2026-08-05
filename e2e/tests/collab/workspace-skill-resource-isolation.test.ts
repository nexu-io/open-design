// @vitest-environment node

// Workspace resources have a separate persistence and transport path from
// projects. This E2E keeps the skill path load-bearing across the real daemon:
// import binds the resource, scoped catalogs cannot leak it, foreign mutations
// are denied, and team share/unshare stays pinned to the owning workspace.

import { chmod, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { requestJson } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

type Workspace = {
  workspaceId: string;
  workspaceName: string;
  workspaceType: 'team';
  workspaceMemberId: string;
  role: 'owner' | 'member';
  memberStatus: 'active';
  lifecycleState: 'active';
  canManageSharedResources: boolean;
};

const TEAM_A: Workspace = {
  workspaceId: 'ws-skill-team-a',
  workspaceName: 'Skill Team A',
  workspaceType: 'team',
  workspaceMemberId: 'mem-skill-team-a',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  canManageSharedResources: true,
};

const TEAM_B: Workspace = {
  workspaceId: 'ws-skill-team-b',
  workspaceName: 'Skill Team B',
  workspaceType: 'team',
  workspaceMemberId: 'mem-skill-team-b',
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
  canManageSharedResources: false,
};

const TEAM_A_MEMBER: Workspace = {
  ...TEAM_A,
  workspaceMemberId: 'mem-skill-team-a-viewer',
  role: 'member',
  canManageSharedResources: false,
};

let authority: Server;
let authorityUrl: string;

beforeAll(async () => {
  authority = createServer((req, res) => {
    const controlKey = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    const current = controlKey === 'e2e-skill-resource-member-key'
      ? TEAM_A_MEMBER
      : TEAM_A;
    if (req.url === '/api/v1/workspaces/current' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ...current,
        billingState: 'active',
        planId: 'team_plus',
        providerMode: 'platform_credits',
        seatSummary: { seatLimit: 5, usedSeats: 2 },
      }));
      return;
    }
    if (req.url === '/api/v1/workspaces' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        items: current === TEAM_A_MEMBER ? [TEAM_A_MEMBER] : [TEAM_A, TEAM_B],
      }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise<void>((resolve) => authority.listen(0, '127.0.0.1', resolve));
  const address = authority.address();
  if (address == null || typeof address === 'string') {
    throw new Error('workspace authority mock has no port');
  }
  authorityUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => authority.close(() => resolve()));
});

function workspaceHeaders(workspace: Workspace): Record<string, string> {
  return {
    'x-od-workspace-id': workspace.workspaceId,
    'x-od-workspace-type': workspace.workspaceType,
    'x-od-workspace-member-id': workspace.workspaceMemberId,
    'x-od-workspace-role': workspace.role,
    'x-od-workspace-lifecycle-state': workspace.lifecycleState,
    'x-od-workspace-member-status': workspace.memberStatus,
    'x-od-workspace-can-share-projects': 'true',
    'x-od-workspace-can-write-synced-files': 'true',
    'x-od-workspace-can-manage-shared-resources':
      workspace.canManageSharedResources ? 'true' : 'false',
  };
}

async function writeResourceVelaBin(path: string): Promise<string> {
  await writeFile(
    path,
    `#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const stateFile = process.env.FAKE_RESOURCE_STATE_FILE;
const logFile = process.env.FAKE_RESOURCE_LOG_FILE;
const appendLog = () => {
  if (!logFile) return;
  const previous = existsSync(logFile) ? readFileSync(logFile, 'utf8') : '';
  writeFileSync(logFile, previous + JSON.stringify({
    args,
    workspaceId: process.env.VELA_WORKSPACE_ID ?? null,
  }) + '\\n');
};
if (args[0] === 'collab') process.exit(0);
if (args[0] === 'billing') {
  process.stdout.write(JSON.stringify({ billingState: 'active', balance: 0 }) + '\\n');
  process.exit(0);
}
if (args[0] !== 'resource') process.exit(1);
appendLog();
const subcommand = args[1];
if (subcommand === 'push') {
  const resourceId = args[3];
  const metadataIndex = args.indexOf('--metadata-json');
  const metadata = metadataIndex >= 0 ? JSON.parse(args[metadataIndex + 1]) : {};
  writeFileSync(stateFile, JSON.stringify({
    resources: [{
      id: resourceId,
      kind: args[2],
      deletedAt: null,
      ownerMemberId: 'mem-skill-team-a',
      metadata,
      publishedVersion: { id: 'skill-v1', version: 1 },
    }],
  }));
  process.stdout.write(JSON.stringify({ version: 1, versionId: 'skill-v1' }) + '\\n');
  process.exit(0);
}
if (subcommand === 'shared') {
  const state = stateFile && existsSync(stateFile)
    ? readFileSync(stateFile, 'utf8')
    : JSON.stringify({ resources: [] });
  process.stdout.write(state + '\\n');
  process.exit(0);
}
if (subcommand === 'remove') {
  writeFileSync(stateFile, JSON.stringify({ resources: [] }));
  process.stdout.write(JSON.stringify({ ok: true }) + '\\n');
  process.exit(0);
}
process.exit(1);
`,
    'utf8',
  );
  await chmod(path, 0o755);
  return path;
}

async function responseStatus(
  webUrl: string,
  path: string,
  init: RequestInit,
): Promise<number> {
  return (await fetch(new URL(path, webUrl), init)).status;
}

describe('workspace-scoped skill resources', () => {
  test(
    '[P0] import, mutation, team share, and unshare stay inside the owning workspace',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-workspace-skill-resource-isolation');
      const resourceStateFile = join(suite.scratchDir, 'resource-state.json');
      const resourceLogFile = join(suite.scratchDir, 'resource-calls.jsonl');
      const velaBin = await writeResourceVelaBin(join(suite.scratchDir, 'fake-vela-resource'));

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          const context = await requestJson<{ context: { workspaceId: string } | null }>(
            webUrl,
            '/api/workspace/context',
            { headers: workspaceHeaders(TEAM_A) },
          );
          expect(context.context?.workspaceId).toBe(TEAM_A.workspaceId);

          const imported = await requestJson<{ skill: { id: string; name: string } }>(
            webUrl,
            '/api/skills/import',
            {
              method: 'POST',
              headers: workspaceHeaders(TEAM_A),
              body: {
                name: 'Workspace Guard Skill',
                description: 'Must stay in its owning workspace',
                body: 'Keep workspace resources isolated.',
                triggers: ['workspace guard'],
              },
            },
          );
          const skillId = imported.skill.id;

          const listIds = async (headers?: Record<string, string>) => {
            const response = await requestJson<{ skills: Array<{ id: string }> }>(
              webUrl,
              '/api/skills',
              headers ? { headers } : undefined,
            );
            return response.skills.map((skill) => skill.id);
          };
          expect(await listIds(workspaceHeaders(TEAM_A))).toContain(skillId);
          expect(await listIds(workspaceHeaders(TEAM_B))).not.toContain(skillId);
          expect(await listIds()).not.toContain(skillId);

          expect(
            await responseStatus(webUrl, `/api/skills/${encodeURIComponent(skillId)}`, {
              method: 'PUT',
              headers: {
                'content-type': 'application/json',
                ...workspaceHeaders(TEAM_B),
              },
              body: JSON.stringify({
                name: 'Cross workspace overwrite',
                description: 'must fail',
                body: 'must fail',
                triggers: [],
              }),
            }),
          ).toBe(404);
          expect(
            await responseStatus(webUrl, `/api/skills/${encodeURIComponent(skillId)}`, {
              method: 'DELETE',
              headers: workspaceHeaders(TEAM_B),
            }),
          // Foreign Personal resources are deliberately undiscoverable. Both
          // read/update and delete must stop at scoped lookup with 404 rather
          // than disclose that another Workspace owns this id.
          ).toBe(404);

          const shared = await requestJson<{ shared: boolean; version?: number }>(
            webUrl,
            `/api/workspace/skills/${encodeURIComponent(skillId)}/share`,
            {
              method: 'POST',
              headers: workspaceHeaders(TEAM_A),
            },
          );
          expect(shared).toEqual({ shared: true, version: 1 });

          const teamList = await requestJson<{
            ids: string[];
            resources: Array<{ id: string; canUnshare?: boolean }>;
          }>(webUrl, '/api/workspace/skills/team', {
            headers: workspaceHeaders(TEAM_A),
          });
          expect(teamList.ids).toEqual([skillId]);
          expect(teamList.resources).toEqual([
            expect.objectContaining({ id: skillId, canUnshare: true }),
          ]);

          const unshared = await requestJson<{ unshared: boolean }>(
            webUrl,
            `/api/workspace/skills/${encodeURIComponent(skillId)}/share`,
            {
              method: 'DELETE',
              headers: workspaceHeaders(TEAM_A),
            },
          );
          expect(unshared.unshared).toBe(true);
          expect(
            await requestJson<{ ids: string[] }>(webUrl, '/api/workspace/skills/team', {
              headers: workspaceHeaders(TEAM_A),
            }),
          ).toEqual(expect.objectContaining({ ids: [] }));

          const calls = (await readFile(resourceLogFile, 'utf8'))
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line) as { args: string[]; workspaceId: string | null });
          const mutations = calls.filter(({ args }) =>
            args[1] === 'push' || args[1] === 'remove'
          );
          expect(mutations.map(({ workspaceId }) => workspaceId)).toEqual([
            TEAM_A.workspaceId,
            TEAM_A.workspaceId,
          ]);
          const hubSafeSkillId = skillId.replace(/[^a-zA-Z0-9_-]/g, '-');
          expect(mutations[0]?.args).toContain(
            `skill-${TEAM_A.workspaceId}-${hubSafeSkillId}`,
          );
        },
        {
          env: {
            AMR_HOME: join(suite.scratchDir, 'empty-amr-home'),
            FAKE_RESOURCE_LOG_FILE: resourceLogFile,
            FAKE_RESOURCE_STATE_FILE: resourceStateFile,
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            VELA_API_URL: authorityUrl,
            VELA_BIN: velaBin,
            VELA_CONTROL_KEY: 'e2e-skill-resource-control-key',
          },
        },
      );
    },
  );

  test(
    '[P0] a second daemon observes an owner skill share and a fresh daemon sees its retraction',
    { timeout: 300_000 },
    async () => {
      const ownerSuite = await createSmokeSuite('collab-skill-relay-owner');
      const memberSuite = await createSmokeSuite('collab-skill-relay-member');
      const reopenedMemberSuite = await createSmokeSuite('collab-skill-relay-member-reopened');
      const resourceStateFile = join(ownerSuite.scratchDir, 'shared-resource-state.json');
      const resourceLogFile = join(ownerSuite.scratchDir, 'shared-resource-calls.jsonl');
      const velaBin = await writeResourceVelaBin(
        join(ownerSuite.scratchDir, 'fake-vela-shared-resource'),
      );
      const commonEnv = {
        FAKE_RESOURCE_LOG_FILE: resourceLogFile,
        FAKE_RESOURCE_STATE_FILE: resourceStateFile,
        OD_RESOURCE_TRANSPORT: 'vela-cli',
        OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
        VELA_API_URL: authorityUrl,
        VELA_BIN: velaBin,
      };

      await ownerSuite.with.toolsDev(
        async ({ webUrl: ownerWebUrl }) => {
          const imported = await requestJson<{ skill: { id: string } }>(
            ownerWebUrl,
            '/api/skills/import',
            {
              method: 'POST',
              headers: workspaceHeaders(TEAM_A),
              body: {
                name: 'Cross-daemon shared skill',
                description: 'Visible to a second member daemon',
                body: 'Keep the shared resource relay authoritative.',
                triggers: ['cross daemon resource'],
              },
            },
          );
          const skillId = imported.skill.id;
          await requestJson(ownerWebUrl, `/api/workspace/skills/${encodeURIComponent(skillId)}/share`, {
            method: 'POST',
            headers: workspaceHeaders(TEAM_A),
          });

          await memberSuite.with.toolsDev(
            async ({ webUrl: memberWebUrl }) => {
              await expect.poll(async () => {
                const team = await requestJson<{ ids: string[] }>(
                  memberWebUrl,
                  '/api/workspace/skills/team',
                  { headers: workspaceHeaders(TEAM_A_MEMBER) },
                );
                return team.ids;
              }).toContain(skillId);
            },
            {
              env: {
                ...commonEnv,
                AMR_HOME: join(memberSuite.scratchDir, 'empty-amr-home'),
                VELA_CONTROL_KEY: 'e2e-skill-resource-member-key',
              },
            },
          );

          await requestJson(
            ownerWebUrl,
            `/api/workspace/skills/${encodeURIComponent(skillId)}/share`,
            {
              method: 'DELETE',
              headers: workspaceHeaders(TEAM_A),
            },
          );

          await reopenedMemberSuite.with.toolsDev(
            async ({ webUrl: memberWebUrl }) => {
              const team = await requestJson<{ ids: string[] }>(
                memberWebUrl,
                '/api/workspace/skills/team',
                { headers: workspaceHeaders(TEAM_A_MEMBER) },
              );
              expect(team.ids).not.toContain(skillId);
            },
            {
              env: {
                ...commonEnv,
                AMR_HOME: join(reopenedMemberSuite.scratchDir, 'empty-amr-home'),
                VELA_CONTROL_KEY: 'e2e-skill-resource-member-key',
              },
            },
          );
        },
        {
          env: {
            ...commonEnv,
            AMR_HOME: join(ownerSuite.scratchDir, 'empty-amr-home'),
            VELA_CONTROL_KEY: 'e2e-skill-resource-owner-key',
          },
        },
      );
    },
  );
});
