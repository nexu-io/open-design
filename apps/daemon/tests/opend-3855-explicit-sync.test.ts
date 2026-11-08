import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { closeDatabase, openDatabase, insertProject, insertConversation, upsertPreviewComment, listPreviewComments } from '../src/db.js';
import { createVelaCliTeamProjectCatalog, createVelaCliTeamProjectCatalogClient } from '../src/collab/vela-cli-team-projects.js';
import { planWorkspaceProjectReconciliation } from '../src/collab/workspace-projects-reconciler.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollabRuntime, type CollabRuntime } from '../src/collab/runtime.js';
import { createVelaCliResourceAdapter } from '../src/collab/vela-cli-resource-adapter.js';
import type { ResourceHubPrincipal } from '../src/collab/resource-principal.js';

const principal: ResourceHubPrincipal = { teamId: 'workspace', memberId: 'creator', role: 'owner', lifecycleState: 'active' };
const root = 'server-generated-root';
let runtime: CollabRuntime;
afterEach(() => { runtime?.dispose(); vi.useRealTimers(); });
function fixture() {
  const calls: string[] = [];
  let policy: 'private' | 'team' = 'private';
  const ensurePrivate = vi.fn(async () => { calls.push('ensure'); return { workspaceId: principal.teamId, projectId: 'p', ownerMemberId: principal.memberId, resourceId: root, visibility: policy, createdAt: '2026-01-01T00:00:00Z' }; });
  const setVisibility = vi.fn(async (_id: string, visibility: 'private' | 'team') => { calls.push(visibility); policy = visibility; });
  const upsert = vi.fn(async () => { calls.push('upsert'); });
  const remove = vi.fn();
  const publish = vi.fn(async () => { calls.push('root'); return { version: 1, versionId: 'v1' }; });
  const unpublish = vi.fn();
  const getRegistration = vi.fn(async () => ({ workspaceId: principal.teamId, projectId: 'p', ownerMemberId: principal.memberId, resourceId: root, visibility: policy, createdAt: '2026-01-01T00:00:00Z' }));
  const retainRegistration = vi.fn();
  runtime = createCollabRuntime({ adapter: { publish, unpublish }, teamProjectCatalog: { ensurePrivate, setVisibility, getRegistration, upsert, remove }, resolveResourceId: () => root, retainRegistration });
  return { calls, ensurePrivate, setVisibility, getRegistration, retainRegistration, upsert, remove, publish, unpublish, policy: () => policy };
}
describe('explicit project policy and stable root', () => {
  it('does not fall back to whole-root publication when policy transport is unavailable', async () => {
    const publish = vi.fn(async () => ({ version: 1, versionId: 'v1' }));
    const upsert = vi.fn();
    runtime = createCollabRuntime({ adapter: { publish }, teamProjectCatalog: { upsert } });
    await expect(runtime.requestTeamShare('p', principal)).rejects.toThrow('TEAM_PROJECT_POLICY_UNAVAILABLE');
    expect(publish).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
  it('uploads the retained root then explicitly promotes after private public registration', async () => {
    const f = fixture();
    await runtime.requestTeamShare('p', principal);
    expect(f.calls).toEqual(['ensure', 'root', 'upsert', 'team']);
    expect(f.upsert).toHaveBeenCalledWith(expect.objectContaining({ resourceId: root }), principal);
    expect(f.policy()).toBe('team');
  });
  it('demotes without deleting root/catalog/public state and suppresses subsequent scheduler work', async () => {
    vi.useFakeTimers();
    const f = fixture();
    await runtime.requestTeamShare('p', principal);
    await runtime.requestTeamUnshare('p', principal);
    runtime.scheduler.notifyChanged('p', 'late', principal);
    runtime.scheduler.runBoundary('p', principal);
    runtime.refreshTeamProjectMetadata('p');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.policy()).toBe('private');
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.unpublish).not.toHaveBeenCalled();
    expect(f.publish).toHaveBeenCalledTimes(1);
    expect(f.retainRegistration).toHaveBeenCalledWith(expect.objectContaining({ resourceId: root }), principal);
  });
  it('never syncs a private identity which has not been remembered as shared', async () => {
    vi.useFakeTimers();
    const f = fixture();
    runtime.scheduler.notifyChanged('p', 'private-edit', principal);
    runtime.scheduler.runBoundary('p', principal);
    runtime.refreshTeamProjectMetadata('p');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.publish).not.toHaveBeenCalled();
    expect(f.upsert).not.toHaveBeenCalled();
    expect(f.setVisibility).not.toHaveBeenCalled();
  });
  it('fails closed on remote demotion failure without claiming local success', async () => {
    const f = fixture();
    await runtime.requestTeamShare('p', principal);
    f.setVisibility.mockRejectedValueOnce(new Error('offline'));
    await expect(runtime.requestTeamUnshare('p', principal)).rejects.toThrow('offline');
    expect(runtime.projectOwnerMemberId('p', principal)).toBe(principal.memberId);
    expect(f.policy()).toBe('team');
    expect(f.remove).not.toHaveBeenCalled();
  });
  it('serializes an in-flight root transport before demotion and prevents a late retry', async () => {
    vi.useFakeTimers();
    const f = fixture();
    await runtime.requestTeamShare('p', principal);
    let release!: () => void;
    const blocked = new Promise<void>(r => { release = r; });
    let entered!: () => void;
    const started = new Promise<void>(r => { entered = r; });
    f.publish.mockImplementationOnce(async () => { entered(); await blocked; throw new Error('late failure'); });
    runtime.scheduler.notifyChanged('p', 'root-edit', principal);
    runtime.scheduler.runBoundary('p', principal);
    await started;
    const demote = runtime.requestTeamUnshare('p', principal);
    await Promise.resolve();
    expect(f.setVisibility).toHaveBeenCalledTimes(1);
    release();
    await demote;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.policy()).toBe('private');
    expect(f.publish).toHaveBeenCalledTimes(2);
    expect(f.calls.at(-1)).toBe('private');
  });
  it('cancels an in-flight metadata retry before writing private policy last', async () => {
    vi.useFakeTimers();
    const f = fixture();
    await runtime.requestTeamShare('p', principal);
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>(r => { release = r; });
    const started = new Promise<void>(r => { entered = r; });
    f.upsert.mockImplementationOnce(async () => { entered(); await blocked; throw new Error('late metadata'); });
    runtime.refreshTeamProjectMetadata('p');
    await started;
    const demote = runtime.requestTeamUnshare('p', principal);
    await Promise.resolve();
    expect(f.policy()).toBe('team');
    release();
    await demote;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.policy()).toBe('private');
    expect(f.upsert).toHaveBeenCalledTimes(2);
    expect(f.setVisibility).toHaveBeenCalledTimes(2);
  });
  it('syncs an existing team row without ensure or another policy command', async () => {
    const f = fixture();
    await runtime.requestTeamShare('p', principal);
    await runtime.syncExistingTeamProject('p', principal);
    expect(f.publish).toHaveBeenCalledTimes(2);
    expect(f.ensurePrivate).toHaveBeenCalledTimes(1);
    expect(f.setVisibility).toHaveBeenCalledTimes(1);
  });
  it('local forget and backing-project sync cannot promote a private project', async () => {
    const f = fixture();
    await expect(runtime.syncExistingTeamProject('p', principal)).rejects.toThrow('PROJECT_VISIBILITY_REQUIRES_MOVE');
    await runtime.forgetTeamShare!('p', principal);
    expect(f.setVisibility).not.toHaveBeenCalled();
    expect(f.publish).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.unpublish).not.toHaveBeenCalled();
  });
  it('a stale restored team intent cannot upload a currently private remote identity', async () => {
    vi.useFakeTimers();
    const f = fixture();
    runtime.rememberTeamShare('p', principal, 'synced', { metadataRefreshPending: true });
    runtime.scheduler.notifyChanged('p', 'stale', principal);
    runtime.scheduler.runBoundary('p', principal);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.publish).not.toHaveBeenCalled();
    expect(f.upsert).not.toHaveBeenCalled();
    expect(f.setVisibility).not.toHaveBeenCalled();
  });
  it('failed whole-root upload retains creator/root and cannot promote or delete public state', async () => {
    const f = fixture();
    f.publish.mockRejectedValueOnce(new Error('root transport failed'));
    await expect(runtime.requestTeamShare('p', principal)).rejects.toThrow('root transport failed');
    expect(f.retainRegistration).toHaveBeenCalledWith(expect.objectContaining({ resourceId: root }), principal);
    expect(f.policy()).toBe('private');
    expect(f.setVisibility).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.unpublish).not.toHaveBeenCalled();
    await runtime.requestTeamShare('p', principal);
    expect(f.policy()).toBe('team');
  });
  it('demotion leaves the real SQLite public-link and comment records unchanged', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'od-explicit-demotion-'));
    const db = openDatabase(dir);
    try {
      insertProject(db, { id: 'p', name: 'P', createdAt: 1, updatedAt: 1 });
      insertConversation(db, { id: 'c', projectId: 'p', title: 'C', createdAt: 1, updatedAt: 1 });
      upsertPreviewComment(db, 'p', 'c', { id: 'comment', note: 'Public comment', authorMemberId: principal.memberId, target: { filePath: 'public.html', elementId: 'hero', selector: 'h1', label: 'Hero', position: { x: 0, y: 0, width: 1, height: 1 } } });
      migratePublicFilePublications(db);
      const store = createSqlitePublicFilePublicationStore(db);
      const scope = { projectId: 'p', filePath: 'public.html', resourceTeamId: principal.teamId, ownerMemberId: principal.memberId };
      store.set(scope, { slug: 'original', url: 'https://public.example/original', fileName: 'public.html' });
      const beforeLink = store.get(scope);
      const beforeComments = listPreviewComments(db, 'p', 'c');
      const f = fixture();
      await runtime.requestTeamShare('p', principal);
      await runtime.requestTeamUnshare('p', principal);
      expect(store.get(scope)).toEqual(beforeLink);
      expect(listPreviewComments(db, 'p', 'c')).toEqual(beforeComments);
      expect(f.remove).not.toHaveBeenCalled();
      expect(f.unpublish).not.toHaveBeenCalled();
    } finally { closeDatabase(); await rm(dir, { recursive: true, force: true }); }
  });
  it('exact creator registration sees pending/rootless private rows, never as team membership', async () => {
    const row = { projectId: 'p', workspaceId: principal.teamId, ownerMemberId: principal.memberId, visibility: 'private' as const, resourceId: null, createdAt: '2026-01-01T00:00:00Z', publishedVersionId: null };
    const run = vi.fn(async (args: string[]) => JSON.stringify(args[0] === 'list' ? { projects: [row] } : row));
    const catalog = createVelaCliTeamProjectCatalog({ run, supportsTeamProjects: () => true });
    expect(await catalog.getRegistration('p', principal)).toMatchObject({ visibility: 'private', resourceId: null });
    expect(await catalog.get('p', principal.teamId)).toBeNull();
    expect(await catalog.list(principal.teamId)).toEqual([]);
    const client = createVelaCliTeamProjectCatalogClient({ run, supportsTeamProjects: () => true });
    expect(await client.list(principal)).toEqual([]);
    expect(planWorkspaceProjectReconciliation({ workspaceId: principal.teamId, workspaceMemberId: principal.memberId, remoteProjects: [row], localBindings: new Map() })).toEqual([]);
  });
  it('uses a stable server root without trying any guessed legacy identity', async () => {
    const run = vi.fn(async (_args: string[]) => JSON.stringify({ version: 1, versionId: 'v1' }));
    const adapter = createVelaCliResourceAdapter({ resolveProjectDir: () => '/synthetic', hasTeamIdentity: () => true, resolveResourceId: (_id, scope) => { if (!scope) throw new Error('no guessed root'); return root; }, run });
    await adapter.publish({ projectId: 'p', reason: 'share', principal });
    await adapter.syncLatest!({ projectId: 'p', principal });
    expect(run.mock.calls.every(([args]) => args.includes(root))).toBe(true);
  });
});
