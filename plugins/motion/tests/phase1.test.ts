import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './fixtures.ts';
import { Phase1Service } from '../phase1.ts';
import { pluginRoot, execute } from '../hyperframes.ts';
import { cancelExport } from '../server.ts';
import { atomicJson, fileHash, recoverProjectTransactions } from '../phase1-versions.ts';
import { validateInput, phase1Tools } from '../shared/phase1-tools.ts';

function api(store: any) { return new Phase1Service(store, pluginRoot, {
  origin: () => 'http://127.0.0.1:4173', nativeUrl: () => undefined, openProject: async () => {},
  mutation: async task => task(), cancel: (pid, jobId) => cancelExport(store, pid, jobId),
}); }
const create = (service: Phase1Service, requestId = crypto.randomUUID()) => service.call('motion_create_project', {
  requestId, projectType: 'natural_language', title: '一期测试', requirements: '用真实原生文件制作静音短片',
});
const edit = (service: Phase1Service, p: any, content: string) => service.call('motion_edit_project', {
  requestId: crypto.randomUUID(), projectId: p.projectId, expectedRevision: p.revision,
  expectedVersionId: p.version.versionId, files: [{ path: 'note.txt', content }],
});

test('phase1 validates real inputs before effects, creates idempotently and pages without switching', () => fixture(async store => {
  const service = api(store), p = await create(service, 'first');
  assert.equal(p.version.versionNumber, 1); assert.equal(p.filmComplete, false);
  await assert.rejects(service.call('motion_create_project', { requestId: 'mixed-sources', projectType: 'natural_language', title: 'x', requirements: 'x', templateId: 'nyt-graph' }), /INVALID_ARGUMENT/);
  await assert.rejects(service.call('motion_get_project', { projectId: p.projectId, sessionId: crypto.randomUUID() }), /PROJECT_SESSION_MISMATCH/);
  assert.equal((await create(service, 'first')).projectId, p.projectId);
  await assert.rejects(service.call('motion_create_project', { requestId: 'first', projectType: 'natural_language', title: 'changed', requirements: 'x' }), /REQUEST_ID_CONFLICT/);
  for (let i = 0; i < 5; i++) await create(service);
  const selected = store.projectId;
  const first = await service.call('motion_get_project', {});
  assert.equal(first.projects.length, 5); assert.equal(first.hasMore, true);
  const second = await service.call('motion_get_project', { cursor: first.nextCursor });
  assert.equal(second.projects.length, 1); assert.equal(second.hasMore, false);
  assert.equal(store.projectId, selected);
  await assert.rejects(service.call('motion_open_preview', {}), /PROJECT_NOT_BOUND/);
  for (const tool of phase1Tools) assert.throws(() => validateInput(tool.inputSchema, { unknown: true }), /INVALID_ARGUMENT/);
}, false));

test('v5 to v3 creates v6, retains v4/v5, rejects stale writes and recovers after restart', () => fixture(async store => {
  let service = api(store), p = await create(service), original = p;
  const versions = [p];
  for (let i = 2; i <= 5; i++) { p = await edit(service, p, 'version ' + i); versions.push(p); }
  const restored = await service.call('motion_restore_version', { projectId: p.projectId, requestId: 'restore-3', versionId: versions[2].version.versionId, expectedVersionId: p.version.versionId, expectedRevision: p.revision });
  assert.equal(restored.version.versionNumber, 6); assert.equal(restored.revision, versions[2].revision);
  assert.equal(await readFile(path.join(store.projectDirectoryFor(p.projectId), 'note.txt'), 'utf8'), 'version 3');
  await assert.rejects(edit(service, versions[2], 'stale same hash'), /VERSION_CONFLICT/);
  const list = await service.call('motion_list_versions', { projectId: p.projectId });
  assert.deepEqual(list.versions.map((v: any) => v.versionNumber), [6, 5, 4, 3, 2]);
  assert.equal((await service.call('motion_list_versions', { projectId: p.projectId, cursor: list.nextCursor })).versions[0].versionId, original.version.versionId);
  service = api(store);
  const v7 = await service.call('motion_restore_version', { projectId: p.projectId, requestId: 'restore-5', versionId: p.version.versionId, expectedVersionId: restored.version.versionId, expectedRevision: restored.revision });
  assert.equal(v7.version.versionNumber, 7); assert.equal(v7.revision, p.revision);
  const before = await store.forProject(p.projectId).get();
  await assert.rejects(service.call('motion_edit_project', { projectId: p.projectId, requestId: 'bad-path', expectedRevision: v7.revision, expectedVersionId: v7.version.versionId, files: [{ path: 'note.txt', content: 'bad' }, { path: '../escape.txt', content: 'bad' }] }), /文件路径/);
  assert.deepEqual(await store.forProject(p.projectId).get(), before);
  await assert.rejects(service.call('motion_edit_project', { projectId: p.projectId, requestId: 'conflicting-paths', expectedRevision: v7.revision, expectedVersionId: v7.version.versionId, files: [{ path: 'nested.txt', content: 'x' }, { path: 'nested.txt/file.txt', content: 'x' }] }), /INVALID_FILE_TYPE|CONFLICTING_FILE_PATHS/);
  assert.deepEqual(await store.forProject(p.projectId).get(), before);
  const source = '中文🙂abc';
  const v8 = await edit(service, v7, source);
  const text = await service.call('motion_get_project', { projectId: p.projectId, expectedRevision: v8.revision, file: { path: 'note.txt', length: 7 } });
  assert.equal(text.file.content, '中文'); assert.equal(text.file.nextOffset, 6);
  await assert.rejects(service.call('motion_get_project', { projectId: p.projectId, file: { path: 'note.txt', offset: 1 } }), /INVALID_UTF8_OFFSET/);
}, false));

test('imports probe media, return partial results, deduplicate and retain historical audio', () => fixture(async store => {
  const service = api(store), p = await create(service);
  const png = path.join(store.directory, 'source.png');
  const pngResult = await execute('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:size=16x16', '-frames:v', '1', png], store.directory);
  assert.equal(pngResult.code, 0, pngResult.stderr);
  const video = path.join(store.directory, 'source.mp4');
  const videoResult = await execute('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=duration=0.2:size=16x16:rate=10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video], store.directory);
  assert.equal(videoResult.code, 0, videoResult.stderr);
  const wav = path.join(store.directory, 'source.wav'), fake = path.join(store.directory, 'fake.png');
  const made = await execute('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=0.2', wav], store.directory);
  assert.equal(made.code, 0, made.stderr); await writeFile(fake, 'not an image');
  const args = { projectId: p.projectId, requestId: 'import', items: [{ itemId: 'audio', sourcePath: wav }, { itemId: 'fake', sourcePath: fake }, { itemId: 'image', sourcePath: png }, { itemId: 'video', sourcePath: video }] };
  const imported = await service.call('motion_import_assets', args);
  assert.equal(imported.status, 'partial'); assert.equal(imported.items[0].mimeType, 'audio/wav'); assert.equal(imported.items[1].status, 'failed'); assert.equal(imported.items[2].mimeType, 'image/png'); assert.equal(imported.items[3].mimeType, 'video/mp4');
  assert.equal((await service.call('motion_import_assets', args)).items[0].assetId, imported.items[0].assetId);
  const deduped = await service.call('motion_import_assets', { ...args, requestId: 'new-import', items: [args.items[0]] });
  assert.equal(deduped.items[0].reused, true);
  await rm(wav);
  const after = await service.call('motion_get_project', { projectId: p.projectId });
  const restored = await service.call('motion_restore_version', { projectId: p.projectId, requestId: 'before-media', versionId: p.version.versionId, expectedVersionId: after.version.versionId, expectedRevision: after.revision });
  await service.call('motion_restore_version', { projectId: p.projectId, requestId: 'after-media', versionId: imported.version.versionId, expectedVersionId: restored.version.versionId, expectedRevision: restored.revision });
  assert.equal(await fileHash(path.join(store.projectDirectoryFor(p.projectId), imported.items[0].path)), imported.items[0].sha256);
}, false));

test('an interrupted partial save rolls back, but recovery never overwrites foreign writes', () => fixture(async store => {
  const service = api(store), p = await create(service), scoped = store.forProject(p.projectId);
  const file = path.join(scoped.projectDirectory, 'note.txt'); await writeFile(file, 'before');
  await service.call('motion_get_project', { projectId: p.projectId });
  const directory = path.join(store.directory, 'phase1/transactions/interrupted');
  await mkdir(path.join(directory, 'old'), { recursive: true }); await writeFile(path.join(directory, 'old/0'), 'before');
  const before = await fileHash(file); await writeFile(file, 'after'); const after = await fileHash(file);
  await atomicJson(path.join(directory, 'journal.json'), { projectId: p.projectId, requestId: 'interrupted', state: 'prepared', windowId: 'interrupted-window', changes: [{ path: 'note.txt', before, after }] });
  await recoverProjectTransactions(store, pluginRoot); assert.equal(await readFile(file, 'utf8'), 'before');
  await mkdir(path.join(directory, 'old'), { recursive: true }); await writeFile(path.join(directory, 'old/0'), 'before');
  await atomicJson(path.join(directory, 'journal.json'), { projectId: p.projectId, requestId: 'conflict', state: 'prepared', windowId: 'conflict-window', changes: [{ path: 'note.txt', before, after }] });
  await writeFile(file, 'foreign');
  await assert.rejects(recoverProjectTransactions(store, pluginRoot), /RECOVERY_CONFLICT/); assert.equal(await readFile(file, 'utf8'), 'foreign');
}, false));

test('queued export cancel is project-bound and historical jobs remain addressable', () => fixture(async store => {
  const service = api(store), p = await create(service);
  const args = { projectId: p.projectId, requestId: 'export', expectedRevision: p.revision, versionId: p.version.versionId, audio: 'silent' };
  const exported = await service.call('motion_export_request', args);
  assert.equal((await service.call('motion_export_request', args)).job.id, exported.job.id);
  await assert.rejects(cancelExport(store, crypto.randomUUID(), exported.job.id), /EXPORT_NOT_FOUND/);
  const cancelled = await service.call('motion_export_cancel', { projectId: p.projectId, requestId: 'cancel', jobId: exported.job.id });
  assert.equal(cancelled.job.state, 'cancelled'); assert.equal(await store.claimExport(), null);
  const next = await service.call('motion_export_request', { ...args, requestId: 'export2' });
  assert.notEqual(next.job.id, exported.job.id);
  const old = await service.call('motion_get_project', { projectId: p.projectId, exportJobId: exported.job.id });
  assert.equal(old.exportJob.state, 'cancelled');
}, false));

test('creation supports actual builtin templates and reference carriers, and requirements-only edits are versioned', () => fixture(async store => {
  const service = api(store);
  const template = await service.call('motion_create_project', { requestId: 'template', projectType: 'template', templateId: 'decision-tree', title: 'Real template', requirements: '保留模板默认内容' });
  assert.equal(template.source.id, 'decision-tree'); assert.ok(template.project.html.length > 100);
  const reference = await service.call('motion_create_project', { requestId: 'reference', projectType: 'reference_video', referenceVideoId: 'hf-reference-jake-lovable', title: 'Reference carrier', requirements: '分析参考后重建' });
  assert.equal(reference.source.id, 'hf-reference-jake-lovable'); assert.equal(reference.filmComplete, false);
  const saved = await service.call('motion_edit_project', { projectId: reference.projectId, requestId: 'requirements', expectedRevision: reference.revision, expectedVersionId: reference.currentVersionId, files: [], requirements: '更新需求并保留源码' });
  const after = await service.call('motion_get_project', { projectId: reference.projectId });
  assert.equal(after.requirements, '更新需求并保留源码'); assert.equal(after.project.html, reference.project.html);
  assert.equal(after.currentVersionId, saved.version.versionId);
  const noop = await service.call('motion_edit_project', { projectId: reference.projectId, requestId: 'noop', expectedRevision: after.revision, expectedVersionId: after.currentVersionId, files: [] });
  assert.equal(noop.changed, false); assert.equal(noop.version.versionId, after.currentVersionId);
}, false));

test('runtime schema rejects prototype-property names at the top level and in nested inputs', () => {
  const schema = phase1Tools.find(tool => tool.name === 'motion_get_project')!.inputSchema;
  for (const key of ['constructor', '__proto__', 'toString']) {
    assert.throws(() => validateInput(schema, JSON.parse(`{"${key}":true}`)), /INVALID_ARGUMENT/);
    assert.throws(() => validateInput(schema, { file: JSON.parse(`{"path":"index.html","${key}":true}`) }), /INVALID_ARGUMENT/);
  }
});

test('project pagination rejects cursors with invalid ordering values', () => fixture(async store => {
  const service = api(store);
  for (const after of [['not-a-timestamp', 'id'], [1, {}], [-1, 'id'], [1.5, 'id'], [1, '']]) {
    const cursor = Buffer.from(JSON.stringify({ kind: 'projects', scope: 'workspace', after })).toString('base64url');
    await assert.rejects(service.call('motion_get_project', { cursor }), /INVALID_CURSOR/);
  }
}, false));
