// @vitest-environment node

// INVARIANT UNDER TEST: a project this daemon creates while it knows a
// signed-in workspace always gets a `workspace_projects` binding row.
//
// Every project-creating route resolved its workspace from the REQUEST's
// `x-od-workspace-*` headers alone (`resolveCreatedProjectWorkspace` ->
// `bindCreatedProjectToWorkspace`, whose first statement was `if (!context)
// return;`). A headerless create therefore produced an unbound project and
// still answered 200, so nothing anywhere surfaced the loss. Three shipped
// callers are headerless by construction, not by choice:
//
//   * `od project create` (apps/daemon/src/cli.ts) and the MCP `create_project`
//     tool never mint workspace headers at all.
//   * the web client's duplicate / design-system-copy / plugin-share creates
//     read a ref that drops the context's `loading` flag, so a create fired
//     before the (vela-backed, seconds-long) identity read lands sends none.
//   * daemon-initiated creates — Orbit runs, scheduled routines — have no
//     request to read headers from in the first place.
//
// The damage is billing attribution, not cosmetics. An unbound project makes
// `GET /api/projects/:id/workspace-scope` answer `unbound`, which
// `ProjectView`'s `projectRunWorkspaceContext` turns into `null` on the run
// request — an Open Design Cloud run with no workspace to bill — and which
// blanks `AvatarMenu`'s balance/plan area while that project is open.
//
// The fix resolves a headerless create against the daemon's OWN last-known
// workspace (`workspaceContext.lastKnown()`, zero-network and synchronous)
// instead of leaving an orphan. Two boundaries are deliberately NOT that, and
// are pinned below so nobody later "fixes" them into a block:
//
//   * SIGNED OUT is not a bug. A daemon that has resolved no workspace binds
//     nothing, the create still succeeds, and `unbound` is the honest answer —
//     the same way the product behaves with no workspace feature at all.
//   * An explicit header identity still wins over the ambient one. A create
//     that names a workspace binds to THAT workspace.
//
// Seeding is through production HTTP APIs only: `PUT /api/workspace/context`
// (the daemon's own dev/demo context seam, the same endpoint tools-dev and the
// demo runtime drive) for the ambient identity, and the real vela integration
// (`VELA_CONTROL_KEY` + `VELA_API_URL` -> `GET /api/v1/workspaces`) against a
// temporary server-level mock for the membership directory that turns a
// binding into a resolvable `personal`/`team` scope. No source-level backdoor.

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

describe('a created project is bound to the workspace the daemon is signed in to', () => {
  test(
    'headerless creates bind to the ambient workspace; signed-out stays unbound and still works',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-created-project-binding');

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          await setAmbientWorkspace(webUrl, AMBIENT);

          // --- SOURCE 1: POST /api/projects with no workspace headers. This is
          // `od project create`, the MCP `create_project` tool, and any web
          // create that fired before the identity read landed.
          const plainCreate = await createProject(webUrl, 'Bind plain create');
          const plainScope = await readScope(webUrl, plainCreate);
          expect(
            plainScope.kind,
            'a headerless create must still bind to the workspace the daemon knows it is in',
          ).not.toBe('unbound');
          expect(plainScope.workspaceId).toBe(AMBIENT.workspaceId);
          expect(plainScope.kind).toBe('personal');
          // The binding is a private local draft, never a team share.
          expect(plainScope.visibility).toBe('personal');
          // The member id is the DIRECTORY's, which is what makes it a usable
          // billing subject rather than an echo of whatever asked.
          expect(plainScope.context?.workspaceMemberId).toBe(AMBIENT.workspaceMemberId);

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
            'an imported-folder project is still a project and still needs a home workspace',
          ).not.toBe('unbound');
          expect(importedScope.workspaceId).toBe(AMBIENT.workspaceId);

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
            'a plugin-created project must not be an orphan either',
          ).not.toBe('unbound');
          expect(pluginScope.workspaceId).toBe(AMBIENT.workspaceId);

          // --- BOUNDARY 1: an explicit identity outranks the ambient one. The
          // ambient workspace is a fallback for callers that cannot say, never
          // an override for callers that did.
          const explicit = await createProject(
            webUrl,
            'Bind explicit team',
            workspaceHeaders(EXPLICIT_TEAM),
          );
          const explicitScope = await readScope(webUrl, explicit);
          expect(explicitScope.workspaceId).toBe(EXPLICIT_TEAM.workspaceId);
          expect(explicitScope.kind).toBe('team');

          // --- BOUNDARY 2: SIGNED OUT. Runs last: it clears the ambient
          // identity the cases above depend on.
          //
          // With no workspace resolved there is nothing to bind to, and
          // inventing one would be worse than answering "none". The create must
          // still SUCCEED and the project must still be usable — this is the
          // product's behavior with no workspace feature at all, and a guard
          // here would break the signed-out single-player user.
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

describe('an asserted workspace identity is verified before it is persisted', () => {
  test(
    'a create asserting a workspace the caller has no membership in does not bind to it',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-created-project-unverified-claim');

      // `OD_WORKSPACE_CONTEXT_SOURCE=vela` is what makes the daemon's
      // project-creation membership authority exist at all
      // (`fetchProjectCreationWorkspaceDirectory` is undefined otherwise — the
      // documented local/dev compatibility path). The mock directory below lists
      // AMBIENT and EXPLICIT_TEAM and deliberately does NOT list the foreign
      // pair the request asserts.
      await suite.with.toolsDev(
        async ({ webUrl }) => {
          const source = await createProject(webUrl, 'Claim source');

          // Duplicate is one of the paths with no authorization gate of its own,
          // so it is where an unverified header claim used to be written
          // straight into `workspace_projects`.
          const copy = await requestJson<CreatedProject>(
            webUrl,
            `/api/projects/${encodeURIComponent(source)}/duplicate`,
            {
              body: { name: 'Claim copy' },
              headers: workspaceHeaders({
                workspaceId: 'ws-bind-foreign',
                workspaceMemberId: 'mem-bind-foreign',
                workspaceType: 'team',
              }),
              method: 'POST',
            },
          );

          const copyScope = await readScope(webUrl, copy.project.id);
          // The claim is never persisted...
          expect(
            copyScope.workspaceId,
            'an unverifiable header claim must not be written as a binding',
          ).not.toBe('ws-bind-foreign');
          // ...and with no ambient workspace behind this daemon there is nothing
          // to degrade to, so `unbound` is the honest answer. Creation still
          // returned 200 — the point is that it degrades, never refuses.
          expect(copyScope.kind).toBe('unbound');
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
