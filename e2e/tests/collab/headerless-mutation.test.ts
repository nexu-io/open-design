// @vitest-environment node

// Headerless legacy/CLI callers own only unbound local projects. They must stay
// able to create and mutate that local set whether or not the daemon most
// recently observed a signed-in Workspace. Once a project is explicitly bound,
// every mutation requires the matching explicit Workspace identity; mutable
// current/default state is never an authorization fallback.

import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { requestJson } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

type CreatedProject = { conversationId: string; project: { id: string } };
type ProjectWorkspaceScope = { kind: string; workspaceId: string | null };

/** The workspace the daemon itself resolves — `selectDefaultCandidate` prefers personal. */
const OWN = {
  workspaceId: 'ws-hdl-personal',
  workspaceName: 'Headerless personal',
  workspaceType: 'personal' as const,
  workspaceMemberId: 'mem-hdl-personal',
  role: 'owner' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
};

/** A second real membership, used to bind a project AWAY from the daemon's own workspace. */
const OTHER = {
  workspaceId: 'ws-hdl-team',
  workspaceName: 'Headerless team',
  workspaceType: 'team' as const,
  workspaceMemberId: 'mem-hdl-team',
  role: 'owner' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
};

let authority: Server;
let authorityUrl: string;

beforeAll(async () => {
  authority = createServer((req, res) => {
    const url = req.url ?? '';
    // 403 `missing_principal` makes the provider bootstrap a default workspace
    // from the directory, so the daemon ends up with an ambient workspace —
    // which is the state every signed-in install is in.
    if (url.startsWith('/api/v1/workspaces/current')) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing_principal' }));
      return;
    }
    if (url.startsWith('/api/v1/workspaces')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ items: [OWN, OTHER] }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise<void>((resolve) => authority.listen(0, '127.0.0.1', resolve));
  const address = authority.address();
  if (address == null || typeof address === 'string') throw new Error('authority has no port');
  authorityUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => authority.close(() => resolve()));
});

function workspaceHeaders(input: {
  workspaceId: string;
  workspaceMemberId: string;
  workspaceType?: 'personal' | 'team';
}): Record<string, string> {
  return {
    'x-od-workspace-id': input.workspaceId,
    'x-od-workspace-type': input.workspaceType ?? 'personal',
    'x-od-workspace-member-id': input.workspaceMemberId,
    'x-od-workspace-role': 'owner',
    'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-member-status': 'active',
    'x-od-workspace-can-share-projects': 'true',
    'x-od-workspace-can-write-synced-files': 'true',
  };
}

/** Exactly what `od project create` sends: a body, and no workspace identity. */
async function createHeaderless(webUrl: string, name: string): Promise<string> {
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
  });
  return created.project.id;
}

async function post(
  webUrl: string,
  path: string,
  headers: Record<string, string> | undefined,
  body: unknown,
): Promise<{ status: number; text: string }> {
  const response = await fetch(new URL(path, webUrl), {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    method: 'POST',
  });
  return { status: response.status, text: await response.text() };
}

async function patch(
  webUrl: string,
  path: string,
  headers: Record<string, string> | undefined,
  body: unknown,
): Promise<number> {
  const response = await fetch(new URL(path, webUrl), {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    method: 'PATCH',
  });
  return response.status;
}

async function readScope(webUrl: string, projectId: string): Promise<ProjectWorkspaceScope> {
  const body = await requestJson<{ scope: ProjectWorkspaceScope }>(
    webUrl,
    `/api/projects/${encodeURIComponent(projectId)}/workspace-scope`,
  );
  return body.scope;
}

const execFileAsync = promisify(execFile);

/** The real `od` entrypoint, driven as an external agent would. */
const OD_BIN = fileURLToPath(
  new URL('../../../apps/daemon/bin/od.mjs', import.meta.url),
);

/**
 * Run a real `od` subcommand against this runtime's daemon. Resolves with the
 * exit code and stdout/stderr instead of throwing, so a failure can be asserted
 * on rather than crashing the test.
 */
async function od(
  daemonUrl: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [OD_BIN, ...args], {
      env: { ...process.env, OD_DAEMON_URL: daemonUrl },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof failure.code === 'number' ? failure.code : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    };
  }
}

describe('a headerless caller can mutate only unbound local projects', () => {
  test(
    'create then duplicate with no workspace headers — the od CLI shape',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-headerless-mutation');

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          // --- THE BUG. Both calls are headerless, exactly like `od`.
          const own = await createHeaderless(webUrl, 'Headerless own project');

          const scope = await readScope(webUrl, own);
          expect(
            scope.kind,
            'a headerless create must not inherit the daemon current/default Workspace',
          ).toBe('unbound');
          expect(scope.workspaceId).toBeNull();

          const duplicate = await post(webUrl, `/api/projects/${own}/duplicate`, undefined, {
            name: 'Headerless duplicate',
          });
          expect(
            duplicate.status,
            `a headerless caller must be able to duplicate its own project; got ${duplicate.text.slice(0, 200)}`,
          ).toBe(200);

          // Not duplicate-specific: the same gate fronts every project mutation.
          const rename = await patch(webUrl, `/api/projects/${own}`, undefined, {
            name: 'Headerless rename',
          });
          expect(rename, 'rename runs the same gate').toBe(200);

          // --- BOUNDARY 1: a project bound to a workspace the daemon is NOT
          // currently in must stay refused for a headerless caller. This is the
          // teammate's-shared-project / previous-identity case the branch exists
          // for, and it must not be relaxed.
          const elsewhere = await requestJson<CreatedProject>(webUrl, '/api/projects', {
            body: {
              designSystemId: null,
              id: randomUUID(),
              metadata: { kind: 'prototype' },
              name: 'Bound to the other workspace',
              pendingPrompt: null,
              skillId: null,
            },
            headers: workspaceHeaders(OTHER),
            method: 'POST',
          });
          expect((await readScope(webUrl, elsewhere.project.id)).workspaceId).toBe(
            OTHER.workspaceId,
          );

          const foreignBound = await post(
            webUrl,
            `/api/projects/${elsewhere.project.id}/duplicate`,
            undefined,
            { name: 'Headerless duplicate of another workspace' },
          );
          expect(
            foreignBound.status,
            'a headerless caller has no standing over a project bound elsewhere',
          ).toBe(400);
          expect(foreignBound.text).toContain('WORKSPACE_CONTEXT_REQUIRED');

          // --- BOUNDARY 2: dropping headers must not be an escalation path. A
          // caller that DOES assert an identity is judged on that assertion, so
          // the fix must not hand the unverifiable caller a route back to 200.
          const forged = await post(webUrl, `/api/projects/${own}/duplicate`, workspaceHeaders({
            workspaceId: 'ws-hdl-forged',
            workspaceMemberId: 'mem-hdl-forged',
          }), { name: 'Forged duplicate' });
          expect(
            forged.status,
            'an asserted identity that cannot be verified is still refused',
          ).not.toBe(200);
        },
        {
          env: {
            AMR_HOME: await emptyAmrHome(suite.scratchDir),
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            VELA_API_URL: authorityUrl,
            VELA_CONTROL_KEY: 'e2e-headerless-control-key',
          },
        },
      );
    },
  );

  // P0 INVARIANT: signed out, VISIBLE <=> UNBOUND <=> MUTABLE — the three are the
  // same set of projects.
  //
  // 「未登录也可以用自己 cli 修改未登录态下的那些 project, 这个一定要保证,
  // 不然就是 P0 事故」
  //
  // A signed-out client can only SEE unbound projects: the no-scope catalog
  // (`routes/project/index.ts:2432-2443`) reads no `x-od-workspace-*` at all and
  // joins through `listUnboundProjects`, so "every unbound (never-claimed) project
  // must be visible (pre-workspace-isolation compatibility) while every project
  // some workspace HAS claimed must not leak to a caller with no identity to check
  // it against" (spec 04 §10). This case pins the other half: everything in that
  // visible set stays WRITABLE while signed out.
  //
  // It holds only because `headerlessMutationAllowed` short-circuits on "no row
  // anywhere" BEFORE it asks for an ambient identity. That ordering is the whole
  // protection, which is why this case is mutation-tested against it rather than
  // written red-first — it passes on the fixed branch by construction.
  test(
    'signed out, a client keeps write access to exactly the projects it can see',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-headerless-mutation-signed-out');

      // No vela session at all — not merely "no headers on the request". The real
      // provider is selected, `readVelaControlApiContext` finds nothing, so
      // `.current()` answers null and the daemon has NO signed-in identity.
      await suite.with.toolsDev(
        async ({ webUrl, runtime }) => {
          // Created in that same signed-out state — the real user sequence.
          const draft = await createHeaderless(webUrl, 'Signed-out local draft');
          expect(
            (await readScope(webUrl, draft)).kind,
            'nothing to bind to while signed out, so the draft stays unbound',
          ).toBe('unbound');

          // Visible in the no-scope catalog...
          const listed = await requestJson<{ projects: Array<{ id: string }> }>(
            webUrl,
            '/api/projects',
          );
          expect(
            listed.projects.some((project) => project.id === draft),
            'an unbound project must be visible to a signed-out client',
          ).toBe(true);

          // ...and therefore writable. Rename, duplicate, and the real CLI.
          expect(
            await patch(webUrl, `/api/projects/${draft}`, undefined, { name: 'Renamed offline' }),
            'a signed-out user must be able to rename their own local draft',
          ).toBe(200);

          const duplicated = await post(webUrl, `/api/projects/${draft}/duplicate`, undefined, {
            name: 'Offline copy',
          });
          expect(
            duplicated.status,
            `a signed-out user must be able to duplicate their own local draft; got ${duplicated.text.slice(0, 200)}`,
          ).toBe(200);

          const cli = await od(`http://127.0.0.1:${runtime.daemonPort}`, [
            'project',
            'duplicate',
            draft,
            '--name',
            'Offline CLI copy',
            '--json',
          ]);
          expect(
            cli.code,
            `od must work signed out: ${cli.stderr || cli.stdout}`,
          ).toBe(0);
        },
        {
          // Deliberately NO VELA_API_URL / VELA_CONTROL_KEY.
          env: {
            AMR_HOME: await emptyAmrHome(suite.scratchDir),
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
          },
        },
      );
    },
  );

  // The dual-track contract, pinned through the real binary rather than by
  // intent. `AGENTS.md` makes `od` the embeddability surface external agents
  // drive Open Design through, and there was no test anywhere exercising a CLI
  // project mutation — which is why a 401 on every CLI-created project shipped
  // to this branch unnoticed.
  test(
    'the real od binary can create a project and then duplicate it',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-headerless-mutation-cli');

      await suite.with.toolsDev(
        async ({ runtime }) => {
          const daemonUrl = `http://127.0.0.1:${runtime.daemonPort}`;

          const created = await od(daemonUrl, [
            'project',
            'create',
            '--name',
            'CLI dual-track project',
            '--json',
          ]);
          expect(created.code, `od project create failed: ${created.stderr}`).toBe(0);
          const projectId = (JSON.parse(created.stdout) as CreatedProject).project.id;

          // `od` attaches no `x-od-workspace-*` headers on this path — only
          // `od workspace …` builds those — so this is the headerless shape by
          // construction, not by test contrivance.
          const duplicated = await od(daemonUrl, [
            'project',
            'duplicate',
            projectId,
            '--name',
            'CLI dual-track copy',
            '--json',
          ]);
          expect(
            duplicated.code,
            `od project duplicate failed: ${duplicated.stderr || duplicated.stdout}`,
          ).toBe(0);
          expect(JSON.parse(duplicated.stdout).project.id).not.toBe(projectId);
        },
        {
          env: {
            AMR_HOME: await emptyAmrHome(suite.scratchDir),
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            VELA_API_URL: authorityUrl,
            VELA_CONTROL_KEY: 'e2e-headerless-control-key',
          },
        },
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
