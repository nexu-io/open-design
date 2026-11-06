import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerProjectRoutes } from '../../src/routes/project/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const WEB_PROTOTYPE_DIR = path.join(
  REPO_ROOT,
  'plugins',
  '_official',
  'examples',
  'web-prototype',
);
const EXAMPLE_PLUGIN_ID = 'example-web-prototype';

const servers: http.Server[] = [];
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

function noop() {}

function functionProxy(overrides: Record<string, unknown> = {}) {
  return new Proxy(overrides, {
    get(target, property) {
      return property in target ? target[property as string] : noop;
    },
  });
}

function buildDeps(input: {
  insertProject: ReturnType<typeof vi.fn>;
  getLocalPluginBySource?: ReturnType<typeof vi.fn>;
  existingMetadata?: Record<string, unknown> | null;
  updateProject?: ReturnType<typeof vi.fn>;
}) {
  return {
    db: {
      transaction: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => fn(...args),
    },
    design: {},
    http: {
      createSseResponse: noop,
      sendApiError: (
        res: express.Response,
        status: number,
        code: string,
        message: string,
      ) => res.status(status).json({ error: { code, message } }),
    },
    paths: {
      DESIGN_SYSTEMS_DIR: '',
      PROJECTS_DIR: '',
      SKILLS_DIR: '',
      BRANDS_DIR: '',
      USER_DESIGN_SYSTEMS_DIR: '',
    },
    projectStore: functionProxy({
      insertProject: input.insertProject,
      updateProject: input.updateProject ?? vi.fn(),
      // The route 404s on a falsy updateProject result, so a stub that
      // returns nothing would hide every real assertion below it.
      validateLinkedDirs: () => ({ dirs: [] }),
      getProject: () => ({
        id: 'example-project',
        name: 'Example project',
        skillId: null,
        designSystemId: null,
        metadata: input.existingMetadata ?? null,
        createdAt: 1,
        updatedAt: 1,
      }),
      getWorkspaceProject: () => null,
      getWorkspaceProjectByProjectId: () => null,
      listWorkspaceProjects: () => [],
      listProjects: () => [],
    }),
    projectFiles: functionProxy({
      listFiles: () => [],
      listTabs: () => [],
      resolveProjectDir: () => '',
    }),
    conversations: functionProxy({ insertConversation: vi.fn() }),
    templates: functionProxy({ listTemplates: () => [] }),
    status: functionProxy({
      listLatestProjectRunStatuses: () => new Map(),
      listProjectsAwaitingInput: () => new Set(),
      listProjects: () => [],
      listUnboundProjects: () => [],
    }),
    events: functionProxy({ activeProjectEventSinks: new Map() }),
    ids: { randomId: () => 'conversation-id' },
    telemetry: { reportFinalizedMessage: noop },
    appConfig: { readAppConfig: async () => ({}), writeAppConfig: noop },
    agents: {},
    validation: {
      validateProjectDesignSystemId: vi.fn(async (id: string) => ({ ok: true, id })),
      validateProjectSkillId: vi.fn(async (id: string) => ({ ok: true, id })),
    },
    collabSync: functionProxy(),
    authorizeProjectRequest: vi.fn(async () => true),
    fetchProjectCreationWorkspaceDirectory: vi.fn(async () => ({ ok: false, items: [] })),
    pluginScope: {
      loadRegistry: vi.fn(async () => ({
        skills: [],
        designSystems: [],
        craft: [],
        atoms: [],
        scenarios: [],
      })),
      getPlugin: vi.fn(async () => ({})),
      ...(input.getLocalPluginBySource
        ? { getLocalPluginBySource: input.getLocalPluginBySource }
        : {}),
    },
  } as unknown as Parameters<typeof registerProjectRoutes>[1];
}

async function start(deps: Parameters<typeof registerProjectRoutes>[1]) {
  const app = express();
  app.use(express.json());
  registerProjectRoutes(app, deps);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  return `http://127.0.0.1:${address.port}`;
}

function createBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 'example-project',
    name: 'Example project',
    metadata: { kind: 'prototype' },
    conversationMode: 'design',
    automaticStrategyTaskProfile: 'prototype',
    exampleReference: { pluginId: EXAMPLE_PLUGIN_ID, source: WEB_PROTOTYPE_DIR },
    ...overrides,
  };
}

function localExampleResolver(overrides: Record<string, unknown> = {}) {
  return vi.fn(async (id: string, source: string) => ({
    id,
    source,
    fsPath: WEB_PROTOTYPE_DIR,
    title: 'Web Prototype',
    ...overrides,
  }));
}

async function post(baseUrl: string, body: unknown) {
  return fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/projects exampleReference', () => {
  it('stamps a daemon-owned binding without pinning an executable plugin', async () => {
    const insertProject = vi.fn((_: unknown, project: Record<string, unknown>) => project);
    const getLocalPluginBySource = localExampleResolver();
    const baseUrl = await start(buildDeps({ insertProject, getLocalPluginBySource }));

    const response = await post(baseUrl, createBody());
    expect(response.status).toBe(200);

    expect(getLocalPluginBySource).toHaveBeenCalledWith(
      EXAMPLE_PLUGIN_ID,
      WEB_PROTOTYPE_DIR,
    );
    const [, project] = insertProject.mock.calls[0]!;
    const metadata = (project as { metadata: Record<string, unknown> }).metadata;
    const expectedDigest = `sha256:${createHash('sha256')
      .update(await readFile(path.join(WEB_PROTOTYPE_DIR, 'SKILL.md')))
      .digest('hex')}`;
    expect(metadata.exampleBinding).toEqual({
      schemaVersion: 1,
      provenance: 'example_card',
      pluginId: EXAMPLE_PLUGIN_ID,
      pluginSource: WEB_PROTOTYPE_DIR,
      manifestSourceDigest: expectedDigest,
      boundAt: expect.any(Number),
    });
    // The whole point: the automatic OD Next route survives and no plugin
    // snapshot is pinned.
    expect(metadata.strategyBinding).toMatchObject({
      schemaVersion: 1,
      provenance: 'automatic_default',
      taskProfile: 'prototype',
    });
    expect((project as { appliedPluginSnapshotId?: unknown }).appliedPluginSnapshotId)
      .toBeFalsy();
  });

  it('rejects a reference missing either half of its identity', async () => {
    const insertProject = vi.fn();
    const baseUrl = await start(buildDeps({
      insertProject,
      getLocalPluginBySource: localExampleResolver(),
    }));

    for (const exampleReference of [
      {},
      { pluginId: EXAMPLE_PLUGIN_ID },
      { source: WEB_PROTOTYPE_DIR },
      { pluginId: '  ', source: WEB_PROTOTYPE_DIR },
      'example-web-prototype',
    ]) {
      const response = await post(baseUrl, createBody({ exampleReference }));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { message: 'exampleReference is invalid' },
      });
    }
    expect(insertProject).not.toHaveBeenCalled();
  });

  it('rejects a reference combined with an explicit plugin claim', async () => {
    const insertProject = vi.fn();
    const baseUrl = await start(buildDeps({
      insertProject,
      getLocalPluginBySource: localExampleResolver(),
    }));

    for (const explicit of [
      { pluginId: 'od-new-generation' },
      { appliedPluginSnapshotId: 'snapshot-1' },
    ]) {
      const response = await post(baseUrl, createBody(explicit));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          message:
            'exampleReference cannot be combined with pluginId or appliedPluginSnapshotId',
        },
      });
    }
    expect(insertProject).not.toHaveBeenCalled();
  });

  it('rejects a reference whose record does not resolve to the claimed identity', async () => {
    const insertProject = vi.fn();
    const baseUrl = await start(buildDeps({
      insertProject,
      // A same-source record carrying a different id must not be substituted.
      getLocalPluginBySource: localExampleResolver({ id: 'example-simple-deck' }),
    }));

    const response = await post(baseUrl, createBody());
    expect(response.status).toBe(404);
    expect(insertProject).not.toHaveBeenCalled();
  });

  it('rejects a reference that resolves to nothing at all', async () => {
    const insertProject = vi.fn();
    const baseUrl = await start(buildDeps({
      insertProject,
      getLocalPluginBySource: vi.fn(async () => null),
    }));

    const response = await post(baseUrl, createBody());
    expect(response.status).toBe(404);
    expect(insertProject).not.toHaveBeenCalled();
  });

  it('rejects a resolved example that has no SKILL.md to carry', async () => {
    const emptyDir = await mkdtemp(path.join(os.tmpdir(), 'od-example-empty-'));
    temporaryRoots.push(emptyDir);
    const insertProject = vi.fn();
    const baseUrl = await start(buildDeps({
      insertProject,
      getLocalPluginBySource: localExampleResolver({ fsPath: emptyDir }),
    }));

    const response = await post(baseUrl, createBody());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { message: 'example plugin has no readable SKILL.md to carry as a Skill' },
    });
    expect(insertProject).not.toHaveBeenCalled();
  });

  it('never accepts an exampleBinding smuggled in through client metadata', async () => {
    const insertProject = vi.fn((_: unknown, project: Record<string, unknown>) => project);
    const baseUrl = await start(buildDeps({ insertProject }));

    const response = await post(baseUrl, {
      id: 'example-project',
      name: 'Example project',
      conversationMode: 'design',
      automaticStrategyTaskProfile: 'prototype',
      metadata: {
        kind: 'prototype',
        exampleBinding: {
          schemaVersion: 1,
          provenance: 'example_card',
          pluginId: 'attacker-plugin',
          pluginSource: '/tmp/attacker',
          manifestSourceDigest: `sha256:${'0'.repeat(64)}`,
          boundAt: 1,
        },
      },
    });

    expect(response.status).toBe(200);
    const [, project] = insertProject.mock.calls[0]!;
    expect((project as { metadata: Record<string, unknown> }).metadata)
      .not.toHaveProperty('exampleBinding');
  });
});

describe('PATCH /api/projects/:id keeps the example binding daemon-owned', () => {
  const exampleBinding = {
    schemaVersion: 1,
    provenance: 'example_card',
    pluginId: EXAMPLE_PLUGIN_ID,
    pluginSource: WEB_PROTOTYPE_DIR,
    manifestSourceDigest: `sha256:${'a'.repeat(64)}`,
    boundAt: 42,
  };

  it('preserves the binding through a metadata patch that omits it', async () => {
    const updateProject = vi.fn((
      _db: unknown,
      id: string,
      patch: Record<string, unknown>,
    ) => ({ id, ...patch }));
    const baseUrl = await start(buildDeps({
      insertProject: vi.fn(),
      updateProject,
      existingMetadata: { kind: 'prototype', exampleBinding },
    }));

    const response = await fetch(`${baseUrl}/api/projects/example-project`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ metadata: { kind: 'prototype' } }),
    });

    expect(response.status).toBe(200);
    expect(updateProject).toHaveBeenCalledWith(
      expect.anything(),
      'example-project',
      expect.objectContaining({
        metadata: expect.objectContaining({ exampleBinding }),
      }),
    );
  });

  it('rejects a patch that rewrites or clears the binding', async () => {
    const updateProject = vi.fn((
      _db: unknown,
      id: string,
      patch: Record<string, unknown>,
    ) => ({ id, ...patch }));
    const baseUrl = await start(buildDeps({
      insertProject: vi.fn(),
      updateProject,
      existingMetadata: { kind: 'prototype', exampleBinding },
    }));

    for (const body of [
      { metadata: { kind: 'prototype', exampleBinding: { ...exampleBinding, pluginId: 'other' } } },
      { metadata: null },
    ]) {
      const response = await fetch(`${baseUrl}/api/projects/example-project`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }
    expect(updateProject).not.toHaveBeenCalled();
  });
});
