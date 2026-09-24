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
import { createShareContentFingerprints, type ShareContentFingerprints } from '../src/collab/share-content-fingerprint.js';
import { buildDeployFilePlan } from '../src/deploy.js';
import { createPublicSharePublishingFixture, fixtureShareSlug, type FixtureShareCloud } from './public-share-publishing-fixture.js';

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
const cloud: FixtureShareCloud = new Map();
const cloudCommands: string[][] = [];

afterEach(async () => {
  if (originalResourceHubUrl === undefined) delete process.env.OD_RESOURCE_HUB_URL;
  else process.env.OD_RESOURCE_HUB_URL = originalResourceHubUrl;
  vela.runResourceCommand.mockReset();
  cloud.clear(); cloudCommands.length = 0;
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
  shareContentFingerprints?: ShareContentFingerprints,
  failStop = false,
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
    resolveSharedProject: async projectId => ({ projectId, ownerMemberId: context.workspaceMemberId, sharedAt: new Date(1).toISOString() }),
    resolveProjectDir: () => projectDir,
    publicFilePublicationStore: publicationStore,
    ...createPublicSharePublishingFixture(openDatabase(projectDir, { dataDir: projectDir }), publicationStore, vela.runResourceCommand, undefined, { cloud, commands: cloudCommands, failStop }),
    ...(shareContentFingerprints ? { shareContentFingerprints } : {}),
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    async request(method: string, extraHeaders: Record<string, string> = {}) {
      const response = await fetch(
        `${baseUrl}/api/projects/project-1/files/index.html/publish-public`,
        {
          method,
          headers: {
            'content-type': 'application/json',
            'x-od-workspace-id': context.workspaceId,
            'x-od-workspace-member-id': context.workspaceMemberId,
            ...extraHeaders,
          },
          ...(method === 'DELETE'
            ? { body: JSON.stringify({ slug: fixtureShareSlug }) }
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
  it('persists the actual uploaded payload across restart rather than rereading edited source after upload', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'od-fingerprint-http-'));
    tempDirs.push(projectDir);
    await writeFile(path.join(projectDir, 'index.html'), '<link rel="stylesheet" href="style.css"><h1>Public</h1>');
    await writeFile(path.join(projectDir, 'style.css'), 'body{color:red}');
    const plan = () => buildDeployFilePlan(path.dirname(projectDir), path.basename(projectDir), 'index.html', { hookScriptUrl: '', assetUrlPolicy: 'share-relative' });
    const uploaded = (await plan()).files;
    process.env.OD_RESOURCE_HUB_URL = 'https://hub.example.test';
    vela.runResourceCommand.mockImplementation(async (args: string[]) => {
      if (args[0] === 'push') {
        await writeFile(path.join(projectDir, 'style.css'), 'body{color:blue}');
        return JSON.stringify({ id: 'version-1', version: 1 });
      }
      if (args[0] === 'snapshot') return JSON.stringify({ slug: fixtureShareSlug, name: 'index.html', kind: 'project', versionId: 'version-1', createdAt: new Date(1).toISOString() });
      throw new Error('unexpected cloud operation');
    });
    let db = openDatabase(projectDir, { dataDir: projectDir });
    let publications = createSqlitePublicFilePublicationStore(db);
    let fingerprints = createShareContentFingerprints(db, publications);
    const first = await startDaemon(projectDir, publications, fingerprints);
    expect((await first.request('POST')).status).toBe(200);
    await first.stop(); closeDatabase(); vi.resetModules();
    db = openDatabase(projectDir, { dataDir: projectDir });
    publications = createSqlitePublicFilePublicationStore(db);
    fingerprints = createShareContentFingerprints(db, publications);
    const scope = { resourceTeamId: 'team-1', ownerMemberId: 'member-1', projectId: 'project-1', filePath: 'index.html' };
    expect(fingerprints.compare(scope, uploaded)).toBe('current');
    expect(fingerprints.compare(scope, (await plan()).files)).toBe('outdated');
    expect(fingerprints.compare({ ...scope, ownerMemberId: 'other' }, uploaded)).toBe('unknown');
    await writeFile(path.join(projectDir, 'style.css'), 'body{color:red}');
    expect(fingerprints.compare(scope, (await plan()).files)).toBe('current');
    expect(publications.get(scope)?.slug).toBe(fixtureShareSlug);
    expect(vela.runResourceCommand.mock.calls.map(([args]) => args[0])).toEqual(['push']);
    expect(cloudCommands.map(args => args.slice(0, 2))).toEqual([['resource', 'push'], ['share', 'publish']]);
  });

  it('stops a new alias when publication persistence fails', async () => {
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
        : JSON.stringify({ id: 'version-1', version: 1 }),
    );
    const publicationStore: PublicFilePublicationStore = {
      get: () => null,
      getRevision: () => null,
      deleteIfRevisionMatches: () => false,
      set: () => {
        throw new Error('sqlite disk full');
      },
      delete: () => {},
    };
    const daemon = await startDaemon(projectDir, publicationStore);

    const publish = await daemon.request('POST');

    expect(publish).toEqual({
      status: 502,
      body: {
        error: 'PUBLIC_FILE_PUBLISH_UNAVAILABLE',
        failure: { stage: 'persist', reason: 'internal' },
      },
    });
    expect(vela.runResourceCommand.mock.calls.map(([args]) => args[0])).toEqual(['push']);
    expect(cloudCommands.map(args => args.slice(0, 2))).toEqual([['resource', 'push'], ['share', 'publish'], ['share', 'stop']]);
    expect(cloudCommands.at(-1)).toEqual(['share', 'stop', fixtureShareSlug, '--project-id', 'project-1', '--json']);
  });

  it('never compensates by stopping an existing cloud alias when its local witness is missing', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'od-existing-publication-'));
    tempDirs.push(projectDir);
    await writeFile(path.join(projectDir, 'index.html'), '<h1>Updated</h1>');
    cloud.set('project-1:index.html', { projectId: 'project-1', sourceFilePath: 'index.html', slug: fixtureShareSlug, status: 'active' });
    vela.runResourceCommand.mockResolvedValue(JSON.stringify({ id: 'version-2', version: 2 }));
    const store: PublicFilePublicationStore = {
      get: () => null, getRevision: () => null, deleteIfRevisionMatches: () => false,
      set: () => { throw new Error('disk full'); }, delete: () => {},
    };
    const daemon = await startDaemon(projectDir, store);
    const response = await daemon.request('POST');
    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ error: { code: 'PUBLIC_FILE_MANUAL_REVOKE_REQUIRED' } });
    expect(cloudCommands.map(args => args.slice(0, 2))).toEqual([['resource', 'push'], ['share', 'publish']]);
    expect(cloud.get('project-1:index.html')?.status).toBe('active');
  });

  it('returns the public URL and recovery command when compensation fails', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'od-public-recovery-'));
    tempDirs.push(projectDir);
    await writeFile(path.join(projectDir, 'index.html'), '<h1>Public</h1>');
    process.env.OD_RESOURCE_HUB_URL = 'https://hub.example.test';
    vela.runResourceCommand.mockImplementation(async (args: string[]) => {
      if (args[0] === 'snapshot') {
        return JSON.stringify({
          slug: fixtureShareSlug,
          name: 'index.html',
          kind: 'project',
          versionId: 'version-1',
          createdAt: new Date(1).toISOString(),
        });
      }
      if (args[0] === 'snapshot-redact') {
        throw new Error('resource hub unavailable');
      }
      return JSON.stringify({ id: 'version-1', version: 1 });
    });
    const publicationStore: PublicFilePublicationStore = {
      get: () => null,
      getRevision: () => null,
      deleteIfRevisionMatches: () => false,
      set: () => {
        throw new Error('sqlite disk full');
      },
      delete: () => {},
    };
    const daemon = await startDaemon(projectDir, publicationStore, undefined, true);

    const publish = await daemon.request('POST');

    expect(publish.status).toBe(502);
    expect(publish.body).toMatchObject({
      error: {
        code: 'PUBLIC_FILE_MANUAL_REVOKE_REQUIRED',
        data: {
          url: `https://viewer.example.test/cloud/artifact/project-1/${fixtureShareSlug}`,
          slug: fixtureShareSlug,
          fileName: 'index.html',
        },
      },
    });
    expect((publish.body.error as { message: string }).message).toContain(
      'od project share stop',
    );
    expect((publish.body.error as { message: string }).message).toContain(
      `https://viewer.example.test/cloud/artifact/project-1/${fixtureShareSlug}`,
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
            slug: fixtureShareSlug,
            name: 'index.html',
            kind: 'project',
            versionId: 'version-1',
            createdAt: new Date(1).toISOString(),
          })
        : JSON.stringify({ id: 'version-1', version: 1 }),
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
      url: `https://viewer.example.test/cloud/artifact/project-1/${fixtureShareSlug}`,
      slug: fixtureShareSlug,
      fileName: 'index.html',
    });
    expect(revoked.status).toBe(200);
    expect(afterRevoke.body.publication).toBeNull();
    expect(cloudCommands).toContainEqual(['share', 'stop', fixtureShareSlug, '--project-id', 'project-1', '--json']);
    expect(afterRevoke.body.status).toBe('stopped');
  });

  it('keeps the local publication when remote stop fails', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'od-public-stop-fail-'));
    tempDirs.push(projectDir);
    await writeFile(path.join(projectDir, 'index.html'), '<h1>Public</h1>');
    process.env.OD_RESOURCE_HUB_URL = 'https://hub.example.test';
    vela.runResourceCommand.mockImplementation(async (args: string[]) => {
      if (args[0] === 'snapshot') return JSON.stringify({
        slug: 'stop-failure-slug', name: 'index.html', kind: 'project',
        versionId: 'version-1', createdAt: new Date(1).toISOString(),
      });
      if (args[0] === 'snapshot-redact') throw new Error('remote stop unavailable');
      return JSON.stringify({ id: 'version-1', version: 1 });
    });
    const publicationStore = createSqlitePublicFilePublicationStore(
      openDatabase(projectDir, { dataDir: projectDir }),
    );
    const daemon = await startDaemon(projectDir, publicationStore, undefined, true);

    expect((await daemon.request('POST')).status).toBe(200);
    expect((await daemon.request('DELETE')).status).toBe(502);
    expect(publicationStore.get({
      resourceTeamId: 'team-1', ownerMemberId: 'member-1',
      projectId: 'project-1', filePath: 'index.html',
    })?.slug).toBe(fixtureShareSlug);
  });
});

// The failure detail is purely additive: `error` and the HTTP status stay what
// they always were, and the added `failure` object plus the structured log line
// carry only closed tokens (never Vela's stderr text).
describe('public file publication failure detail', () => {
  function velaRejection(stderr: string): Error {
    return Object.assign(new Error('Command failed: vela resource push'), { code: 1, stderr });
  }

  async function publishableProject() {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'od-public-failure-'));
    tempDirs.push(projectDir);
    await writeFile(path.join(projectDir, 'index.html'), '<h1>Public</h1>');
    process.env.OD_RESOURCE_HUB_URL = 'https://hub.example.test';
    return projectDir;
  }

  const memoryStore = (): PublicFilePublicationStore => ({
    get: () => null,
    getRevision: () => null,
    deleteIfRevisionMatches: () => false,
    set: () => {},
    delete: () => {},
  });

  it('classifies a Vela API rejection during push and logs it with the client request id', async () => {
    const projectDir = await publishableProject();
    vela.runResourceCommand.mockRejectedValue(velaRejection(
      'Error: API request failed with status 503: resource_hub_unavailable\n',
    ));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const daemon = await startDaemon(projectDir, memoryStore());

      const publish = await daemon.request('POST', { 'x-od-request-id': 'req-publish-0001' });

      expect(publish).toEqual({
        status: 502,
        body: {
          error: 'PUBLIC_FILE_PUBLISH_UNAVAILABLE',
          failure: {
            stage: 'push',
            reason: 'upstream_http',
            upstreamStatus: 503,
            upstreamCode: 'resource_hub_unavailable',
          },
        },
      });
      const line = warn.mock.calls.find(([label]) => label === '[od] public file publication failure');
      expect(line).toBeDefined();
      const logged = JSON.parse(String(line![1])) as Record<string, unknown>;
      expect(logged).toMatchObject({
        action: 'publish',
        errorCode: 'PUBLIC_FILE_PUBLISH_UNAVAILABLE',
        stage: 'push',
        reason: 'upstream_http',
        upstreamStatus: 503,
        upstreamCode: 'resource_hub_unavailable',
        requestId: 'req-publish-0001',
      });
      expect(typeof logged.durationMs).toBe('number');
      expect(String(line![1])).not.toContain('API request failed');
    } finally {
      warn.mockRestore();
    }
  });

  // Unpublish is `vela share stop` on this flow; its failure keeps the
  // existing `redact` stage token (the unpublish step) rather than a new one.
  it('classifies an unpublish failure and ignores a malformed request id', async () => {
    const projectDir = await publishableProject();
    vela.runResourceCommand.mockResolvedValue(JSON.stringify({ id: 'version-1', version: 1 }));
    const publicationStore = createSqlitePublicFilePublicationStore(
      openDatabase(projectDir, { dataDir: projectDir }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const daemon = await startDaemon(projectDir, publicationStore, undefined, true);
      expect((await daemon.request('POST')).status).toBe(200);

      const unpublish = await daemon.request('DELETE', { 'x-od-request-id': 'has spaces / path' });

      expect(unpublish).toEqual({
        status: 502,
        body: {
          error: 'PUBLIC_FILE_UNPUBLISH_UNAVAILABLE',
          failure: { stage: 'redact', reason: 'unknown' },
        },
      });
      const line = warn.mock.calls.find(([label]) => label === '[od] public file publication failure');
      expect(JSON.parse(String(line![1]))).not.toHaveProperty('requestId');
      expect(String(line![1])).not.toContain('remote stop unavailable');
    } finally {
      warn.mockRestore();
    }
  });
});
