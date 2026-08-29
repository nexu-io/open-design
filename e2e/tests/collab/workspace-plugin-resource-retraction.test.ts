// @vitest-environment node

// P0: a Team plugin retraction must converge on an already-running member
// daemon through the real hub-event -> reconciliation -> registry gate chain.
// A fresh/restarted daemon is not enough: the regression fixed by #6335 lived
// in stale local materialization state and delayed positive hub reads.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import {
  startFakeCollabHub,
  type FakeCollabHub,
} from '@/playwright/fake-collab-hub';
import { requestJson } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

const WORKSPACE_ID = 'ws-plugin-retraction';
const PLUGIN_ID = 'workspace-retraction-plugin';

const OWNER = {
  controlKey: 'e2e-plugin-owner-key',
  memberId: 'mem-plugin-owner',
  name: 'Plugin Owner',
  role: 'owner' as const,
};

const MEMBER = {
  controlKey: 'e2e-plugin-member-key',
  memberId: 'mem-plugin-member',
  name: 'Plugin Member',
  role: 'member' as const,
};

let hub: FakeCollabHub | null = null;

afterEach(async () => {
  await hub?.close();
  hub = null;
});

function workspaceHeaders(identity: typeof OWNER | typeof MEMBER): Record<string, string> {
  return {
    'x-od-workspace-id': WORKSPACE_ID,
    'x-od-workspace-type': 'team',
    'x-od-workspace-member-id': identity.memberId,
    'x-od-workspace-role': identity.role,
    'x-od-workspace-member-status': 'active',
    'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-can-share-projects': identity.role === 'owner' ? 'true' : 'false',
    'x-od-workspace-can-write-synced-files': identity.role === 'owner' ? 'true' : 'false',
    'x-od-workspace-can-manage-shared-resources': identity.role === 'owner' ? 'true' : 'false',
  };
}

async function installPlugin(
  webUrl: string,
  source: string,
  identity: typeof OWNER | typeof MEMBER,
): Promise<void> {
  const response = await fetch(new URL('/api/plugins/install', webUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...workspaceHeaders(identity),
    },
    body: JSON.stringify({ source }),
  });
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('event: success');
}

async function applyStatus(
  webUrl: string,
  identity: typeof OWNER | typeof MEMBER,
): Promise<number> {
  return (await fetch(new URL(`/api/plugins/${PLUGIN_ID}/apply`, webUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...workspaceHeaders(identity),
    },
    body: JSON.stringify({ inputs: { topic: 'workspace authority' } }),
  })).status;
}

describe('workspace Team plugin retraction', () => {
  test(
    '[P0] an already-running member daemon stops listing and applying a retracted Team plugin',
    { timeout: 300_000 },
    async () => {
      const ownerSuite = await createSmokeSuite('collab-plugin-retraction-owner');
      const memberSuite = await createSmokeSuite('collab-plugin-retraction-member');
      const pluginSource = join(ownerSuite.scratchDir, 'workspace-retraction-plugin-source');
      await mkdir(pluginSource, { recursive: true });
      await writeFile(
        join(pluginSource, 'open-design.json'),
        JSON.stringify({
          name: PLUGIN_ID,
          version: '1.0.0',
          title: 'Workspace Retraction Plugin',
          description: 'Pins live Team resource retraction.',
          od: {
            kind: 'skill',
            taskKind: 'new-generation',
            useCase: { query: 'Build a {{topic}} brief.' },
            inputs: [{ name: 'topic', type: 'string', required: true }],
          },
        }, null, 2),
        'utf8',
      );

      hub = await startFakeCollabHub({
        root: join(ownerSuite.scratchDir, 'plugin-hub'),
        workspaceId: WORKSPACE_ID,
        workspaceName: 'Plugin Retraction Team',
        clients: [OWNER, MEMBER],
      });
      const velaBin = await hub.writeVelaBin(join(ownerSuite.scratchDir, 'fake-vela-plugin'));
      const commonEnv = {
        OD_COLLAB_TRANSPORT: 'vela-cli',
        OD_RESOURCE_TRANSPORT: 'vela-cli',
        OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
        VELA_API_URL: hub.url,
        VELA_BIN: velaBin,
      };

      await ownerSuite.with.toolsDev(
        async ({ webUrl: ownerWebUrl }) => {
          await requestJson(ownerWebUrl, '/api/workspace/active', {
            method: 'PUT',
            body: { workspaceId: WORKSPACE_ID, workspaceMemberId: OWNER.memberId },
          });
          await installPlugin(ownerWebUrl, pluginSource, OWNER);
          expect(await applyStatus(ownerWebUrl, OWNER)).toBe(200);

          await requestJson(
            ownerWebUrl,
            `/api/workspace/plugins/${encodeURIComponent(PLUGIN_ID)}/share`,
            { method: 'POST', headers: workspaceHeaders(OWNER) },
          );

          await memberSuite.with.toolsDev(
            async ({ webUrl: memberWebUrl }) => {
              await requestJson(memberWebUrl, '/api/workspace/active', {
                method: 'PUT',
                body: { workspaceId: WORKSPACE_ID, workspaceMemberId: MEMBER.memberId },
              });
              // Hub streams are leased by explicit workspace billing
              // interests. Establish the same lease the open shell owns before
              // asserting push-driven resource convergence.
              await requestJson(
                memberWebUrl,
                `/api/workspace/billing?scope=workspace&workspaceId=${WORKSPACE_ID}`,
                { headers: workspaceHeaders(MEMBER) },
              );
              await expect.poll(() => hub?.eventSubscriberCount(MEMBER.memberId) ?? 0, {
                timeout: 20_000,
              }).toBeGreaterThan(0);

              await expect.poll(async () => {
                const team = await requestJson<{ ids: string[] }>(
                  memberWebUrl,
                  '/api/workspace/plugins/team',
                  { headers: workspaceHeaders(MEMBER) },
                );
                return team.ids;
              }, { timeout: 30_000 }).toContain(PLUGIN_ID);
              await expect.poll(() => applyStatus(memberWebUrl, MEMBER), {
                timeout: 30_000,
              }).toBe(200);

              await requestJson(
                ownerWebUrl,
                `/api/workspace/plugins/${encodeURIComponent(PLUGIN_ID)}/share`,
                { method: 'DELETE', headers: workspaceHeaders(OWNER) },
              );
              await hub?.waitForEvent(
                (event) =>
                  event.type === 'team-resources-changed'
                  && event.resourceKind === 'plugin'
                  && event.resourceStatus === 'retracted',
              );

              // No focus event, daemon restart, or explicit Team-list refresh
              // precedes this assertion. The hub signal itself must retire the
              // binding before the next apply can use stale local bytes.
              await expect.poll(() => applyStatus(memberWebUrl, MEMBER), {
                timeout: 30_000,
              }).toBe(404);
              const teamAfterRetraction = await requestJson<{ ids: string[] }>(
                memberWebUrl,
                '/api/workspace/plugins/team',
                { headers: workspaceHeaders(MEMBER) },
              );
              expect(teamAfterRetraction.ids).not.toContain(PLUGIN_ID);

              // Retraction removes the Team projection, not the owner's
              // independent Personal resource with the same manifest id.
              expect(await applyStatus(ownerWebUrl, OWNER)).toBe(200);
            },
            {
              env: {
                ...commonEnv,
                AMR_HOME: join(memberSuite.scratchDir, 'empty-amr-home'),
                VELA_CONTROL_KEY: MEMBER.controlKey,
              },
            },
          );
        },
        {
          env: {
            ...commonEnv,
            AMR_HOME: join(ownerSuite.scratchDir, 'empty-amr-home'),
            VELA_CONTROL_KEY: OWNER.controlKey,
          },
        },
      );
    },
  );
});
