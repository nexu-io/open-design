// @vitest-environment node

// A project's workspace scope is durable project authority, not navigation
// state. `GET /api/projects/:id/workspace-scope` therefore reads only the
// persisted binding plus the membership directory. A genuinely unbound legacy
// project stays unbound even when the caller's left rail currently selects a
// Team or Personal workspace; borrowing that selection would make a tab switch
// silently retarget later runs, writes, and billing.
//
// Two boundaries are pinned here:
//
//   * `unavailable` — a project pinned to workspace X, read by a caller whose
//     selected workspace is Y, must keep answering X/`unavailable`. The scope
//     carries `workspaceMemberId`, which is the billing subject; resolving it
//     to Y would bill Y's wallet for X's project. All three of its return sites
//     keep today's exact behavior, and the two that differ in cause — the
//     directory was never read, versus it was read and does not list this
//     membership — are both pinned below. Neither gains a fallback.
//   * an unbound project never gains a workspace from request headers, whether
//     those headers name a live membership, a removed membership, or nothing.
//
// The membership directory is seeded through the daemon's real vela integration
// (`VELA_CONTROL_KEY` + `VELA_API_URL` -> `GET /api/v1/workspaces`) against a
// temporary server-level mock, and every project is created through
// `POST /api/projects`. No source-level test backdoor.

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

const PERSONAL = {
  workspaceId: 'ws-scope-personal',
  workspaceName: 'Scope personal',
  workspaceType: 'personal' as const,
  workspaceMemberId: 'mem-scope-personal',
  role: 'owner' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
};

const TEAM = {
  workspaceId: 'ws-scope-team',
  workspaceName: 'Scope team',
  workspaceType: 'team' as const,
  workspaceMemberId: 'mem-scope-team',
  role: 'member' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
};

/** A workspace the signed-in identity is NOT a member of. */
const FOREIGN_WORKSPACE_ID = 'ws-scope-foreign';
const FOREIGN_MEMBER_ID = 'mem-scope-foreign';

let directoryServer: Server;
let directoryUrl: string;
let directoryItems: Array<Record<string, unknown>>;

beforeAll(async () => {
  directoryItems = [PERSONAL, TEAM];
  directoryServer = createServer((req, res) => {
    if (req.url?.startsWith('/api/v1/workspaces') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ items: directoryItems }));
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

async function readScopeStatus(
  webUrl: string,
  projectId: string,
  headers?: Record<string, string>,
): Promise<number> {
  const response = await fetch(
    `${webUrl}/api/projects/${encodeURIComponent(projectId)}/workspace-scope`,
    headers ? { headers } : {},
  );
  return response.status;
}

describe('project workspace scope is independent from the caller selection', () => {
  test(
    'an unbound project stays unbound while a pinned project keeps its own workspace',
    { timeout: 240_000 },
    async () => {
      const suite = await createSmokeSuite('collab-project-workspace-scope');

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          directoryItems = [PERSONAL, TEAM];

          // --- The bug: an unbound project must not borrow the caller's TEAM
          // selection.
          const unboundForTeam = await createProject(webUrl, 'Scope unbound for team');
          expect(
            (await readScope(webUrl, unboundForTeam)).kind,
            'created headerless, so the daemon has no binding for it',
          ).toBe('unbound');

          const teamScope = await readScope(
            webUrl,
            unboundForTeam,
            workspaceHeaders(TEAM),
          );
          expect(teamScope.kind).toBe('unbound');
          expect(teamScope.workspaceId).toBeNull();
          expect(teamScope.context).toBeNull();

          // --- Same invariant for a Personal selection.
          const unboundForPersonal = await createProject(webUrl, 'Scope unbound for personal');
          const personalScope = await readScope(
            webUrl,
            unboundForPersonal,
            workspaceHeaders(PERSONAL),
          );
          expect(personalScope.kind).toBe('unbound');
          expect(personalScope.workspaceId).toBeNull();
          expect(personalScope.context).toBeNull();

          // --- BOUNDARY 1: bind while the member is authoritative, then remove
          // that membership. The project stays pinned to its own workspace.
          // The HTTP data plane fails closed before exposing that binding to an
          // unrelated Team caller; it must never borrow TEAM or TEAM's member id.
          directoryItems = [
            PERSONAL,
            TEAM,
            {
              workspaceId: FOREIGN_WORKSPACE_ID,
              workspaceName: 'Scope foreign',
              workspaceType: 'team',
              workspaceMemberId: FOREIGN_MEMBER_ID,
              role: 'owner',
              memberStatus: 'active',
              lifecycleState: 'active',
            },
          ];
          const pinnedElsewhere = await createProject(
            webUrl,
            'Scope pinned elsewhere',
            workspaceHeaders({
              workspaceId: FOREIGN_WORKSPACE_ID,
              workspaceMemberId: FOREIGN_MEMBER_ID,
              workspaceType: 'team',
            }),
          );
          directoryItems = [PERSONAL, TEAM];
          expect(
            await readScopeStatus(webUrl, pinnedElsewhere, workspaceHeaders(TEAM)),
            'an unrelated live Workspace must not read the persisted foreign binding',
          ).toBe(403);

          // --- BOUNDARY 2: unbound + no caller identity has no workspace to
          // fall back to.
          const unboundAnonymous = await createProject(webUrl, 'Scope unbound anonymous');
          const anonymousScope = await readScope(webUrl, unboundAnonymous);
          expect(anonymousScope.kind).toBe('unbound');
          expect(anonymousScope.workspaceId).toBeNull();
          expect(anonymousScope.context).toBeNull();

          // --- BOUNDARY 3: a caller whose claimed selection is not an active
          // membership cannot conjure a binding.
          const unboundUnconfirmed = await createProject(webUrl, 'Scope unbound unconfirmed');
          const unconfirmedScope = await readScope(
            webUrl,
            unboundUnconfirmed,
            workspaceHeaders({
              workspaceId: FOREIGN_WORKSPACE_ID,
              workspaceMemberId: FOREIGN_MEMBER_ID,
              workspaceType: 'team',
            }),
          );
          expect(unconfirmedScope.kind).toBe('unbound');
          expect(unconfirmedScope.workspaceId).toBeNull();
        },
        {
          env: {
            // The daemon's real vela session inputs, pointed at the mock above.
            // `readVelaControlApiContext` takes the env branch first, and
            // AMR_HOME redirects the config-file fallback at an empty dir, so a
            // developer machine that IS signed in to production cannot leak into
            // this run.
            AMR_HOME: await emptyAmrHome(suite.scratchDir),
            VELA_API_URL: directoryUrl,
            VELA_CONTROL_KEY: 'e2e-scope-control-key',
          },
        },
      );
    },
  );

  test(
    'a bound project stays unavailable when the membership directory cannot be read at all',
    { timeout: 240_000 },
    async () => {
      const suite = await createSmokeSuite('collab-project-scope-directory-unreadable');

      // No VELA session at all — the daemon's `fetchWorkspaceDirectory()` never
      // reaches an authority. This is the steady state of a signed-out client
      // and of every tools-dev runtime, so it is the COMMON `unavailable`, not
      // an exotic one, and it says nothing about who owns the project.
      await suite.with.toolsDev(
        async ({ webUrl }) => {
          const bound = await createProject(
            webUrl,
            'Scope directory unreadable',
            workspaceHeaders(TEAM),
          );
          const scope = await readScope(webUrl, bound, workspaceHeaders(TEAM));

          // The caller names the very workspace this project is pinned to, and
          // it STILL does not resolve: nothing confirmed the membership. This
          // is `unavailable`'s other cause, and the fix leaves it alone.
          expect(scope.kind).toBe('unavailable');
          expect(scope.workspaceId).toBe(TEAM.workspaceId);
          expect(scope.context).toBeNull();

          // An UNBOUND project in the same outage still has nowhere to fall
          // back to: an unreadable directory cannot confirm the caller's own
          // workspace either, so it stays `unbound` rather than becoming
          // `unavailable` on a workspace it was never bound to.
          const unbound = await createProject(webUrl, 'Scope unbound during outage');
          const unboundScope = await readScope(webUrl, unbound, workspaceHeaders(TEAM));
          expect(unboundScope.kind).toBe('unbound');
          expect(unboundScope.workspaceId).toBeNull();
        },
        { env: { AMR_HOME: await emptyAmrHome(suite.scratchDir) } },
      );
    },
  );
});

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
