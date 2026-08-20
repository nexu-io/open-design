// @vitest-environment node

// `reconcileUnboundProjectBeforeMutation` (apps/daemon/src/routes/project/index.ts)
// may claim a project this daemon has never bound to ANY workspace into the
// current mutating request's workspace (recvqbhor3pai2, "复制的项目再次复制").
// The mutation gate now treats a resource no workspace has claimed the same
// whether the caller identifies itself or omits headers: it remains outside the
// workspace isolation regime. The reconciliation helper still owns the separate
// persistence decision described below.
//
// Workspace headers are not authentication credentials at this daemon-local
// boundary. A complete pair selects local namespace/authorship attribution; it
// does not synchronously consult Vela. The resolver therefore has two outcomes
// and no daemon-global fallback:
//
//   1. complete identity asserted -> claim that exact local scope
//   2. nothing asserted           -> write nothing
//
// Case 3 deliberately remains unbound. This helper runs immediately before
// `enforceWorkspaceResourceMutation`, whose HEADERLESS branch reads
// `getWorkspaceResourceByResourceId` and answers 401 WORKSPACE_CONTEXT_REQUIRED
// as soon as ANY row exists. Claiming on a headerless request would therefore
// turn today's working headerless duplicate into a 401 — a new failure on a path
// that works now. Pinned below.
//
// Assertions primarily target the persisted binding returned by
// `GET /api/projects/:id/workspace-scope` and prove that remote availability
// never changes the local attribution result.
//
// Runs with `OD_WORKSPACE_CONTEXT_SOURCE=vela` so the membership authority is
// live, seeded only through the daemon's real vela integration against a
// temporary server-level mock. No source-level backdoor.

import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { requestJson } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

type ProjectWorkspaceScope = {
  kind: 'unbound' | 'unavailable' | 'personal' | 'team';
  projectId: string;
  workspaceId: string | null;
  visibility?: 'personal' | 'team';
};

type CreatedProject = { conversationId: string; project: { id: string } };
type WorkspaceProjectsBody = {
  projects: Array<{ id: string; createdByWorkspaceMemberId: string | null }>;
};

/** An active membership the mock directory really lists. */
const MEMBER = {
  workspaceId: 'ws-rec-personal',
  workspaceName: 'Reconcile personal',
  workspaceType: 'personal' as const,
  workspaceMemberId: 'mem-rec-personal',
  role: 'owner' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
};

/** A workspace/member pair the signed-in identity has NO membership in. */
const FOREIGN = {
  workspaceId: 'ws-rec-foreign',
  workspaceMemberId: 'mem-rec-foreign',
};

/** `/api/v1/workspaces` is the only authority used by these data-plane tests. */
function startDirectoryMock(options: {
  directoryStatus?: number;
}): Promise<{
  url: string;
  close: () => Promise<void>;
  setDirectoryStatus: (status: number) => void;
}> {
  let directoryStatus = options.directoryStatus ?? 200;
  const server: Server = createServer((req, res) => {
    const url = req.url ?? '';
    if (url.startsWith('/api/v1/workspaces')) {
      const status = directoryStatus;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(status === 200 ? { items: [MEMBER] } : { error: 'authority down' }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address == null || typeof address === 'string') throw new Error('mock has no port');
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
        setDirectoryStatus: (status) => {
          directoryStatus = status;
        },
      });
    });
  });
}

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

/** An unbound project: a headerless legacy create carries no durable scope. */
async function createUnboundProject(webUrl: string, name: string): Promise<string> {
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

async function readScope(
  webUrl: string,
  projectId: string,
  headers?: Record<string, string>,
): Promise<ProjectWorkspaceScope> {
  const body = await requestJson<{ scope: ProjectWorkspaceScope }>(
    webUrl,
    `/api/projects/${encodeURIComponent(projectId)}/workspace-scope`,
    headers ? { headers } : {},
  );
  return body.scope;
}

/**
 * Drive a mutation that runs `reconcileUnboundProjectBeforeMutation` on its
 * SOURCE project. Status-agnostic on purpose — see the file header.
 */
async function mutate(
  webUrl: string,
  path: string,
  headers: Record<string, string> | undefined,
  body: unknown,
): Promise<number> {
  const response = await fetch(new URL(path, webUrl), {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    method: 'POST',
  });
  return response.status;
}

const duplicatePath = (id: string) => `/api/projects/${encodeURIComponent(id)}/duplicate`;
const designSystemCopyPath = (id: string) =>
  `/api/projects/${encodeURIComponent(id)}/design-system-copy`;

type DirectoryMock = Awaited<ReturnType<typeof startDirectoryMock>>;

let readableAuthority: DirectoryMock;
let unreadableAuthority: DirectoryMock;
let selectionAuthority: DirectoryMock;

beforeAll(async () => {
  readableAuthority = await startDirectoryMock({});
  unreadableAuthority = await startDirectoryMock({ directoryStatus: 500 });
  selectionAuthority = await startDirectoryMock({});
});

afterAll(async () => {
  await Promise.all([
    readableAuthority.close(),
    unreadableAuthority.close(),
    selectionAuthority.close(),
  ]);
});

describe('reconciling an unbound project uses explicit local attribution', () => {
  test(
    'a complete workspace/member pair becomes the claim through either entry point',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-reconcile-forged-claim');

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          // --- CASE 1: duplicate under an explicit local namespace.
          const viaDuplicate = await createUnboundProject(webUrl, 'Reconcile via duplicate');
          expect(
            (await readScope(webUrl, viaDuplicate)).kind,
            'precondition: the source project is a true orphan',
          ).toBe('unbound');

          expect(
            await mutate(webUrl, duplicatePath(viaDuplicate), workspaceHeaders(FOREIGN), {
              name: 'Explicitly attributed duplicate',
            }),
            'local attribution must not depend on directory membership',
          ).toBe(200);

          const duplicateScope = await readScope(webUrl, viaDuplicate);
          expect(duplicateScope.workspaceId).toBe(FOREIGN.workspaceId);
          expect(duplicateScope.kind).toBe('personal');

          // --- CASE 2: design-system copy, the other reachable entry point.
          const viaCopy = await createUnboundProject(webUrl, 'Reconcile via ds copy');
          expect((await readScope(webUrl, viaCopy)).kind).toBe('unbound');

          expect(
            await mutate(webUrl, designSystemCopyPath(viaCopy), workspaceHeaders(FOREIGN), {
              name: 'Explicitly attributed copy',
            }),
          ).toBe(200);

          const copyScope = await readScope(webUrl, viaCopy);
          expect(copyScope.workspaceId).toBe(FOREIGN.workspaceId);
          expect(copyScope.kind).toBe('personal');

          // --- CASE 3: a pair also present in the directory has identical local
          // attribution semantics.
          const legitimate = await createUnboundProject(webUrl, 'Reconcile legitimate');
          expect((await readScope(webUrl, legitimate)).kind).toBe('unbound');

          const status = await mutate(
            webUrl,
            duplicatePath(legitimate),
            workspaceHeaders(MEMBER),
            { name: 'Legitimate duplicate' },
          );
          expect(status, 'a verified caller must not be refused').toBe(200);

          const legitimateScope = await readScope(
            webUrl,
            legitimate,
            workspaceHeaders(MEMBER),
          );
          expect(legitimateScope.kind).toBe('personal');
          expect(legitimateScope.workspaceId).toBe(MEMBER.workspaceId);

          // Authorship is persisted from the complete explicit pair.
          const listed = await requestJson<WorkspaceProjectsBody>(
            webUrl,
            `/api/workspaces/${encodeURIComponent(MEMBER.workspaceId)}/projects`,
            { headers: workspaceHeaders(MEMBER) },
          );
          const claimed = listed.projects.find((project) => project.id === legitimate);
          expect(claimed?.createdByWorkspaceMemberId).toBe(MEMBER.workspaceMemberId);

          // --- CASE 4: a request that asserts NOTHING must leave the binding
          // alone, and must keep working. This helper's headerless branch is only
          // reachable where the daemon has no ambient workspace, because #6201's
          // create-side binding otherwise claims the project at creation — see
          // the separate finding in the PR body about headerless mutations of a
          // BOUND project.
          const headerless = await createUnboundProject(webUrl, 'Reconcile headerless');
          expect((await readScope(webUrl, headerless)).kind).toBe('unbound');

          const headerlessStatus = await mutate(
            webUrl,
            duplicatePath(headerless),
            undefined,
            { name: 'Headerless duplicate' },
          );
          expect(headerlessStatus, 'a headerless duplicate of an orphan must keep working').toBe(200);
          expect(
            (await readScope(webUrl, headerless)).kind,
            'nothing was asserted, so nothing may be claimed — a claim here would make the '
              + 'gate\'s headerless branch answer 401 on the next mutation',
          ).toBe('unbound');
        },
        {
          env: {
            AMR_HOME: await emptyAmrHome(suite.scratchDir),
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            VELA_API_URL: readableAuthority.url,
            VELA_CONTROL_KEY: 'e2e-reconcile-control-key',
          },
        },
      );
    },
  );

  test(
    'an explicit request scope outranks a validated navigation switch',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-reconcile-selection-isolation');

      // A left-rail switch validates a tab-local selection. It must not become
      // daemon-global project authority, even when a later request asserts a
      // different, unverifiable pair.
      await suite.with.toolsDev(
        async ({ webUrl }) => {
          const orphan = await createUnboundProject(webUrl, 'Selection-isolated orphan');
          expect(
            (await readScope(webUrl, orphan)).kind,
            'precondition: this must be a true orphan',
          ).toBe('unbound');

          const switched = await fetch(new URL('/api/workspace/active', webUrl), {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              workspaceId: MEMBER.workspaceId,
              workspaceMemberId: MEMBER.workspaceMemberId,
            }),
          });
          expect(switched.status).toBe(200);

          // The next request explicitly attributes the orphan elsewhere.
          await mutate(webUrl, duplicatePath(orphan), workspaceHeaders(FOREIGN), {
            name: 'Duplicate asserting an unverifiable pair',
          });

          const after = await readScope(webUrl, orphan);
          expect(after.workspaceId).toBe(FOREIGN.workspaceId);
          expect(
            after.workspaceId,
            'nor may the tab selection be written onto a pre-existing orphan',
          ).not.toBe(MEMBER.workspaceId);
          expect(after.kind).toBe('personal');
        },
        {
          env: {
            AMR_HOME: await emptyAmrHome(suite.scratchDir),
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            VELA_API_URL: selectionAuthority.url,
            VELA_CONTROL_KEY: 'e2e-reconcile-control-key',
          },
        },
      );
    },
  );

  test(
    'an unreadable membership authority does not block local attribution',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-reconcile-authority-down');

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          const project = await createUnboundProject(webUrl, 'Reconcile authority down');
          expect((await readScope(webUrl, project)).kind).toBe('unbound');

          // The asserted pair is written locally even though the directory is
          // down; cloud operations will authorize separately when attempted.
          await mutate(webUrl, duplicatePath(project), workspaceHeaders(MEMBER), {
            name: 'Duplicate during outage',
          });

          const scope = await readScope(webUrl, project);
          expect(scope.workspaceId).toBe(MEMBER.workspaceId);
          expect(scope.kind).toBe('personal');
        },
        {
          env: {
            AMR_HOME: await emptyAmrHome(suite.scratchDir),
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            VELA_API_URL: unreadableAuthority.url,
            VELA_CONTROL_KEY: 'e2e-reconcile-control-key',
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
