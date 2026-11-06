// Re-finalization drops the design-system workspaceId claim (issue #6763).
//
// A brand re-finalize drives `registerBrandDesignSystem`'s write path, which
// ends at `updateUserDesignSystem` with an input that carries NO `workspaceId`
// field. That write spreads the existing metadata and, because the metadata
// already lost its claim, REWRITES `metadata.json` WITHOUT the `workspaceId` —
// the "split-brain" state: the `workspace_resources` envelope still binds
// `user:<id>` to a workspace + exact member, but the on-disk metadata no
// longer says so.
//
// Before the fix the READ side trusted the metadata claim alone. `listAll
// DesignSystems` forwarded `workspaceId` into the FS listing, every by-id read
// gated on `metadata.workspaceId`, and the by-id HTTP routes never forwarded
// `workspaceMemberId` to the wrappers at all — so a correctly-bound system
// vanished from the workspace catalog AND from catalog/detail/preview/
// showcase/static reads the moment its metadata lost the claim.
//
// This spec pins the read-side rescue (#6763): when the persisted
// `workspace_resources` binding matches the exact verified scope (workspaceId,
// visibility='personal', resourceState!='deleted',
// createdByWorkspaceMemberId), the ENVELOPE — not the metadata claim — is the
// visibility authority. The write side is intentionally NOT changed:
// `metadata.json` must stay claim-less after re-finalization (asserted below)
// and the catalog/by-id reads must keep serving the bound system anyway.
//
// The by-id negative rows pin the fail-closed contract on the wrappers AND on
// the real HTTP detail route (which now forwards the verified
// `workspaceMemberId` it already resolves for the catalog, so the envelope
// rescue can fire end-to-end): the rescue must never leak the system to
// another workspace, to a memberless scope, or to a signed-out/headerless
// caller, and an ownerless system with no binding stays hidden from every
// positive scope. A metadata-only claim (workspaceId in metadata, no envelope)
// stays hidden from signed-out readers (spec 04 §10).

import type http from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import { workspaceContextFromDirectoryItem } from '../../src/collab/vela-workspace-context.js';
import {
  closeDatabase,
  ensureWorkspaceResource,
  getWorkspaceResource,
  getWorkspaceResourceByResourceId,
  openDatabase,
} from '../../src/db.js';
import * as designSystems from '../../src/design-systems/index.js';
import { createDesignSystemServerServices } from '../../src/design-systems/server-services.js';
import { registerDesignSystemRoutes } from '../../src/routes/design-systems.js';
import * as skills from '../../src/skills.js';

const WORKSPACE_A = 'vp44mftzknedrrqgy05oqpv9';
const WORKSPACE_B = 'jg63to8cbic0kzbczbu95a4g';
const MEMBER_A = 'member-a';
const MEMBER_B = 'member-b';

const SEEDED_BODY = 'A seeded system.';

const roots: string[] = [];
const servers: http.Server[] = [];

afterEach(async () => {
  closeDatabase();
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve) => server.close(() => resolve())),
  ));
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true }),
  ));
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-ds-refinalize-'));
  roots.push(root);
  const userSkills = path.join(root, 'skills');
  const userDesignSystems = path.join(root, 'design-systems');
  const builtInSkills = path.join(root, 'built-in-skills');
  const builtInDesignSystems = path.join(root, 'built-in-design-systems');
  await Promise.all([
    mkdir(userSkills, { recursive: true }),
    mkdir(userDesignSystems, { recursive: true }),
    mkdir(builtInSkills, { recursive: true }),
    mkdir(builtInDesignSystems, { recursive: true }),
  ]);
  const db = openDatabase(root, { dataDir: root });
  const services = createDesignSystemServerServices({
    getDb: () => db,
    roots: {
      SKILL_ROOTS: [userSkills, builtInSkills],
      DESIGN_TEMPLATE_ROOTS: [],
      ALL_SKILL_LIKE_ROOTS: [],
    },
    paths: {
      PROJECTS_DIR: path.join(root, 'projects'),
      DESIGN_SYSTEMS_DIR: builtInDesignSystems,
      USER_DESIGN_SYSTEMS_DIR: userDesignSystems,
    },
    skills: {
      listSkills: skills.listSkills as never,
      findSkillById: skills.findSkillById as never,
    },
    designSystems: designSystems as never,
    projects: {} as never,
  });
  return { root, userDesignSystems, db, services };
}

/** Write a design system directly on disk with the given metadata. */
async function seedSystem(
  userDesignSystems: string,
  dirId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const dir = path.join(userDesignSystems, dirId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'DESIGN.md'), `# ${dirId}\n\n${SEEDED_BODY}\n`, 'utf8');
  await writeFile(path.join(dir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

function bindOwnerlessPersonalSystem(
  db: ReturnType<typeof openDatabase>,
  id: string,
  workspaceId: string,
  memberId: string,
): void {
  ensureWorkspaceResource(db, 'design_system', workspaceId, id, {
    visibility: 'personal',
    resourceState: 'active',
    createdByWorkspaceMemberId: memberId,
    updatedByWorkspaceMemberId: memberId,
  });
}

/** The exact by-id read options the HTTP routes hand to the wrappers. */
function byIdReadOptions(scope: Record<string, string | null>) {
  return {
    workspaceId: scope.workspaceId ?? null,
    workspaceMemberId: scope.workspaceMemberId ?? null,
  };
}

function workspaceHeaders(
  workspaceId: string | null,
  workspaceMemberId: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (workspaceId) headers['x-od-workspace-id'] = workspaceId;
  if (workspaceMemberId) headers['x-od-workspace-member-id'] = workspaceMemberId;
  return headers;
}

async function listen(app: express.Express): Promise<string> {
  const server = await new Promise<http.Server>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  servers.push(server);
  const address = server.address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}

/**
 * The real HTTP detail route (`GET /api/design-systems/:id`) wired to the real
 * server-services catalog/read implementations, so the route-level
 * `workspaceMemberId` forwarding (part of this PR) is proven end-to-end — the
 * service-only tests above cannot see whether the route ever forwards it.
 */
async function createRouteFixture() {
  const fixture = await createFixture();
  const craftDir = path.join(fixture.root, 'craft');
  await mkdir(craftDir, { recursive: true });
  const app = express();
  app.use(express.json());
  registerDesignSystemRoutes(app, {
    db: fixture.db,
    paths: { CRAFT_DIR: craftDir, USER_DESIGN_SYSTEMS_DIR: fixture.userDesignSystems } as never,
    projectFiles: {} as never,
    projectStore: {} as never,
    verifyWorkspaceRequestAuthority: async (req: any) => ({
      ok: true as const,
      context: workspaceContextFromDirectoryItem({
        workspaceId: req.get('x-od-workspace-id'),
        workspaceName: 'Workspace fixture',
        workspaceType: 'team',
        workspaceMemberId: req.get('x-od-workspace-member-id'),
        role: 'owner',
        memberStatus: 'active',
        lifecycleState: 'active',
      }),
    }),
    workspaceResources: {
      getWorkspaceResource: (handle, resourceType, workspaceId, resourceId) =>
        getWorkspaceResource(handle, resourceType, workspaceId, resourceId),
      getWorkspaceResourceByResourceId: (handle, resourceType, resourceId) =>
        getWorkspaceResourceByResourceId(handle, resourceType, resourceId),
    },
    designSystems: {
      buildUserDesignSystemArchive: async () => null,
      canMutateUserDesignSystem: async () => true,
      createUserDesignSystem: async () => {
        throw new Error('unused createUserDesignSystem in route fixture');
      },
      deleteUserDesignSystem: async () => false,
      ensureUserDesignSystemWorkspaceProject: async () => null,
      // The factory's inferred signatures are looser than the strict route-deps
      // types; the runtime behavior is exactly what this test exercises.
      listAllDesignSystems: fixture.services.listAllDesignSystems as never,
      listUserDesignSystemFiles: async () => null,
      listUserDesignSystemRevisions: async () => null,
      prepareDesignTokenContractRebuild: async () => ({ decision: { available: false } }) as never,
      readAvailableDesignSystem: fixture.services.readAvailableDesignSystem as never,
      readAvailableDesignSystemPackageInfo: fixture.services.readAvailableDesignSystemPackageInfo as never,
      readAvailableDesignSystemStaticFile: fixture.services.readAvailableDesignSystemStaticFile as never,
      readDesignSystemWorkspaceTextFile: fixture.services.readDesignSystemWorkspaceTextFile as never,
      readUserDesignSystemFile: async () => null,
      renderDesignSystemPreview: () => '',
      renderDesignSystemShowcase: () => '',
      syncUserDesignSystemAssetsFromWorkspace: async () => ({ ok: false, reason: 'not-found' }),
      unshareTeamDesignSystemIfShared: async () => false,
      updateUserDesignSystem: async () => null,
      updateUserDesignSystemRevisionStatus: async () => null,
    },
    generationJobs: {
      get: () => null,
      rebuildTokenContract: () => ({}) as never,
      revise: () => ({}) as never,
      start: () => ({}) as never,
    },
  });
  const baseUrl = await listen(app);
  return { ...fixture, baseUrl };
}

describe('re-finalize workspaceId-drop: read-side rescue (issue #6763)', () => {
  it('lists an ownerless-but-envelope-bound system only for its exact workspace member', async () => {
    const fixture = await createFixture();
    await seedSystem(fixture.userDesignSystems, 'x', { title: 'Bound but ownerless' });
    bindOwnerlessPersonalSystem(fixture.db, 'user:x', WORKSPACE_A, MEMBER_A);

    const scoped = await fixture.services.listAllDesignSystems({
      workspaceId: WORKSPACE_A,
      workspaceMemberId: MEMBER_A,
    });
    expect(scoped.some((system) => system.id === 'user:x')).toBe(true);

    const otherWorkspace = await fixture.services.listAllDesignSystems({
      workspaceId: WORKSPACE_B,
      workspaceMemberId: MEMBER_B,
    });
    expect(otherWorkspace.some((system) => system.id === 'user:x')).toBe(false);

    const memberless = await fixture.services.listAllDesignSystems({
      workspaceId: WORKSPACE_A,
    });
    expect(memberless.some((system) => system.id === 'user:x')).toBe(false);

    const signedOut = await fixture.services.listAllDesignSystems({
      workspaceId: null,
      workspaceMemberId: null,
    });
    expect(signedOut.some((system) => system.id === 'user:x')).toBe(false);
  });

  it('serves an ownerless-but-envelope-bound system by id for its exact workspace member', async () => {
    const fixture = await createFixture();
    await seedSystem(fixture.userDesignSystems, 'x', { title: 'Bound but ownerless' });
    bindOwnerlessPersonalSystem(fixture.db, 'user:x', WORKSPACE_A, MEMBER_A);

    // No project is seeded, so the by-id rescue must come from the FS copy,
    // not from a `ds-*` workspace project serving DESIGN.md.
    await expect(
      fixture.services.readAvailableDesignSystem(
        'user:x',
        byIdReadOptions({ workspaceId: WORKSPACE_A, workspaceMemberId: MEMBER_A }),
      ),
    ).resolves.toContain(SEEDED_BODY);
  });

  it('keeps the bound system hidden from other-workspace, memberless, and signed-out by-id reads', async () => {
    const fixture = await createFixture();
    await seedSystem(fixture.userDesignSystems, 'x', { title: 'Bound but ownerless' });
    bindOwnerlessPersonalSystem(fixture.db, 'user:x', WORKSPACE_A, MEMBER_A);

    await expect(
      fixture.services.readAvailableDesignSystem(
        'user:x',
        byIdReadOptions({ workspaceId: WORKSPACE_B, workspaceMemberId: MEMBER_B }),
      ),
    ).resolves.toBeNull();

    await expect(
      fixture.services.readAvailableDesignSystem(
        'user:x',
        byIdReadOptions({ workspaceId: WORKSPACE_A, workspaceMemberId: null }),
      ),
    ).resolves.toBeNull();

    await expect(
      fixture.services.readAvailableDesignSystem(
        'user:x',
        byIdReadOptions({ workspaceId: null, workspaceMemberId: null }),
      ),
    ).resolves.toBeNull();
  });

  it('keeps an ownerless system with NO binding hidden from the scoped catalog and by-id', async () => {
    const fixture = await createFixture();
    await seedSystem(fixture.userDesignSystems, 'unbound', { title: 'Unbound ownerless' });

    const scoped = await fixture.services.listAllDesignSystems({
      workspaceId: WORKSPACE_A,
      workspaceMemberId: MEMBER_A,
    });
    expect(scoped.some((system) => system.id === 'user:unbound')).toBe(false);

    await expect(
      fixture.services.readAvailableDesignSystem(
        'user:unbound',
        byIdReadOptions({ workspaceId: WORKSPACE_A, workspaceMemberId: MEMBER_A }),
      ),
    ).resolves.toBeNull();
  });

  it('keeps a metadata-only claim (no envelope) out of the signed-out catalog (spec 04 §10)', async () => {
    const fixture = await createFixture();
    await seedSystem(fixture.userDesignSystems, 'metadata-only', {
      title: 'Claim only',
      workspaceId: WORKSPACE_A,
    });

    const signedOut = await fixture.services.listAllDesignSystems({
      workspaceId: null,
      workspaceMemberId: null,
    });
    expect(signedOut.some((system) => system.id === 'user:metadata-only')).toBe(false);
  });

  it('models re-finalize: metadata stays claim-less but the bound system stays reachable (idempotent)', async () => {
    const fixture = await createFixture();
    await seedSystem(fixture.userDesignSystems, 'x', { title: 'Bound but ownerless' });
    bindOwnerlessPersonalSystem(fixture.db, 'user:x', WORKSPACE_A, MEMBER_A);

    const assertPostUpdate = async () => {
      const metadata = JSON.parse(
        await readFile(path.join(fixture.userDesignSystems, 'x', 'metadata.json'), 'utf8'),
      ) as Record<string, unknown>;
      expect(metadata.workspaceId).toBeUndefined();

      const scoped = await fixture.services.listAllDesignSystems({
        workspaceId: WORKSPACE_A,
        workspaceMemberId: MEMBER_A,
      });
      expect(scoped.some((system) => system.id === 'user:x')).toBe(true);

      await expect(
        fixture.services.readAvailableDesignSystem(
          'user:x',
          byIdReadOptions({ workspaceId: WORKSPACE_A, workspaceMemberId: MEMBER_A }),
        ),
      ).resolves.toContain('ClawdIA');
    };

    const updated = await designSystems.updateUserDesignSystem(
      fixture.userDesignSystems,
      'user:x',
      { title: 'ClawdIA' },
    );
    expect(updated?.title).toBe('ClawdIA');
    await assertPostUpdate();

    await designSystems.updateUserDesignSystem(
      fixture.userDesignSystems,
      'user:x',
      { title: 'ClawdIA' },
    );
    await assertPostUpdate();
  });

  it('serves the bound system over the real HTTP detail route only to its exact member (member forwarding)', async () => {
    const fixture = await createRouteFixture();
    await seedSystem(fixture.userDesignSystems, 'x', { title: 'Bound but ownerless' });
    bindOwnerlessPersonalSystem(fixture.db, 'user:x', WORKSPACE_A, MEMBER_A);

    const exactMember = await fetch(
      `${fixture.baseUrl}/api/design-systems/${encodeURIComponent('user:x')}`,
      { headers: workspaceHeaders(WORKSPACE_A, MEMBER_A) },
    );
    expect(exactMember.status).toBe(200);
    const detail = await exactMember.json() as { designSystem?: { body?: string } };
    expect(detail.designSystem?.body).toContain(SEEDED_BODY);

    const otherWorkspace = await fetch(
      `${fixture.baseUrl}/api/design-systems/${encodeURIComponent('user:x')}`,
      { headers: workspaceHeaders(WORKSPACE_B, MEMBER_B) },
    );
    expect(otherWorkspace.status).toBe(403);

    const memberless = await fetch(
      `${fixture.baseUrl}/api/design-systems/${encodeURIComponent('user:x')}`,
      { headers: workspaceHeaders(WORKSPACE_A, null) },
    );
    expect(memberless.status).toBe(400);

    const headerless = await fetch(
      `${fixture.baseUrl}/api/design-systems/${encodeURIComponent('user:x')}`,
    );
    expect(headerless.status).toBe(400);
  });
});
