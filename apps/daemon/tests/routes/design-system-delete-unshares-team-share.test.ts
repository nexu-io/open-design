// spec 04 §11: before this fix, `DELETE /api/design-systems/:id` only ever
// called `deleteUserDesignSystem` (rm -rf the canonical directory) +
// `deleteWorkspaceResourceByResourceId` — it never called
// `designSystemsTeamShare.unshare`, the same "remove from the hub index"
// function the dedicated unshare route (`routes/team-resource-share.ts`)
// already uses. `canMutateUserDesignSystem`'s permission gate reads
// `isTeamSyncedUserDesignSystem`, which is true ONLY on a teammate's PULLED
// copy — the sharer deleting their OWN original always reads
// `teamSynced: false`, so the delete sailed straight through with the hub
// index left dangling, and every teammate's `syncSharedTeamDesignSystem`
// kept re-stamping `markTeamSynced()` onto their already-synced local copy
// forever (since the hub never stopped reporting the resource as shared).
//
// This spec drives the REAL `registerDesignSystemRoutes` DELETE handler over
// real HTTP, wired to a REAL `createTeamResourceShareService` whose `run`
// callback holds actual mutable "hub" state (a live shared-resource list),
// not a spy — exactly the `team-resource-share.test.ts` pattern this
// sprint's other specs already use for simulating the Vela CLI hub.
// Assertions check the real state transition (the hub's `shared --json`
// listing losing the entry, and the `remove` command actually being issued)
// rather than "was unshare() called" — the shallow mock-call assertion the
// bug review explicitly ruled insufficient.

import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerDesignSystemRoutes } from '../../src/routes/design-systems.js';
import type { DesignSystemSummary } from '../../src/design-systems/index.js';
import { closeDatabase, openDatabase } from '../../src/db.js';
import {
  createTeamResourceShareService,
  TeamResourceAuthorityUnavailableError,
  unshareIfCurrentlyShared,
  type TeamResourceRequestScope,
} from '../../src/collab/team-resource-share.js';
import type { ResourceHubPrincipal } from '../../src/collab/resource-principal.js';

let server: http.Server | null = null;
let tempDir: string | null = null;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
  }
  closeDatabase();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

function listen(app: express.Express): Promise<string> {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server?.address() as { port: number };
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

const OWNER_PRINCIPAL: ResourceHubPrincipal = {
  memberId: 'wm-owner',
  teamId: 't-1',
  role: 'owner',
  lifecycleState: 'active',
  workspaceType: 'team',
};

const designSystemSummary: DesignSystemSummary = {
  id: 'user:my-brand',
  title: 'My Brand',
  category: 'Custom',
  summary: 'Shared to the team.',
  swatches: [],
  surface: 'web',
  body: '# My Brand',
  source: 'user',
  status: 'draft',
  isEditable: true,
};

/** In-memory stand-in for the Vela CLI resource hub. `shared --json` reads
 *  the live map; `remove` mutates it — the same shape
 *  `team-resource-share.test.ts` already uses to simulate hub-state
 *  transitions, applied here at the HTTP-route boundary instead of the bare
 *  service. */
function fakeHub() {
  // `localId` mirrors what real production's `describeResource` (server.ts)
  // always stamps into `metadata.localId` when it shares a design system —
  // `sharedResources()` prefers that explicit field over decoding it back out
  // of the raw hub id, which is also what makes its scoped-vs-legacy-prefix
  // double-parse (see `team-resource-share.ts`) collapse to ONE record
  // instead of two for a properly-scoped id.
  const resources = new Map<string, { ownerMemberId: string; localId: string; title?: string }>();
  const removeCalls: string[][] = [];

  const run = async (args: string[]): Promise<string> => {
    if (args[0] === 'remove') {
      removeCalls.push(args);
      resources.delete(args[1]!);
      return JSON.stringify({ ok: true });
    }
    if (args[0] === 'shared' && args[1] === '--json') {
      return JSON.stringify({
        resources: [...resources.entries()].map(([id, meta]) => ({
          id,
          kind: 'design_system',
          deletedAt: null,
          ownerMemberId: meta.ownerMemberId,
          metadata: { localId: meta.localId, ...(meta.title ? { title: meta.title } : {}) },
        })),
      });
    }
    throw new Error(`unexpected vela resource args: ${args.join(' ')}`);
  };

  return { resources, removeCalls, run };
}

function registerRoutes(
  app: express.Express,
  opts: {
    hub: ReturnType<typeof fakeHub>;
    canMutate?: (root: string, id: string, req: any) => Promise<boolean>;
    principal?: ResourceHubPrincipal;
    unshareTeamDesignSystemIfShared?: (id: string, req: any) => Promise<boolean>;
  },
) {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-ds-delete-unshare-'));
  const db = openDatabase(tempDir, { dataDir: tempDir });
  const deleteUserDesignSystem = vi.fn(async () => true);
  const scope: TeamResourceRequestScope = {
    principal: opts.principal ?? OWNER_PRINCIPAL,
    canShare: true,
  };
  const designSystemsTeamShare = createTeamResourceShareService({
    kind: 'design_system',
    idPrefix: 'ds',
    resolveDir: () => '/tmp/ds',
    run: opts.hub.run,
    env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
  });
  registerDesignSystemRoutes(app, {
    db,
    paths: {
      CRAFT_DIR: '',
      USER_DESIGN_SYSTEMS_DIR: '',
    } as never,
    projectFiles: {} as never,
    projectStore: {} as never,
    verifyWorkspaceRequestAuthority: async () => {
      throw new Error('unbound fixture must not verify Workspace authority');
    },
    workspaceResources: {
      getWorkspaceResource: () => undefined,
      getWorkspaceResourceByResourceId: () => undefined,
    },
    designSystems: {
      buildUserDesignSystemArchive: async () => null,
      canMutateUserDesignSystem: opts.canMutate ?? (async () => true),
      createUserDesignSystem: async () => designSystemSummary,
      deleteUserDesignSystem,
      ensureUserDesignSystemWorkspaceProject: async () => null,
      listAllDesignSystems: async () => [designSystemSummary],
      listUserDesignSystemFiles: async () => null,
      listUserDesignSystemRevisions: async () => null,
      prepareDesignTokenContractRebuild: async () => ({ decision: { available: false } }) as never,
      readAvailableDesignSystem: async () => null,
      readAvailableDesignSystemPackageInfo: async () => null,
      readAvailableDesignSystemStaticFile: async () => null,
      readDesignSystemWorkspaceTextFile: async () => null,
      readUserDesignSystemFile: async () => null,
      renderDesignSystemPreview: () => '<!doctype html>',
      renderDesignSystemShowcase: () => '<!doctype html>',
      syncUserDesignSystemAssetsFromWorkspace: async () => ({ ok: false, reason: 'not-found' }),
      unshareTeamDesignSystemIfShared:
        opts.unshareTeamDesignSystemIfShared ??
        ((id) => unshareIfCurrentlyShared(designSystemsTeamShare, id, scope)),
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
  return { deleteUserDesignSystem, designSystemsTeamShare, scope };
}

describe('DELETE /api/design-systems/:id unshares from the team hub first', () => {
  it('removes the hub index entry BEFORE the local delete, for the sharer deleting their OWN design system', async () => {
    const hub = fakeHub();
    // Seed the hub as ALREADY reporting this design system shared, owned by
    // the SAME principal the route's `canMutateUserDesignSystem` will let
    // through — the exact "sharer deletes their own thing" bug shape: this
    // resource is NOT `isTeamSyncedUserDesignSystem` (it is the sharer's own
    // canonical copy, not a pulled copy), so `canMutateUserDesignSystem`
    // returns true unconditionally in production, same as the `async () =>
    // true` default here.
    const hubResourceId = 'ds-t-1-user-my-brand';
    hub.resources.set(hubResourceId, {
      ownerMemberId: OWNER_PRINCIPAL.memberId,
      localId: 'user:my-brand',
      title: 'My Brand',
    });

    const app = express();
    app.use(express.json());
    const { deleteUserDesignSystem, designSystemsTeamShare, scope } = registerRoutes(app, { hub });
    const baseUrl = await listen(app);

    // Sanity: the hub really does report it shared before the delete.
    await expect(designSystemsTeamShare.sharedResources(scope)).resolves.toEqual([
      expect.objectContaining({ id: 'user:my-brand' }),
    ]);

    const res = await fetch(`${baseUrl}/api/design-systems/user:my-brand`, { method: 'DELETE' });
    expect(res.status).toBe(204);

    // The real hub state transitioned — not just "a function was called".
    expect(hub.resources.has(hubResourceId)).toBe(false);
    expect(hub.removeCalls).toHaveLength(1);
    expect(hub.removeCalls[0]).toEqual(['remove', hubResourceId, '--json']);
    await expect(designSystemsTeamShare.sharedResources(scope)).resolves.toEqual([]);

    // AND the local delete actually proceeded (unshare-then-delete).
    expect(deleteUserDesignSystem).toHaveBeenCalledOnce();
  });

  it('does not touch the hub at all when deleting a design system that was never shared', async () => {
    const hub = fakeHub();
    const app = express();
    app.use(express.json());
    const { deleteUserDesignSystem } = registerRoutes(app, { hub });
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:my-brand`, { method: 'DELETE' });
    expect(res.status).toBe(204);

    // No unshare traffic at all for a design system that was never on the
    // team share list — regression guard against always calling
    // `service.unshare()` regardless of current share state (which would
    // itself unconditionally issue a hub `remove` even for an unknown id,
    // per `TeamResourceShareService.unshare`'s own implementation).
    expect(hub.removeCalls).toHaveLength(0);
    expect(deleteUserDesignSystem).toHaveBeenCalledOnce();
  });

  it('continues local deletion when authoritative Personal scope has no Team share to retract', async () => {
    const hub = fakeHub();
    const unsharePersonal = vi.fn(async () => false);
    const app = express();
    app.use(express.json());
    const { deleteUserDesignSystem } = registerRoutes(app, {
      hub,
      unshareTeamDesignSystemIfShared: unsharePersonal,
    });
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:my-brand`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(204);
    expect(unsharePersonal).toHaveBeenCalledOnce();
    expect(hub.removeCalls).toHaveLength(0);
    expect(deleteUserDesignSystem).toHaveBeenCalledOnce();
  });

  it('aborts the local delete when the caller cannot actually manage the shared resource', async () => {
    // Defensive case: if `unshare()` ever throws (e.g. a `canUnshare: false`
    // race), the route must not proceed to the local delete. Simulate that by
    // resolving a plain-member principal (not owner/admin) whose memberId
    // differs from the hub's recorded `ownerMemberId`, so
    // `canManageSharedResource` inside `unshare()` refuses.
    const hub = fakeHub();
    hub.resources.set('ds-t-1-user-my-brand', { ownerMemberId: 'wm-someone-else', localId: 'user:my-brand' });
    const memberPrincipal: ResourceHubPrincipal = {
      memberId: 'wm-owner',
      teamId: 't-1',
      role: 'member',
      lifecycleState: 'active',
      workspaceType: 'team',
    };

    const app = express();
    app.use(express.json());
    const { deleteUserDesignSystem } = registerRoutes(app, { hub, principal: memberPrincipal });
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:my-brand`, { method: 'DELETE' });

    expect(res.status).toBe(500);
    expect(deleteUserDesignSystem).not.toHaveBeenCalled();
    // The hub entry survives untouched — the abort really stopped the whole
    // chain, not just the local delete.
    expect(hub.resources.has('ds-t-1-user-my-brand')).toBe(true);
  });

  it('returns retryable 503 and preserves the local system when Team authority is unavailable', async () => {
    const hub = fakeHub();
    const app = express();
    app.use(express.json());
    const { deleteUserDesignSystem } = registerRoutes(app, {
      hub,
      unshareTeamDesignSystemIfShared: async () => {
        throw new TeamResourceAuthorityUnavailableError(new Error('hub offline'));
      },
    });
    const baseUrl = await listen(app);

    const res = await fetch(`${baseUrl}/api/design-systems/user:my-brand`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: 'WORKSPACE_RESOURCE_AUTHORITY_UNAVAILABLE',
      message: 'team resource authority is temporarily unavailable',
      retryable: true,
    });
    expect(deleteUserDesignSystem).not.toHaveBeenCalled();
  });
});
