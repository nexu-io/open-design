import type http from 'node:http';

import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerProjectRoutes } from '../../src/routes/project/index.js';

// POST /api/projects must answer within one request-wide deadline (15s in
// production) and commit nothing when it cannot: the Web enters an optimistic
// project surface the moment it sends the request, so a stalled catalogue
// read has to become a definite, retryable 504 the client can roll back from.

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function buildDeps(input: {
  insertProject: ReturnType<typeof vi.fn>;
  insertConversation: ReturnType<typeof vi.fn>;
  projectCreatePreparationTimeoutMs: number;
  designSystemDelayMs?: number;
  skillDelayMs?: number;
  getLocalPluginBySource?: ReturnType<typeof vi.fn>;
}) {
  return {
    projectCreatePreparationTimeoutMs: input.projectCreatePreparationTimeoutMs,
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
        init: Record<string, unknown> = {},
      ) => res.status(status).json({ error: { code, message, ...init } }),
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
      updateProject: vi.fn(),
      validateLinkedDirs: () => ({ dirs: [] }),
      getProject: () => null,
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
    conversations: functionProxy({ insertConversation: input.insertConversation }),
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
      validateProjectDesignSystemId: vi.fn(async (id: string | null) => {
        if (input.designSystemDelayMs) await sleep(input.designSystemDelayMs);
        return { ok: true, id };
      }),
      validateProjectSkillId: vi.fn(async (id: string | null) => {
        if (input.skillDelayMs) await sleep(input.skillDelayMs);
        return { ok: true, id };
      }),
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

async function post(baseUrl: string, overrides: Record<string, unknown> = {}) {
  return fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...overrides,
      id: 'deadline-project',
      name: 'Deadline project',
      skillId: null,
      designSystemId: null,
      metadata: { kind: 'prototype' },
      // The automatic OD Next route keeps this scaffold off the default
      // scenario plugin lookup, which needs a real SQLite handle.
      conversationMode: 'design',
      automaticStrategyTaskProfile: 'prototype',
      pendingPrompt: 'Make a landing page',
    }),
  });
}

describe('POST /api/projects preparation deadline', () => {
  it('answers 504 PROJECT_CREATE_PREPARATION_TIMEOUT and commits nothing when one read stalls', async () => {
    const insertProject = vi.fn();
    const insertConversation = vi.fn();
    const baseUrl = await start(buildDeps({
      insertProject,
      insertConversation,
      projectCreatePreparationTimeoutMs: 40,
      designSystemDelayMs: 400,
    }));

    const response = await post(baseUrl);
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'PROJECT_CREATE_PREPARATION_TIMEOUT',
        retryable: true,
        details: { stage: 'validating the selected design system' },
      },
    });
    expect(insertProject).not.toHaveBeenCalled();
    expect(insertConversation).not.toHaveBeenCalled();
  });

  it('shares one deadline across stages instead of restarting it per read', async () => {
    const insertProject = vi.fn();
    const insertConversation = vi.fn();
    // Each stage alone fits inside the deadline; together they do not.
    const baseUrl = await start(buildDeps({
      insertProject,
      insertConversation,
      projectCreatePreparationTimeoutMs: 60,
      designSystemDelayMs: 40,
      skillDelayMs: 40,
    }));

    const response = await post(baseUrl);
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'PROJECT_CREATE_PREPARATION_TIMEOUT',
        details: { stage: 'validating the selected skill' },
      },
    });
    expect(insertProject).not.toHaveBeenCalled();
  });

  it('bounds the example-card lookup that runs after the catalogue validations', async () => {
    const insertProject = vi.fn();
    const insertConversation = vi.fn();
    // Home Send takes this path when an official example card was picked under
    // an automatic OD Next route; the lookup must not escape the deadline.
    const getLocalPluginBySource = vi.fn(() => new Promise<never>(() => undefined));
    const baseUrl = await start(buildDeps({
      insertProject,
      insertConversation,
      projectCreatePreparationTimeoutMs: 60,
      getLocalPluginBySource,
    }));

    const response = await post(baseUrl, {
      exampleReference: { pluginId: 'example-web-prototype', source: '/tmp/example-web-prototype' },
    });
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'PROJECT_CREATE_PREPARATION_TIMEOUT',
        retryable: true,
        details: { stage: 'resolving the selected example' },
      },
    });
    expect(getLocalPluginBySource).toHaveBeenCalledTimes(1);
    expect(insertProject).not.toHaveBeenCalled();
    expect(insertConversation).not.toHaveBeenCalled();
  });

  it('still creates the project when preparation finishes inside the deadline', async () => {
    const insertProject = vi.fn((_: unknown, project: Record<string, unknown>) => project);
    const insertConversation = vi.fn();
    const baseUrl = await start(buildDeps({
      insertProject,
      insertConversation,
      projectCreatePreparationTimeoutMs: 2_000,
      designSystemDelayMs: 5,
    }));

    const response = await post(baseUrl);
    const happyBody = await response.json();
    expect([response.status, happyBody]).toEqual([
      200,
      expect.objectContaining({
        project: expect.objectContaining({ id: 'deadline-project', name: 'Deadline project' }),
        conversationId: 'conversation-id',
      }),
    ]);
    expect(insertProject).toHaveBeenCalledTimes(1);
    expect(insertConversation).toHaveBeenCalledTimes(1);
  });
});
