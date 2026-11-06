// @vitest-environment node

// An unbound project is attributed only after the exact claimed membership is
// verified. Unknown pairs and authority outages must leave it unbound; a tab's
// active selection is never a fallback. Headerless local requests remain
// unbound and usable. The real daemon/SQLite paths are exercised below.

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
  context?: { workspaceMemberId: string } | null;
};

type CreatedProject = { conversationId: string; project: { id: string } };

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

describe('reconciling an unbound project requires verified attribution', () => {
  test(
    'unverified pairs leave projects unbound through both copy entry points',
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
            'an unverified pair must not claim local data',
          ).toBe(403);

          const duplicateScope = await readScope(webUrl, viaDuplicate);
          expect(duplicateScope.workspaceId).toBeNull();
          expect(duplicateScope.kind).toBe('unbound');

          // --- CASE 2: design-system copy, the other reachable entry point.
          const viaCopy = await createUnboundProject(webUrl, 'Reconcile via ds copy');
          expect((await readScope(webUrl, viaCopy)).kind).toBe('unbound');

          expect(
            await mutate(webUrl, designSystemCopyPath(viaCopy), workspaceHeaders(FOREIGN), {
              name: 'Explicitly attributed copy',
            }),
          ).toBe(403);

          const copyScope = await readScope(webUrl, viaCopy);
          expect(copyScope.workspaceId).toBeNull();
          expect(copyScope.kind).toBe('unbound');

          // --- CASE 3: a verified pair can persist its exact local attribution.
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

          // The scope endpoint derives this member from the persisted row,
          // without introducing the unrelated remote team-project catalog.
          expect(legitimateScope.context?.workspaceMemberId).toBe(MEMBER.workspaceMemberId);

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
    'neither an unverified request nor a navigation switch can claim an orphan',
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
          expect(after.workspaceId).toBeNull();
          expect(
            after.workspaceId,
            'nor may the tab selection be written onto a pre-existing orphan',
          ).not.toBe(MEMBER.workspaceId);
          expect(after.kind).toBe('unbound');
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
    'unreadable membership authority leaves a project unbound',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-reconcile-authority-down');

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          const project = await createUnboundProject(webUrl, 'Reconcile authority down');
          expect((await readScope(webUrl, project)).kind).toBe('unbound');

          // An unavailable authority cannot supply a new binding witness.
          expect(await mutate(webUrl, duplicatePath(project), workspaceHeaders(MEMBER), {
            name: 'Duplicate during outage',
          })).toBe(503);

          const scope = await readScope(webUrl, project);
          expect(scope.workspaceId).toBeNull();
          expect(scope.kind).toBe('unbound');
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
