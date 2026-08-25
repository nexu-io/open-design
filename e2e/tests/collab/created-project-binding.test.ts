// @vitest-environment node

// INVARIANT UNDER TEST: project creation uses an explicit Workspace/member pair
// only as durable local attribution. Mutable daemon current/default state is
// never an attribution source: a headerless legacy, CLI, plugin, or signed-out
// create remains unbound, while an explicitly scoped create is persisted under
// that exact Workspace without making the local write depend on Vela.

import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { requestJson } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

type ProjectWorkspaceScopeBody = {
  scope: {
    kind: 'unbound' | 'unavailable' | 'personal' | 'team';
    projectId: string;
    workspaceId: string | null;
    visibility?: 'personal' | 'team';
    context: { workspaceId: string; workspaceMemberId: string; workspaceType: string } | null;
  };
};

type CreatedProject = { conversationId: string; project: { id: string; name: string } };
type InstalledPlugins = { plugins: Array<{ id: string; title?: string }> };

/** The daemon's ambient signed-in workspace for most of this spec. */
const AMBIENT = {
  workspaceId: 'ws-bind-personal',
  workspaceName: 'Bind personal',
  workspaceType: 'personal' as const,
  workspaceMemberId: 'mem-bind-personal',
  role: 'owner' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
};

/** A second membership, used to prove explicit headers still outrank ambient. */
const EXPLICIT_TEAM = {
  workspaceId: 'ws-bind-team',
  workspaceName: 'Bind team',
  workspaceType: 'team' as const,
  workspaceMemberId: 'mem-bind-team',
  role: 'member' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
};

let directoryServer: Server;
let directoryUrl: string;

beforeAll(async () => {
  directoryServer = createServer((req, res) => {
    if (req.url?.startsWith('/api/v1/workspaces') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ items: [AMBIENT, EXPLICIT_TEAM] }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise<void>((resolve) => directoryServer.listen(0, '127.0.0.1', resolve));
  const address = directoryServer.address();
  if (address == null || typeof address === 'string') throw new Error('mock directory has no port');
  directoryUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => directoryServer.close(() => resolve()));
});

function workspaceHeaders(input: {
  workspaceId: string;
  workspaceMemberId: string;
  workspaceType: 'personal' | 'team';
  role?: string;
}): Record<string, string> {
  return {
    'x-od-workspace-id': input.workspaceId,
    'x-od-workspace-type': input.workspaceType,
    'x-od-workspace-member-id': input.workspaceMemberId,
    'x-od-workspace-role': input.role ?? 'owner',
    'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-member-status': 'active',
    'x-od-workspace-can-share-projects': 'true',
    'x-od-workspace-can-write-synced-files': 'true',
  };
}

/**
 * Put the daemon into "a signed-in workspace is known" — the state every real
 * client reaches within seconds of launch through its own
 * `GET /api/workspace/context` poll. `null` signs it out again.
 */
async function setAmbientWorkspace(
  webUrl: string,
  context: Record<string, unknown> | null,
): Promise<void> {
  await requestJson(webUrl, '/api/workspace/context', {
    body: context ?? {},
    method: 'PUT',
  });
}

async function readScope(
  webUrl: string,
  projectId: string,
  headers?: Record<string, string>,
): Promise<ProjectWorkspaceScopeBody['scope']> {
  const body = await requestJson<ProjectWorkspaceScopeBody>(
    webUrl,
    `/api/projects/${encodeURIComponent(projectId)}/workspace-scope`,
    headers ? { headers } : {},
  );
  return body.scope;
}

async function createProject(
  webUrl: string,
  name: string,
  headers?: Record<string, string>,
): Promise<string> {
  const created = await requestJson<CreatedProject>(webUrl, '/api/projects', {
    body: {
      designSystemId: null,
      id: randomUUID(),
      metadata: { kind: 'prototype' },
      name,
      pendingPrompt: null,
      skillId: null,
    },
    method: 'POST',
    ...(headers ? { headers } : {}),
  });
  return created.project.id;
}

describe('a created project is bound only to an explicit Workspace', () => {
  test(
    'ambient state never claims headerless creates; explicit scope still binds exactly',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-created-project-binding');

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          await setAmbientWorkspace(webUrl, AMBIENT);

          // `od project create`, MCP, and other headerless legacy callers do
          // not inherit whichever Workspace the daemon most recently observed.
          const plainCreate = await createProject(webUrl, 'Bind plain create');
          const plainScope = await readScope(webUrl, plainCreate);
          expect(
            plainScope.kind,
            'a headerless create must not inherit daemon-global Workspace state',
          ).toBe('unbound');
          expect(plainScope.workspaceId).toBeNull();

          // --- SOURCE 2: folder import. Same shared helper, its own route.
          const importedDir = join(suite.scratchDir, 'imported-folder');
          await mkdir(importedDir, { recursive: true });
          const imported = await requestJson<CreatedProject>(webUrl, '/api/import/folder', {
            body: { baseDir: importedDir, name: 'Bind folder import' },
            method: 'POST',
          });
          const importedScope = await readScope(webUrl, imported.project.id);
          expect(
            importedScope.kind,
            'a headerless folder import must not inherit daemon-global Workspace state',
          ).toBe('unbound');
          expect(importedScope.workspaceId).toBeNull();

          // --- SOURCE 3: plugin-created project. Uses whichever plugin the
          // daemon registered at startup, so it needs no fixture of its own.
          const installed = await requestJson<InstalledPlugins>(webUrl, '/api/plugins');
          expect(
            installed.plugins.length,
            'the daemon registers bundled plugins at startup',
          ).toBeGreaterThan(0);
          const fromPlugin = await duplicateFirstDuplicablePlugin(
            webUrl,
            installed.plugins.map((plugin) => plugin.id),
          );
          const pluginScope = await readScope(webUrl, fromPlugin.project.id);
          expect(
            pluginScope.kind,
            'a headerless plugin create must not inherit daemon-global Workspace state',
          ).toBe('unbound');
          expect(pluginScope.workspaceId).toBeNull();

          // An explicit identity is the only Workspace binding source.
          const explicit = await createProject(
            webUrl,
            'Bind explicit team',
            workspaceHeaders(EXPLICIT_TEAM),
          );
          const explicitScope = await readScope(
            webUrl,
            explicit,
            workspaceHeaders(EXPLICIT_TEAM),
          );
          expect(explicitScope.workspaceId).toBe(EXPLICIT_TEAM.workspaceId);
          expect(explicitScope.kind).toBe('team');

          // Signed-out remains the same legal unbound/local path.
          await setAmbientWorkspace(webUrl, null);
          const signedOut = await createProject(webUrl, 'Bind signed out');
          const signedOutScope = await readScope(webUrl, signedOut);
          expect(signedOutScope.kind, 'signed out has no workspace to bind to').toBe('unbound');
          expect(signedOutScope.workspaceId).toBeNull();
          // Still a real, readable, usable project — not a blocked create.
          const readBack = await requestJson<{ project: { id: string; name: string } }>(
            webUrl,
            `/api/projects/${encodeURIComponent(signedOut)}`,
          );
          expect(readBack.project.name).toBe('Bind signed out');
        },
        {
          env: {
            // The daemon's real vela session inputs, pointed at the mock above.
            // AMR_HOME redirects the config-file fallback at an empty dir so a
            // developer machine that IS signed in to production cannot leak in.
            AMR_HOME: await emptyAmrHome(suite.scratchDir),
            VELA_API_URL: directoryUrl,
            VELA_CONTROL_KEY: 'e2e-binding-control-key',
          },
        },
      );
    },
  );
});

describe('an asserted workspace identity is persisted as local attribution', () => {
  test(
    'a complete explicit pair is not blocked by the remote membership directory',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-created-project-unverified-claim');

      // The mock directory deliberately does NOT list the asserted pair. Local
      // project creation/duplication must still use that complete pair as a
      // namespace and authorship witness without consulting remote membership.
      await suite.with.toolsDev(
        async ({ webUrl }) => {
          const source = await createProject(webUrl, 'Claim source');

          // Duplicate exercises both reconciliation of the existing unbound
          // source and attribution of the newly created copy.
          const response = await fetch(
            new URL(`/api/projects/${encodeURIComponent(source)}/duplicate`, webUrl),
            {
              body: JSON.stringify({ name: 'Claim copy' }),
              headers: {
                'content-type': 'application/json',
                ...workspaceHeaders({
                  workspaceId: 'ws-bind-foreign',
                  workspaceMemberId: 'mem-bind-foreign',
                  workspaceType: 'team',
                }),
              },
              method: 'POST',
            },
          );
          expect(response.status).toBe(200);
          const copyId = ((await response.json()) as CreatedProject).project.id;

          const sourceScope = await readScope(webUrl, source);
          expect(sourceScope.workspaceId).toBe('ws-bind-foreign');
          expect(sourceScope.kind).toBe('team');

          const copyScope = await readScope(webUrl, copyId);
          expect(copyScope.workspaceId).toBe('ws-bind-foreign');
          expect(copyScope.kind).toBe('team');
        },
        {
          env: {
            AMR_HOME: await emptyAmrHome(suite.scratchDir),
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            VELA_API_URL: directoryUrl,
            VELA_CONTROL_KEY: 'e2e-binding-control-key',
          },
        },
      );
    },
  );
});

/**
 * Create a project from whichever bundled plugin the daemon can actually
 * duplicate. Not every plugin exposes a duplicable HTML preview
 * (`NO_DUPLICABLE_PREVIEW`), and which ones ship is a catalog detail this spec
 * has no business pinning — so try them in turn and report the refusals if none
 * works, rather than failing on an unrelated fixture change.
 */
async function duplicateFirstDuplicablePlugin(
  webUrl: string,
  pluginIds: readonly string[],
): Promise<CreatedProject> {
  const refusals: string[] = [];
  for (const pluginId of pluginIds) {
    const response = await fetch(
      new URL(`/api/plugins/${encodeURIComponent(pluginId)}/duplicate-project`, webUrl),
      {
        body: JSON.stringify({ name: `Bind plugin project ${pluginId}` }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    );
    const text = await response.text();
    if (response.ok) return JSON.parse(text) as CreatedProject;
    refusals.push(`${pluginId}: ${response.status} ${text.slice(0, 120)}`);
  }
  throw new Error(
    `no bundled plugin could be duplicated into a project:\n${refusals.join('\n')}`,
  );
}

/**
 * A vela config home guaranteed to hold no session, so the daemon's
 * `readVelaControlApiContext` config-file fallback cannot pick up the developer
 * machine's real production login.
 */
async function emptyAmrHome(scratchDir: string): Promise<string> {
  const dir = join(scratchDir, 'empty-amr-home');
  await mkdir(dir, { recursive: true });
  return dir;
}
