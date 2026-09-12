import express, { type Request, type Response, type RequestHandler } from 'express';
import { mkdtemp, mkdir, realpath, rm, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerProjectRoutes } from '../../src/routes/project/index.js';
import { resolveProjectDir } from '../../src/projects.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
function noop() {}

function functionProxy(overrides: Record<string, unknown> = {}) {
  return new Proxy(overrides, {
    get(target, property) {
      return property in target ? target[property as string] : noop;
    },
  });
}

// Unused registrar services are inert; the tested GET uses the real resolver
// and filesystem below. No HTTP listener or agent/provider is created.
function buildDeps() {
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
      validateLinkedDirs: () => ({ dirs: [] }),
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
    },
  } as unknown as Parameters<typeof registerProjectRoutes>[1];
}

async function invokeDetail(projectsRoot: string, options: { imported?: string; authorized?: boolean; missing?: boolean } = {}) {
  const deps = buildDeps();
  const project = { id: 'example-project', name: 'Example', skillId: null, designSystemId: null, createdAt: 1, updatedAt: 1, metadata: options.imported ? { baseDir: options.imported } : null };
  const ensureProject = vi.fn();
  deps.paths.PROJECTS_DIR = projectsRoot;
  deps.projectStore.getProject = vi.fn(() => options.missing ? null : project);
  deps.projectFiles.resolveProjectDir = resolveProjectDir;
  deps.projectFiles.ensureProject = ensureProject;
  const authorize = vi.fn(async (_req: Request, res: Response) => {
    if (options.authorized === false) { res.status(403).json({ error: 'forbidden' }); return false; }
    return true;
  });
  deps.authorizeProjectRequest = authorize;
  const app = express();
  const get = vi.spyOn(app, 'get');
  registerProjectRoutes(app, deps);
  const registration = get.mock.calls.find((args) => args[0] === '/api/projects/:id');
  if (!registration) throw new Error('detail route not registered');
  const handler = registration[1] as RequestHandler;
  const json = vi.fn();
  const res = { json, status: vi.fn().mockReturnThis() };
  await handler({ params: { id: project.id }, query: {} } as unknown as Request, res as unknown as Response, vi.fn());
  return { body: json.mock.calls[0]?.[0], res, authorize, ensureProject };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'od-canonical-detail-'));
  roots.push(root);
  const actual = path.join(root, 'actual');
  await mkdir(path.join(actual, 'example-project'), { recursive: true });
  const alias = path.join(root, 'alias');
  await symlink(actual, alias, process.platform === 'win32' ? 'junction' : 'dir');
  return { root, actual, alias };
}

describe('GET project detail canonical root (registered handler, no listener)', () => {
  it('preserves managed resolvedDir and reports its real filesystem alias', async () => {
    const { alias, actual } = await fixture();
    const { body, ensureProject } = await invokeDetail(alias);
    expect(body.resolvedDir).toBe(path.join(alias, 'example-project'));
    expect(body.canonicalResolvedDir).toBe(await realpath(path.join(actual, 'example-project')));
    expect(ensureProject).not.toHaveBeenCalled();
  });
  it('reports a managed root whose alias and target are sibling directories', async () => {
    const { root, actual } = await fixture();
    const projectAlias = path.join(root, 'example-project');
    await symlink(actual, projectAlias, process.platform === 'win32' ? 'junction' : 'dir');
    const { body } = await invokeDetail(root);
    expect(body.resolvedDir).toBe(projectAlias);
    expect(body.canonicalResolvedDir).toBe(await realpath(actual));
  });
  it('resolves only the authorized imported project root', async () => {
    const { alias, actual } = await fixture();
    const imported = path.join(alias, 'example-project');
    const { body } = await invokeDetail(actual, { imported });
    expect(body.resolvedDir).toBe(imported);
    expect(body.canonicalResolvedDir).toBe(await realpath(imported));
  });
  it('keeps a missing lazy project successful without creating a directory', async () => {
    const { root } = await fixture();
    const missing = path.join(root, 'not-created');
    const { body, ensureProject } = await invokeDetail(missing);
    expect(body.resolvedDir).toBe(path.join(missing, 'example-project'));
    expect(body).not.toHaveProperty('canonicalResolvedDir');
    await expect(access(missing)).rejects.toThrow();
    expect(ensureProject).not.toHaveBeenCalled();
  });
  it('does not expose root information for a denied project', async () => {
    const { alias } = await fixture();
    const { body, res } = await invokeDetail(alias, { authorized: false });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(body).toEqual({ error: 'forbidden' });
  });
  it('preserves a missing project 404 before authorization', async () => {
    const { alias } = await fixture();
    const { body, res, authorize } = await invokeDetail(alias, { missing: true });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(body.error.code).toBe('PROJECT_NOT_FOUND');
    expect(authorize).not.toHaveBeenCalled();
  });
});
