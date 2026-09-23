import express from 'express';
import type http from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { registerPluginAssetRoutes } from '../src/routes/plugins/assets.js';

const servers: http.Server[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function context(
  workspaceId: string,
  workspaceMemberId: string,
): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceName: workspaceId,
    workspaceType: 'team',
    workspaceMemberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: {
      seatLimit: 5,
      usedSeats: 1,
      availableSeats: 4,
      isSeatFull: false,
    },
    permissions: {
      canManageMembers: false,
      canManageBilling: false,
      canInviteMembers: false,
      canManageAutoRecharge: false,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: false,
    },
  } as WorkspaceCollabContext;
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-plugin-asset-scope-'));
  roots.push(root);
  const plugins = new Map<string, {
    fsPath: string;
    title: string;
    manifest: { od: { preview: { entry: string } } };
  }>();
  for (const workspaceId of ['workspace-a', 'workspace-b']) {
    const dir = path.join(root, workspaceId);
    await mkdir(path.join(dir, 'assets'), { recursive: true });
    await writeFile(
      path.join(dir, 'preview.html'),
      `<img src="./assets/secret.txt"><p>${workspaceId}</p>`,
    );
    await writeFile(path.join(dir, 'assets', 'secret.txt'), `${workspaceId}-bytes`);
    plugins.set(workspaceId, {
      fsPath: dir,
      title: `Same plugin ${workspaceId}`,
      manifest: { od: { preview: { entry: 'preview.html' } } },
    });
  }

  const app = express();
  registerPluginAssetRoutes(app, {
    db: {} as never,
    verifyWorkspaceRequestAuthority: async (req: any) => {
      const workspaceId = req.get('x-od-workspace-id')?.trim();
      const workspaceMemberId = req.get('x-od-workspace-member-id')?.trim();
      if (workspaceId === 'workspace-removed') {
        return {
          ok: false,
          status: 403,
          code: 'WORKSPACE_ACCESS_DENIED',
          message: 'removed',
        };
      }
      if (workspaceId === 'workspace-outage') {
        return {
          ok: false,
          status: 503,
          code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
          message: 'outage',
          retryable: true,
        };
      }
      return {
        ok: true,
        context: context(workspaceId, workspaceMemberId),
      };
    },
    getWorkspacePlugin: async (_db, id, workspaceId) =>
      id === 'same-plugin' && workspaceId ? plugins.get(workspaceId) ?? null : null,
    pluginAssetCache: {
      get: async () => {
        throw new Error('unused');
      },
    },
    AssetCacheError: class extends Error {
      status = 502;
      constructor(...args: unknown[]) {
        super(String(args[0] ?? 'asset cache error'));
      }
    },
    assetCacheRewriteUrl: (url) => url,
    isCacheableExternalUrl: () => false,
    assembleExample: (template, slides) =>
      template.replace('<!-- SLIDES_HERE -->', slides),
  });
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}

describe('Plugin preview and asset Workspace authority', () => {
  it('serves A and B copies of the same id and carries exact scope into nested assets', async () => {
    const baseUrl = await fixture();
    const preview = await fetch(
      `${baseUrl}/api/plugins/same-plugin/preview?workspaceId=workspace-a&workspaceMemberId=member-a`,
    );

    expect(preview.status).toBe(200);
    const html = await preview.text();
    expect(html).toContain('workspace-a');
    expect(html).not.toContain('workspace-b');
    expect(html).toContain(
      '/api/plugins/same-plugin/asset/assets/secret.txt?workspaceId=workspace-a&workspaceMemberId=member-a',
    );

    const [assetA, assetB] = await Promise.all([
      fetch(
        `${baseUrl}/api/plugins/same-plugin/asset/assets/secret.txt?workspaceId=workspace-a&workspaceMemberId=member-a`,
      ),
      fetch(
        `${baseUrl}/api/plugins/same-plugin/asset/assets/secret.txt?workspaceId=workspace-b&workspaceMemberId=member-b`,
      ),
    ]);
    expect(await assetA.text()).toBe('workspace-a-bytes');
    expect(await assetB.text()).toBe('workspace-b-bytes');
  });

  it.each(['workspace-removed', 'workspace-outage'] as const)(
    'does not consult remote authority for %s and never serves another Workspace bytes',
    async (workspaceId) => {
      const baseUrl = await fixture();
      const response = await fetch(
        `${baseUrl}/api/plugins/same-plugin/asset/assets/secret.txt?workspaceId=${workspaceId}&workspaceMemberId=member-a`,
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: 'plugin not found' });
    },
  );

  it('rejects a partial navigation scope before resolving plugin bytes', async () => {
    const baseUrl = await fixture();
    const response = await fetch(
      `${baseUrl}/api/plugins/same-plugin/asset/assets/secret.txt?workspaceId=workspace-a`,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'WORKSPACE_CONTEXT_INCOMPLETE',
    });
  });

  it('rejects conflicting header and navigation scopes', async () => {
    const baseUrl = await fixture();
    const response = await fetch(
      `${baseUrl}/api/plugins/same-plugin/asset/assets/secret.txt?workspaceId=workspace-b&workspaceMemberId=member-b`,
      {
        headers: {
          'x-od-workspace-id': 'workspace-a',
          'x-od-workspace-member-id': 'member-a',
        },
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'WORKSPACE_CONTEXT_CONFLICT',
    });
  });
});
