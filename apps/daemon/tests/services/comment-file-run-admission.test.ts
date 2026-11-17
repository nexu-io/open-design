import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createChatRunService } from '../../src/runtimes/runs.js';
import { createInternalRunCreationService, type InternalRunCreateInput } from '../../src/services/internal-run-service.js';
import { createCommentFilePublicationCoordination } from '../../src/collab/comment-file-publication-coordination.js';
import { closeDatabase, openDatabase, insertProject, ensureWorkspaceProject, getProject } from '../../src/db.js';
import { createLocalCommentFiles } from '../../src/collab/local-comment-files.js';
import type { CommentFileState, CommentFileMutation } from '@open-design/contracts';
import { parseCommentFileState } from '../../src/collab/comment-file-facts.js';
import { createCollabRuntime, type CreateCollabRuntimeOptions } from '../../src/collab/runtime.js';
import { createPublicFileMutations } from '../../src/collab/public-file-mutations.js';

const principal = { teamId: 'w', memberId: 'creator', role: 'member' as const, lifecycleState: 'active' as const };
const teamProjectCatalog: NonNullable<CreateCollabRuntimeOptions['teamProjectCatalog']> = {
  upsert: async () => undefined,
  getRegistration: async (projectId, actor) => ({
    projectId, workspaceId: actor.teamId, ownerMemberId: actor.memberId,
    resourceId: 'root', visibility: 'team', createdAt: '2026-10-15T00:00:00Z',
  }),
};
const roots: string[] = [];
afterEach(() => { vi.useRealTimers(); closeDatabase(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  const runs = createChatRunService({ createSseResponse: () => ({ send() {}, end() {} }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }) });
  const wake = vi.fn();
  const coordination = createCommentFilePublicationCoordination({
    isBusy: projectId => runs.list({ projectId, status: 'active' }).length > 0, wake,
  });
  const install = vi.fn();
  const service = createInternalRunCreationService<InternalRunCreateInput, ReturnType<typeof runs.create>>({
    runs: { ...runs, createOrReuse(meta) {
      const result = runs.createOrReuse(meta);
      // Narrow the JS-style registry's string discriminant at this typed seam.
      if (result.kind === 'created') return { kind: 'created', run: result.run };
      if (result.kind === 'reused') return { kind: 'reused', run: result.run };
      if (result.kind === 'conflict') return { kind: 'conflict', run: result.run };
      throw new Error('unexpected registry result');
    } }, claimAssistantMessage: () => ({ ok: true }),
    analyticsLifecycle: { install },
    coordinateStart: (run, starter) => coordination.start(run.projectId, starter),
  });
  const prepare = (projectId = 'p') => {
    const result = service.prepare({ meta: { projectId } });
    if (result.kind !== 'ready') throw new Error('run not ready');
    return result.run;
  };
  return { runs, wake, coordination, install, service, prepare };
}

it('reserves snapshot through receipt/fact commit against real physical Run starter admission', async () => {
  const h = fixture();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-run-admission-')); roots.push(root);
  const file = path.join(root, 'f1.html'); fs.writeFileSync(file, 'F1');
  const db = openDatabase(root, { dataDir: root });
  insertProject(db, { id: 'p', name: 'P', createdAt: 1, updatedAt: 1 });
  ensureWorkspaceProject(db, { projectId: 'p', workspaceId: 'w', visibility: 'team', createdByWorkspaceMemberId: 'creator', resourceHubResourceId: 'root' });
  const files = createLocalCommentFiles(db);
  let currentVersion = 'v1';
  let state: CommentFileState = { schemaVersion: 1, revision: 0, files: [] };
  const receipts: string[] = [];
  const catalog = async (args: string[]) => {
    if (args[1] === 'upsert') {
      const mutation = JSON.parse(args[6] ?? '')._commentFiles as CommentFileMutation;
      expect(mutation.baseRevision).toBe(state.revision);
      expect(mutation.versionId).toBe(currentVersion);
      receipts.push(`${mutation.files[0]?.retired ? 'retire' : 'admit'}-${mutation.versionId}`);
      const map = new Map(state.files.map(fact => [fact.sourceFileId, fact]));
      for (const fact of mutation.files) map.set(fact.sourceFileId, { ...fact, resourceId: mutation.resourceId, versionId: mutation.versionId });
      state = { schemaVersion: 1, revision: state.revision + 1, files: [...map.values()] };
    }
    return JSON.stringify({ projectId: 'p', workspaceId: 'w', ownerMemberId: 'creator', resourceId: 'root', metadata: { _commentFiles: state } });
  };
  const input = { projectId: 'p', workspaceId: 'w', creatorMemberId: 'creator', resourceId: 'root',
    paths: [{ sourceFilePath: 'f1.html', entryPath: 'f1.html' }], run: catalog };
  await files.admit({ ...input, versionId: 'v1' });
  const originalId = state.files[0]?.sourceFileId;
  const upload = deferred(); const admission = deferred(); const started = deferred();
  const steps: string[] = [];
  const publication = h.coordination.run('p', principal, async () => {
    steps.push('busy-check-passed');
    await upload.promise; // live-folder snapshot has NOT happened yet
    expect(fs.readFileSync(file, 'utf8')).toBe('F1');
    steps.push('snapshot-v2'); currentVersion = 'v2';
    await admission.promise;
    await files.admit({ ...input, versionId: 'v2' });
    steps.push('admitted-v2');
  });
  const run = h.prepare();
  h.service.start(run, { body: {}, requestAnalyticsContext: null }, async () => {
    steps.push('physical-delete'); fs.unlinkSync(file); started.resolve();
  });
  expect(h.install).toHaveBeenCalledOnce();
  expect(steps).toEqual(['busy-check-passed']);
  upload.resolve();
  await Promise.resolve();
  expect(steps).toEqual(['busy-check-passed', 'snapshot-v2']);
  admission.resolve(); await publication; await started.promise;
  expect(steps).toEqual(['busy-check-passed', 'snapshot-v2', 'admitted-v2', 'physical-delete']);
  h.runs.finish(run, 'succeeded');
  // At the later persistent-missing boundary, retire the NEW captured receipt
  // before another upload. Native Agent observation is intentionally not claimed.
  await h.coordination.run('p', principal, async () => {
    expect(fs.existsSync(file)).toBe(false);
    const captured = parseCommentFileState(getProject(db, 'p')?.metadata?._commentFiles)?.files[0];
    if (!captured) throw new Error('missing exact admitted receipt');
    expect(captured.sourceFileId).toBe(originalId);
    expect(captured.versionId).toBe('v2');
    await files.retire({ ...input, fact: captured });
    steps.push('retire-v2'); currentVersion = 'v3'; steps.push('upload-v3');
  });
  expect(steps.slice(-2)).toEqual(['retire-v2', 'upload-v3']);
  expect(receipts).toEqual(['admit-v1', 'admit-v2', 'retire-v2']);
  expect(state.files[0]).toMatchObject({ sourceFileId: originalId, retired: true, versionId: 'v2' });
});

it.each(['failed', 'canceled'] as const)('publication %s releases the reservation; queued canceled runs never spawn', async outcome => {
  const h = fixture(); const held = deferred(); const started = deferred();
  const publication = h.coordination.run('p', principal, async () => { await held.promise; throw new Error(outcome); });
  const rejected = expect(publication).rejects.toThrow(outcome);
  const canceled = h.prepare(); const survivor = h.prepare();
  const forbidden = vi.fn(async () => undefined);
  h.service.start(canceled, { body: {}, requestAnalyticsContext: null }, forbidden);
  h.service.start(survivor, { body: {}, requestAnalyticsContext: null }, async () => { started.resolve(); });
  await h.runs.cancel(canceled);
  held.resolve(); await rejected; await started.promise;
  expect(forbidden).not.toHaveBeenCalled();
  h.runs.finish(survivor, 'failed');
  await expect(h.coordination.run('p', principal, async () => 'next')).resolves.toBe('next');
});

it('does not spawn a cancellation-requested Run whose terminal cleanup is still pending', async () => {
  const h = fixture(); const held = deferred();
  const publication = h.coordination.run('p', principal, () => held.promise);
  const run = h.prepare(); const forbidden = vi.fn(async () => undefined);
  h.service.start(run, { body: {}, requestAnalyticsContext: null }, forbidden);
  // shutdownActive sets this before awaiting process/terminal cleanup. Exercise
  // that real Run state separately from an already-completed cancel transition.
  run.cancelRequested = true;
  expect(h.runs.isTerminal(run.status)).toBe(false);
  held.resolve(); await publication;
  expect(forbidden).not.toHaveBeenCalled();
  h.runs.finish(run, 'canceled');
});

it('unrelated projects start immediately; overlapping exact-project runs preserve pending publication until last end', async () => {
  const h = fixture(); const held = deferred(); const started = deferred();
  const publication = h.coordination.run('p', principal, () => held.promise);
  const other = h.prepare('other'); const unrelated = vi.fn(async () => undefined);
  h.service.start(other, { body: {}, requestAnalyticsContext: null }, unrelated);
  expect(unrelated).toHaveBeenCalledOnce();
  const first = h.prepare(); const second = h.prepare();
  h.service.start(first, { body: {}, requestAnalyticsContext: null }, async () => { started.resolve(); });
  h.service.start(second, { body: {}, requestAnalyticsContext: null }, async () => undefined);
  held.resolve(); await publication; await started.promise;
  await expect(h.coordination.run('p', principal, async () => 'wrong')).rejects.toThrow('COMMENT_FILE_PROJECT_BUSY');
  h.runs.finish(first, 'failed'); h.coordination.settled('p');
  expect(h.wake).not.toHaveBeenCalled();
  h.runs.finish(second, 'canceled'); h.coordination.settled('p');
  expect(h.wake).toHaveBeenCalledExactlyOnceWith('p', principal);
  h.runs.finish(other, 'succeeded');
});

it.each(['manual-sync', 'restored-startup'] as const)('%s runtime publication shares physical starter reservation without UI subscribers', async entry => {
  vi.useFakeTimers();
  const h = fixture(); const entered = deferred(); const upload = deferred(); const published = deferred(); const started = deferred();
  const mutations = createPublicFileMutations();
  const runtime = createCollabRuntime({
    teamProjectCatalog,
    adapter: { publish: async () => { entered.resolve(); await upload.promise; return { version: 2, versionId: 'v2' }; } },
    coordinatePublication: (projectId, scope, publish) => mutations.run(projectId,
      () => h.coordination.run(projectId, scope ?? principal, publish)),
    onPublished: () => published.resolve(),
  });
  try {
    // Same persisted-share restoration seam used at daemon startup. No watcher,
    // browser, SSE client or provider is needed to drive this scheduler boundary.
    runtime.rememberTeamShare('p', principal, 'synced');
    let manual: Promise<unknown> | undefined;
    if (entry === 'manual-sync') manual = runtime.syncExistingTeamProject('p', principal);
    else { runtime.scheduler.notifyChanged('p', 'comment-files-reopen', principal); runtime.scheduler.runBoundary('p', principal); }
    await entered.promise;
    const run = h.prepare(); const write = vi.fn(async () => { started.resolve(); });
    h.service.start(run, { body: {}, requestAnalyticsContext: null }, write);
    expect(write).not.toHaveBeenCalled();
    upload.resolve();
    if (manual) await manual; else await published.promise;
    await started.promise;
    expect(write).toHaveBeenCalledOnce();
    h.runs.finish(run, 'succeeded');
  } finally { runtime.dispose(); }
});

it('restored runtime retains dirty work across overlapping Runs and wakes after last terminal without UI', async () => {
  vi.useFakeTimers();
  const h = fixture(); const failed = deferred(); const published = deferred();
  const push = vi.fn(async () => ({ version: 2, versionId: 'v2' }));
  const mutations = createPublicFileMutations();
  const runtime = createCollabRuntime({ teamProjectCatalog, adapter: { publish: push },
    coordinatePublication: (projectId, scope, publish) => mutations.run(projectId,
      () => h.coordination.run(projectId, scope ?? principal, publish)),
    onError: () => failed.resolve(), onPublished: () => published.resolve(),
  });
  h.wake.mockImplementation((projectId, scope) => {
    runtime.scheduler.notifyChanged(projectId, 'run-settled', scope);
    runtime.scheduler.runBoundary(projectId, scope);
  });
  try {
    runtime.rememberTeamShare('p', principal, 'synced');
    const first = h.prepare(); const second = h.prepare();
    h.service.start(first, { body: {}, requestAnalyticsContext: null }, async () => undefined);
    h.service.start(second, { body: {}, requestAnalyticsContext: null }, async () => undefined);
    runtime.scheduler.notifyChanged('p', 'comment-files-reopen', principal); runtime.scheduler.runBoundary('p', principal);
    await failed.promise;
    expect(push).not.toHaveBeenCalled();
    h.runs.finish(first, 'failed'); h.coordination.settled('p');
    expect(push).not.toHaveBeenCalled();
    await h.runs.cancel(second); h.coordination.settled('p');
    await published.promise;
    expect(push).toHaveBeenCalledOnce();
    expect(h.wake).toHaveBeenCalledExactlyOnceWith('p', principal);
  } finally { runtime.dispose(); }
});
