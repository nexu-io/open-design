import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import { createOwnedContentSync, type OwnedContentSyncDeps } from '../../src/collab/owned-content-sync.js';
import { createSqliteOwnedContentStore, migrateOwnedContentSync, type OwnedContentScope } from '../../src/collab/owned-content-store.js';
import {
  createProactiveContentPull,
  type ProactiveContentPullDeps,
  type ProactiveContentPullEvent,
} from '../../src/collab/proactive-content-pull.js';

// OPEND-4100: AMR emits 'project-content-changed' for every project-kind
// resource version, including single-file public shares (`project-file-*`)
// whose version counter is unrelated to the project root. Only the root head
// may drive owner overwrite prompts or member pulls.

const ROOT = 'project-root';
const FILE = 'project-file-xyz';
const scope: OwnedContentScope = {
  projectId: 'proj-1', workspaceId: 'ws-1', resourceTeamId: 'team-1', viewerMemberId: 'wm-owner', ownerMemberId: 'wm-owner',
};

function ownedSync(store = createSqliteOwnedContentStore(newDb()), rootHead = 1) {
  let head = rootHead;
  const apply = vi.fn(async (_scope: OwnedContentScope, expected: number) => ({ version: head, fingerprint: `remote-${expected}` }));
  const onDiagnostic = vi.fn();
  const deps: OwnedContentSyncDeps = {
    store, head: vi.fn(async () => head), hasContent: async () => true, isSupported: () => true, isBusy: () => false,
    fingerprint: async () => 'local', apply, publicationScope: () => null, onChange: vi.fn(), onDiagnostic,
  };
  return { store, deps, apply, onDiagnostic, sync: createOwnedContentSync(deps), setHead: (value: number) => { head = value; } };
}

function newDb() {
  const db = new Database(':memory:');
  migrateOwnedContentSync(db);
  return db;
}

function pullDeps(viewer: string, overrides: Partial<ProactiveContentPullDeps> = {}) {
  const pulls: Array<number | undefined> = [];
  const timers: Array<() => void | Promise<void>> = [];
  const deps: ProactiveContentPullDeps = {
    getLocalBinding: () => ({ workspaceId: 'ws-1', visibility: 'team' }),
    getWorkspaceIdentity: async () => ({ workspaceId: 'ws-1', resourceTeamId: 'team-1', workspaceMemberId: viewer }),
    resolveSharedProjectOwner: async () => 'wm-owner',
    resolveProjectRootResourceId: async () => ROOT,
    pullSharedProject: async (_target, expected) => { pulls.push(expected); return { status: 'pulled', version: 1 }; },
    scheduler: {
      setTimeout: (cb: () => void | Promise<void>) => { timers.push(cb); return { unref() {} }; },
      clearTimeout: () => {},
    },
    random: () => 0,
    ...overrides,
  };
  return { deps, pulls, timers };
}

const event = (resourceId: string | undefined, version: number): ProactiveContentPullEvent => ({
  projectId: 'proj-1', workspaceId: 'ws-1', version, ...(resourceId ? { resourceId } : {}),
});

describe('owner sync converges on the root head (OPEND-4100)', () => {
  it('drops a single-file share event before it reaches owner sync', async () => {
    const owned = ownedSync();
    owned.store.write(scope, { ...owned.store.read(scope), localVersion: 1, latestVersion: 1 });
    const pull = createProactiveContentPull(pullDeps('wm-owner', {
      observeOwnedContent: async (target, version) => { await owned.sync.request(target, { action: 'check' }, version); },
    }).deps);

    await pull.handleContentChanged(event(FILE, 3));

    expect(owned.deps.head).not.toHaveBeenCalled();
    expect(owned.store.read(scope)).toMatchObject({ localVersion: 1, latestVersion: 1 });
    expect(owned.sync.read(scope).state).toBe('up_to_date');
  });

  it('treats an event version only as a wake-up and records the root head', async () => {
    const owned = ownedSync();
    owned.store.write(scope, { ...owned.store.read(scope), localVersion: 1, latestVersion: 1 });

    expect(await owned.sync.request(scope, { action: 'check' }, 3)).toMatchObject({ state: 'up_to_date', latestVersion: 1 });
    expect(owned.deps.head).toHaveBeenCalledTimes(1);
  });

  it('repairs a persisted non-root latestVersion after restart without touching local content', async () => {
    const store = createSqliteOwnedContentStore(newDb());
    store.write(scope, { ...store.read(scope), localVersion: 1, latestVersion: 3, fingerprint: 'local' });
    const owned = ownedSync(store, 1);

    expect(await owned.sync.request(scope, { action: 'check' })).toMatchObject({ state: 'up_to_date', localVersion: 1, latestVersion: 1 });
    expect(owned.apply).not.toHaveBeenCalled();
    expect(owned.onDiagnostic).toHaveBeenCalledWith({
      kind: 'latest-corrected', projectId: 'proj-1', storedLatestVersion: 3, headVersion: 1, localVersion: 1,
    });
  });

  it('still requires confirmation for a real cross-device root update and then applies it', async () => {
    const owned = ownedSync();
    owned.store.write(scope, { ...owned.store.read(scope), localVersion: 1, latestVersion: 1 });
    const pull = createProactiveContentPull(pullDeps('wm-owner', {
      observeOwnedContent: async (target, version) => { await owned.sync.request(target, { action: 'check' }, version); },
    }).deps);
    owned.setHead(2);

    await pull.handleContentChanged(event(ROOT, 2));
    expect(owned.sync.read(scope)).toMatchObject({ state: 'confirmation_required', latestVersion: 2, localVersion: 1 });
    expect(owned.apply).not.toHaveBeenCalled();

    expect(await owned.sync.request(scope, { action: 'accept', version: 2 })).toMatchObject({ state: 'up_to_date', localVersion: 2, latestVersion: 2 });
    expect(owned.apply).toHaveBeenCalledWith(scope, 2);
  });

  it('reports expected and received versions when a replacement receipt disagrees', async () => {
    const owned = ownedSync();
    owned.store.write(scope, { ...owned.store.read(scope), localVersion: 1, latestVersion: 1 });
    owned.setHead(2);
    await owned.sync.request(scope, { action: 'check' });
    owned.apply.mockResolvedValueOnce({ version: 3, fingerprint: 'remote-3' });

    expect(await owned.sync.request(scope, { action: 'accept', version: 2 })).toMatchObject({ state: 'failed', errorCode: 'PROJECT_SYNC_FAILED' });
    expect(owned.onDiagnostic).toHaveBeenCalledWith({
      kind: 'apply-failed', projectId: 'proj-1', expectedVersion: 2, receivedVersion: 3, error: 'published version changed',
    });
  });
});

describe('member pulls follow only root events (OPEND-4100)', () => {
  it('ignores a single-file share event instead of chasing its version', async () => {
    const f = pullDeps('wm-member');
    await createProactiveContentPull(f.deps).handleContentChanged(event(FILE, 3));
    expect(f.pulls).toEqual([]);
    expect(f.timers).toEqual([]);
  });

  it('pulls the root version from a root event', async () => {
    const f = pullDeps('wm-member', {
      pullSharedProject: async (_target, expected) => { f.pulls.push(expected); return { status: 'pulled', version: expected ?? null }; },
    });
    await createProactiveContentPull(f.deps).handleContentChanged(event(ROOT, 2));
    expect(f.pulls).toEqual([2]);
    expect(f.timers).toEqual([]);
  });

  it('fails closed without a retry lane when the root cannot be resolved', async () => {
    const onError = vi.fn();
    const f = pullDeps('wm-member', {
      onError,
      resolveProjectRootResourceId: async () => { throw new Error('TEAM_PROJECT_ROOT_UNAVAILABLE'); },
    });
    await createProactiveContentPull(f.deps).handleContentChanged(event(ROOT, 2));
    expect(f.pulls).toEqual([]);
    expect(f.timers).toEqual([]);
    expect(onError).toHaveBeenCalled();
  });

  it('keeps events without resourceId on the existing path', async () => {
    const resolveProjectRootResourceId = vi.fn(async () => ROOT);
    const f = pullDeps('wm-member', {
      resolveProjectRootResourceId,
      pullSharedProject: async (_target, expected) => { f.pulls.push(expected); return { status: 'pulled', version: expected ?? null }; },
    });
    await createProactiveContentPull(f.deps).handleContentChanged(event(undefined, 2));
    expect(resolveProjectRootResourceId).not.toHaveBeenCalled();
    expect(f.pulls).toEqual([2]);
  });
});
