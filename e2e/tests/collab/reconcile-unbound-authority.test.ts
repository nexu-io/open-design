// @vitest-environment node

// `reconcileUnboundProjectBeforeMutation` (apps/daemon/src/routes/project/index.ts)
// may claim a project this daemon has never bound to ANY workspace into the
// current mutating request's workspace (recvqbhor3pai2, "复制的项目再次复制").
// The mutation gate now treats a resource no workspace has claimed the same
// whether the caller identifies itself or omits headers: it remains outside the
// workspace isolation regime. The reconciliation helper still owns the separate
// persistence decision described below.
//
// It resolved that workspace from `workspaceProjectContextFromRequest(req)` —
// header PARSING with no authority check — and stamped
// `createdByWorkspaceMemberId: ctx.workspaceMemberId` from the same headers.
// `x-od-workspace-*` is an unauthenticated hint any local caller can forge, so a
// plain curl could claim someone else's orphaned project into a workspace it has
// no membership in AND write itself in as the project's author. Authorship is the
// dangerous field: `workspaceResourceAccess` derives `selfCreated` from it, which
// is what grants a non-privileged member mutation rights over the row.
//
// Same three-way shape #6201 established for created projects, via the same
// `createCreatedProjectWorkspaceResolver`:
//
//   1. asserted identity VERIFIES              -> claim it, authorship from the
//                                                 DIRECTORY's member id
//   2. asserted identity does NOT verify       -> never write that claim; use the
//      (foreign, inactive, or unconfirmable      daemon's ambient workspace, whose
//      because the authority is unreadable)      member id is its own verified
//                                                 session, else write nothing
//   3. nothing asserted                        -> write nothing (see below)
//
// Case 3 deliberately does NOT claim into the ambient workspace, unlike
// `createdProjectWorkspaceHome`'s third branch. This helper runs immediately
// before `enforceWorkspaceResourceMutation`, whose HEADERLESS branch reads
// `getWorkspaceResourceByResourceId` and answers 401 WORKSPACE_CONTEXT_REQUIRED
// as soon as ANY row exists. Claiming on a headerless request would therefore
// turn today's working headerless duplicate into a 401 — a new failure on a path
// that works now. Pinned below.
//
// Assertions primarily target the PERSISTED BINDING
// (`GET /api/projects/:id/workspace-scope`). The forged-header duplicate also
// pins the gate's newly explicit 200 result: allowing the operation and
// persisting the asserted identity are separate decisions. The security property
// is that no unverifiable claim is ever written.
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

/**
 * `/api/v1/workspaces` is the membership directory. `/api/v1/workspaces/current`
 * decides whether the daemon ends up with an AMBIENT workspace at all:
 *   - 401 -> "signed out at the vela layer", provider returns null, ambient absent.
 *   - 403 `missing_principal` -> provider picks a default from the directory,
 *     so ambient is present.
 */
function startDirectoryMock(options: {
  directoryStatus?: number;
  currentStatus: 401 | 403;
}): Promise<{
  url: string;
  close: () => Promise<void>;
  /** Flip `/current` so a test can move the daemon from "no ambient" to "ambient". */
  setCurrentStatus: (status: 401 | 403) => void;
}> {
  let currentStatus = options.currentStatus;
  const server: Server = createServer((req, res) => {
    const url = req.url ?? '';
    if (url.startsWith('/api/v1/workspaces/current')) {
      res.writeHead(currentStatus, { 'content-type': 'application/json' });
      res.end(JSON.stringify(currentStatus === 403 ? { error: 'missing_principal' } : { error: 'unauthorized' }));
      return;
    }
    if (url.startsWith('/api/v1/workspaces')) {
      const status = options.directoryStatus ?? 200;
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
        setCurrentStatus: (status) => {
          currentStatus = status;
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

/** An unbound project: created headerless while the daemon has no ambient workspace. */
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

async function readScope(webUrl: string, projectId: string): Promise<ProjectWorkspaceScope> {
  const body = await requestJson<{ scope: ProjectWorkspaceScope }>(
    webUrl,
    `/api/projects/${encodeURIComponent(projectId)}/workspace-scope`,
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
/** Directory readable, and `/current` flippable so a test can move the daemon
 *  from "no ambient" to "ambient" between two phases. */
let ambientAuthority: DirectoryMock;

beforeAll(async () => {
  readableAuthority = await startDirectoryMock({ currentStatus: 401 });
  unreadableAuthority = await startDirectoryMock({ currentStatus: 401, directoryStatus: 500 });
  // Starts WITHOUT ambient so a true orphan can be created, then flips.
  ambientAuthority = await startDirectoryMock({ currentStatus: 401 });
});

afterAll(async () => {
  await Promise.all([
    readableAuthority.close(),
    unreadableAuthority.close(),
    ambientAuthority.close(),
  ]);
});

describe('reconciling an unbound project verifies the asserted workspace first', () => {
  test(
    'a forged workspace/member pair never becomes a claim, through either entry point',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-reconcile-forged-claim');

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          // --- CASE 1: duplicate, asserting a workspace the caller has no
          // membership in.
          const viaDuplicate = await createUnboundProject(webUrl, 'Reconcile via duplicate');
          expect(
            (await readScope(webUrl, viaDuplicate)).kind,
            'precondition: the source project is a true orphan',
          ).toBe('unbound');

          // The mutation itself is now ALLOWED, and that outcome is pinned rather
          // than left unspecified. A resource no workspace has claimed sits
          // outside the isolation regime ("no retroactive tagging"), so
          // `enforceWorkspaceResourceMutation` no longer refuses a caller for
          // identifying itself when it would have allowed the same caller with no
          // headers at all — see `apps/daemon/tests/collab/
          // workspace-resource-mutation.test.ts`. Nothing is escalated: dropping
          // the headers was always the permissive path, so the forged pair buys
          // access it already had.
          //
          // What must NOT change is the assertion below: the forged claim is
          // still never PERSISTED. Permitting a copy of an orphan and adopting
          // the orphan are different acts, and only the first one happens.
          expect(
            await mutate(webUrl, duplicatePath(viaDuplicate), workspaceHeaders(FOREIGN), {
              name: 'Forged duplicate',
            }),
            'an unbound resource is mutable by an asserted identity, exactly as by a headerless one',
          ).toBe(200);

          const duplicateScope = await readScope(webUrl, viaDuplicate);
          expect(
            duplicateScope.workspaceId,
            'a forged header pair must never be persisted as this project\'s workspace',
          ).not.toBe(FOREIGN.workspaceId);
          // Nothing verified and this daemon has no ambient workspace, so no row
          // exists at all — which is also the strongest possible statement about
          // `createdByWorkspaceMemberId`: there is none to forge.
          expect(duplicateScope.kind).toBe('unbound');

          // --- CASE 2: design-system copy, the other reachable entry point.
          const viaCopy = await createUnboundProject(webUrl, 'Reconcile via ds copy');
          expect((await readScope(webUrl, viaCopy)).kind).toBe('unbound');

          await mutate(webUrl, designSystemCopyPath(viaCopy), workspaceHeaders(FOREIGN), {
            name: 'Forged copy',
          });

          const copyScope = await readScope(webUrl, viaCopy);
          expect(
            copyScope.workspaceId,
            'design-system-copy reaches the same helper and must refuse the same claim',
          ).not.toBe(FOREIGN.workspaceId);
          expect(copyScope.kind).toBe('unbound');

          // --- CASE 4: a legitimate, directory-confirmed identity still claims,
          // so the recvqbhor3pai2 fix this helper exists for keeps working.
          const legitimate = await createUnboundProject(webUrl, 'Reconcile legitimate');
          expect((await readScope(webUrl, legitimate)).kind).toBe('unbound');

          const status = await mutate(
            webUrl,
            duplicatePath(legitimate),
            workspaceHeaders(MEMBER),
            { name: 'Legitimate duplicate' },
          );
          expect(status, 'a verified caller must not be refused').toBe(200);

          const legitimateScope = await readScope(webUrl, legitimate);
          expect(legitimateScope.kind).toBe('personal');
          expect(legitimateScope.workspaceId).toBe(MEMBER.workspaceId);

          // --- CASE 6: authorship comes from the AUTHORITY, not the header. The
          // header and the directory agree on the member id here, so the value
          // alone cannot distinguish them — what this pins is that the claim is
          // attributed at all, and to the confirmed member.
          const listed = await requestJson<WorkspaceProjectsBody>(
            webUrl,
            `/api/workspaces/${encodeURIComponent(MEMBER.workspaceId)}/projects`,
            { headers: workspaceHeaders(MEMBER) },
          );
          const claimed = listed.projects.find((project) => project.id === legitimate);
          expect(claimed?.createdByWorkspaceMemberId).toBe(MEMBER.workspaceMemberId);

          // --- CASE 5: a request that asserts NOTHING must leave the binding
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
    'a populated but DIFFERENT ambient workspace is not written onto an existing orphan',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-reconcile-ambient-mismatch');

      // The state-integrity case. Unlike the fixtures above, this daemon HAS an
      // ambient workspace (`/current` answers 403 missing_principal, so the
      // provider bootstraps a default from the directory).
      //
      // A pre-existing orphan is not a new project. Binding a NEW project to the
      // ambient workspace takes nothing from anyone — that is #6201 and it is
      // right. Binding an EXISTING orphan there, because someone asserted an
      // identity that could not be verified, may take it from the workspace it
      // actually belongs to. Worse, it is sticky: this helper's own
      // `getWorkspaceProjectByProjectId` guard means the rightful verified
      // workspace can never reconcile it afterwards. Creation and reconciliation
      // are not the same risk.
      //
      // So a degraded (ambient) authority may only be persisted when it names
      // the very pair that was asserted — outage continuity for a legitimate
      // caller whose client is on the same workspace the daemon resolved — and
      // otherwise nothing is written at all.
      await suite.with.toolsDev(
        async ({ webUrl }) => {
          // PHASE 1 — no ambient yet, so a headerless create leaves a true orphan
          // (#6201's create-side binding has nothing to bind to).
          ambientAuthority.setCurrentStatus(401);
          const orphan = await createUnboundProject(webUrl, 'Ambient mismatch orphan');
          expect(
            (await readScope(webUrl, orphan)).kind,
            'precondition: this must be a true orphan',
          ).toBe('unbound');

          // PHASE 2 — the daemon now resolves an ambient workspace. Reading
          // `/api/workspace/context` drives `.current()`, which is what populates
          // the `lastKnown()` cache the resolver degrades to, so this is
          // deterministic rather than waiting on a poll tick.
          ambientAuthority.setCurrentStatus(403);
          const ambientContext = await waitForAmbientWorkspace(webUrl);
          expect(
            ambientContext,
            'precondition: the daemon must now have an ambient workspace to degrade to',
          ).toBe(MEMBER.workspaceId);

          // Asserts a pair the directory does NOT list. Verification fails, so the
          // resolver degrades to ambient — which is a REAL workspace here, and a
          // different one from what was asserted.
          await mutate(webUrl, duplicatePath(orphan), workspaceHeaders(FOREIGN), {
            name: 'Duplicate asserting an unverifiable pair',
          });

          const after = await readScope(webUrl, orphan);
          expect(
            after.workspaceId,
            'the unverifiable assertion must not be persisted',
          ).not.toBe(FOREIGN.workspaceId);
          expect(
            after.workspaceId,
            'nor may the ambient workspace be written onto a pre-existing orphan it was never asserted for',
          ).not.toBe(MEMBER.workspaceId);
          expect(
            after.kind,
            'the orphan stays unbound so the rightful workspace can still reconcile it',
          ).toBe('unbound');
        },
        {
          env: {
            AMR_HOME: await emptyAmrHome(suite.scratchDir),
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            VELA_API_URL: ambientAuthority.url,
            VELA_CONTROL_KEY: 'e2e-reconcile-control-key',
          },
        },
      );
    },
  );

  test(
    'an unreadable membership authority cannot confirm a claim, so none is written',
    { timeout: 300_000 },
    async () => {
      const suite = await createSmokeSuite('collab-reconcile-authority-down');

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          const project = await createUnboundProject(webUrl, 'Reconcile authority down');
          expect((await readScope(webUrl, project)).kind).toBe('unbound');

          // The asserted pair is the LEGITIMATE one from the directory — but the
          // directory is down, so nothing can confirm it. "Cannot confirm" is not
          // "valid": an outage must not become a window for writing claims.
          await mutate(webUrl, duplicatePath(project), workspaceHeaders(MEMBER), {
            name: 'Duplicate during outage',
          });

          const scope = await readScope(webUrl, project);
          expect(scope.workspaceId).not.toBe(MEMBER.workspaceId);
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
 * Drive `.current()` until the daemon reports an ambient workspace, and return
 * its id. `GET /api/workspace/context` calls the provider directly, so this both
 * observes and populates the `lastKnown()` cache.
 */
async function waitForAmbientWorkspace(webUrl: string): Promise<string | null> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const body = await requestJson<{ context: { workspaceId?: string } | null }>(
      webUrl,
      '/api/workspace/context',
    );
    const workspaceId = body.context?.workspaceId;
    if (typeof workspaceId === 'string' && workspaceId) return workspaceId;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
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
