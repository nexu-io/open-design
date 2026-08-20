import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { createCollabRuntime, type CollabRuntime } from '../src/collab/runtime.js';
import {
  createSqlitePublicFilePublicationStore,
  type PublicFilePublicationStore,
} from '../src/collab/public-file-publication-store.js';
import { closeDatabase, openDatabase } from '../src/db.js';

const vela = vi.hoisted(() => ({
  runResourceCommand: vi.fn(),
}));
const originalResourceHubUrl = process.env.OD_RESOURCE_HUB_URL;

vi.mock('../src/collab/vela-cli-resource-adapter.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../src/collab/vela-cli-resource-adapter.js')
  >();
  return {
    ...actual,
    runVelaResourceCommand: vela.runResourceCommand,
  };
});

vi.mock('../src/integrations/vela.js', () => ({
  readVelaControlApiContext: () => null,
}));

const context: WorkspaceCollabContext = {
  workspaceId: 'workspace-1',
  workspaceType: 'team',
  teamId: 'team-1',
  workspaceMemberId: 'member-1',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'active',
  planId: null,
  providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({
    role: 'owner',
    lifecycleState: 'active',
  }),
};

let server: http.Server | null = null;
let runtime: CollabRuntime | null = null;
const tempDirs: string[] = [];

afterEach(async () => {
  if (originalResourceHubUrl === undefined) delete process.env.OD_RESOURCE_HUB_URL;
  else process.env.OD_RESOURCE_HUB_URL = originalResourceHubUrl;
  vela.runResourceCommand.mockReset();
  closeDatabase();
  runtime?.dispose();
  runtime = null;
  if (server) {
    const current = server;
    server = null;
    await new Promise<void>((resolve) => current.close(() => resolve()));
  }
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
  vi.resetModules();
});

async function startDaemon(
  projectDir: string,
  publicationStore: PublicFilePublicationStore,
) {
  const { registerCollabSyncRoutes } = await import('../src/routes/collab-sync.js');
  const app = express();
  app.use(express.json());
  runtime = createCollabRuntime({
    workspaceContext: { current: async () => context },
  });
  registerCollabSyncRoutes(app, {
    collab: runtime,
    verifyWorkspaceRequest: async (req) =>
      req.get('x-od-workspace-id') === context.workspaceId
      && req.get('x-od-workspace-member-id') === context.workspaceMemberId
        ? context
        : null,
    resolveSharedProject: async () => null,
    resolveProjectDir: () => projectDir,
    publicFilePublicationStore: publicationStore,
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    async request(method: string) {
      const response = await fetch(
        `${baseUrl}/api/projects/project-1/files/index.html/publish-public`,
        {
          method,
          headers: {
            'content-type': 'application/json',
            'x-od-workspace-id': context.workspaceId,
            'x-od-workspace-member-id': context.workspaceMemberId,
          },
          ...(method === 'DELETE'
            ? { body: JSON.stringify({ slug: 'restart-safe-slug' }) }
            : {}),
        },
      );
      return {
        status: response.status,
        body: await response.json() as Record<string, unknown>,
      };
    },
    async stop() {
      runtime?.dispose();
      runtime = null;
      const current = server;
      server = null;
      if (current) {
        await new Promise<void>((resolve) => current.close(() => resolve()));
      }
    },
  };
}

describe('public file publication restart lifecycle', () => {
  it('redacts a new snapshot when publication persistence fails', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'od-public-persist-fail-'));
    tempDirs.push(projectDir);
    await writeFile(path.join(projectDir, 'index.html'), '<h1>Public</h1>');
    process.env.OD_RESOURCE_HUB_URL = 'https://hub.example.test';
    vela.runResourceCommand.mockImplementation(async (args: string[]) =>
      args[0] === 'snapshot'
        ? JSON.stringify({
            slug: 'unpersisted-slug',
            name: 'index.html',
            kind: 'project',
            versionId: 'version-1',
            createdAt: new Date(1).toISOString(),
          })
        : JSON.stringify({ version: 1 }),
    );
    const publicationStore: PublicFilePublicationStore = {
      get: () => null,
      set: () => {
        throw new Error('sqlite disk full');
      },
      delete: () => {},
    };
    const daemon = await startDaemon(projectDir, publicationStore);

    const publish = await daemon.request('POST');

    expect(publish).toEqual({
      status: 502,
      body: { error: 'PUBLIC_FILE_PUBLISH_UNAVAILABLE' },
    });
    expect(vela.runResourceCommand.mock.calls.map(([args]) => args[0])).toEqual([
      'push',
      'snapshot',
      'snapshot-redact',
    ]);
    expect(vela.runResourceCommand).toHaveBeenLastCalledWith(
      [
        'snapshot-redact',
        expect.stringMatching(/^project-file-/u),
        'unpersisted-slug',
        '--json',
      ],
      'team-1',
    );
  });

  it('returns the public URL and recovery command when compensation fails', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'od-public-recovery-'));
    tempDirs.push(projectDir);
    await writeFile(path.join(projectDir, 'index.html'), '<h1>Public</h1>');
    process.env.OD_RESOURCE_HUB_URL = 'https://hub.example.test';
    vela.runResourceCommand.mockImplementation(async (args: string[]) => {
      if (args[0] === 'snapshot') {
        return JSON.stringify({
          slug: 'manual-revoke-slug',
          name: 'index.html',
          kind: 'project',
          versionId: 'version-1',
          createdAt: new Date(1).toISOString(),
        });
      }
      if (args[0] === 'snapshot-redact') {
        throw new Error('resource hub unavailable');
      }
      return JSON.stringify({ version: 1 });
    });
    const publicationStore: PublicFilePublicationStore = {
      get: () => null,
      set: () => {
        throw new Error('sqlite disk full');
      },
      delete: () => {},
    };
    const daemon = await startDaemon(projectDir, publicationStore);

    const publish = await daemon.request('POST');

    expect(publish.status).toBe(502);
    expect(publish.body).toMatchObject({
      error: {
        code: 'PUBLIC_FILE_MANUAL_REVOKE_REQUIRED',
        data: {
          url: 'https://hub.example.test/api/v1/public/snapshots/manual-revoke-slug/files/index.html',
          slug: 'manual-revoke-slug',
          fileName: 'index.html',
        },
      },
    });
    expect((publish.body.error as { message: string }).message).toContain(
      'od project revoke-public-link',
    );
    expect((publish.body.error as { message: string }).message).toContain(
      'https://hub.example.test/api/v1/public/snapshots/manual-revoke-slug/files/index.html',
    );
  });

  it('restores and revokes a published link after the daemon restarts', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'od-public-restart-'));
    tempDirs.push(projectDir);
    await writeFile(path.join(projectDir, 'index.html'), '<h1>Public</h1>');
    process.env.OD_RESOURCE_HUB_URL = 'https://hub.example.test';
    vela.runResourceCommand.mockImplementation(async (args: string[]) =>
      args[0] === 'snapshot'
        ? JSON.stringify({
            slug: 'restart-safe-slug',
            name: 'index.html',
            kind: 'project',
            versionId: 'version-1',
            createdAt: new Date(1).toISOString(),
          })
        : JSON.stringify({ version: 1 }),
    );
    let publicationStore = createSqlitePublicFilePublicationStore(
      openDatabase(projectDir, { dataDir: projectDir }),
    );
    const firstDaemon = await startDaemon(projectDir, publicationStore);

    const publish = await firstDaemon.request('POST');
    expect(publish.status).toBe(200);
    await firstDaemon.stop();
    closeDatabase();

    // A fresh module instance and reopened SQLite file represent a daemon
    // process restart, not merely a second route registration.
    vi.resetModules();
    publicationStore = createSqlitePublicFilePublicationStore(
      openDatabase(projectDir, { dataDir: projectDir }),
    );
    const restartedDaemon = await startDaemon(projectDir, publicationStore);
    const restored = await restartedDaemon.request('GET');
    const revoked = await restartedDaemon.request('DELETE');
    const afterRevoke = await restartedDaemon.request('GET');

    expect(restored.body.publication).toEqual({
      url: 'https://hub.example.test/api/v1/public/snapshots/restart-safe-slug/files/index.html',
      slug: 'restart-safe-slug',
      fileName: 'index.html',
    });
    expect(revoked.status).toBe(200);
    expect(afterRevoke.body.publication).toBeNull();
    expect(vela.runResourceCommand).toHaveBeenCalledWith(
      [
        'snapshot-redact',
        expect.stringMatching(/^project-file-/u),
        'restart-safe-slug',
        '--json',
      ],
      'team-1',
    );
  });
});
