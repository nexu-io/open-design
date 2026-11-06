import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WorkspaceStore, Conflict } from '../workspace.ts';
import { callTool } from '../mcp.ts';
import { pluginRoot, inspectProject } from '../hyperframes.ts';
import { transport } from './http.ts';
import { fixture, legacyProject } from './fixtures.ts';

test('Studio source changes are visible to MCP; MCP source writes reach the same native files', () => fixture(async store => {
  const first = await store.get();
  const source = (await store.readFile('compositions/first.html')).content;
  await writeFile(path.join(store.projectDirectory, 'compositions/first.html'), source.replace('Make it', 'Studio edit'));
  const read = await callTool('motion_get_project', {}, new WorkspaceStore(store.directory));
  assert.notEqual(read.revision, first.revision); assert.equal(read.project!.format, 'hyperframes');
  assert.ok(!JSON.stringify(read).includes('base64'));
  await assert.rejects(store.writeFiles(first.revision, [{ path: 'index.html', content: 'stale' }]), Conflict);
  const next = await callTool('motion_write_files', { expectedRevision: read.revision, files: [{ path: 'compositions/first.html', content: source.replace('Make it', 'Agent edit') }] }, store);
  assert.match((await store.readFile('compositions/first.html')).content, /Agent edit/);
  assert.equal((await new WorkspaceStore(store.directory).get()).revision, next.revision);
  const browser = await (await transport(store)('/api/project')).json(); assert.equal(browser.revision, next.revision);
}));
test('concurrent Agent writers serialize and reject a stale revision', () => fixture(async store => {
  const first = await store.get(), other = new WorkspaceStore(store.directory);
  const results = await Promise.allSettled([
    store.writeFiles(first.revision, [{ path: 'notes.md', content: 'A' }]),
    other.writeFiles(first.revision, [{ path: 'notes.md', content: 'B' }]),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.ok((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason instanceof Conflict);
}));
test('invalid batch paths and symbolic links cannot escape or partially overwrite a project', () => fixture(async store => {
  const first = await store.get();
  for (const invalid of ['../outside.html', '/tmp/outside.html', 'assets/../../outside.html', 'a\\b.js', '.env', 'node_modules/x.js']) {
    await assert.rejects(store.writeFiles(first.revision, [{ path: 'index.html', content: 'bad' }, { path: invalid, content: 'bad' }]));
    assert.equal((await store.get()).revision, first.revision);
  }
  await symlink(store.directory, path.join(store.projectDirectory, 'escape'));
  await assert.rejects(store.readFile('escape/outside.html'), /符号链接/);
  await assert.rejects(store.writeFiles(first.revision, [{ path: 'escape/outside.html', content: 'bad' }]), /符号链接/);
  await rm(path.join(store.projectDirectory, 'escape'));
  assert.equal((await store.get()).revision, first.revision);
}));
test('asset imports are local files and their content participates in revisions', () => fixture(async store => {
  const source = path.join(store.directory, 'audio.wav'); await writeFile(source, Buffer.from([1, 2, 3, 4]));
  const first = await store.get();
  const next = await store.importAsset(first.revision, source, 'assets/audio.wav');
  assert.notEqual(next.revision, first.revision);
  assert.deepEqual(await readFile(path.join(store.projectDirectory, 'assets/audio.wav')), Buffer.from([1, 2, 3, 4]));
  await assert.rejects(store.importAsset(next.revision, source, '../outside.wav'));
  await writeFile(path.join(store.projectDirectory, 'assets/audio.wav'), Buffer.from([4, 3, 2, 1]));
  assert.notEqual((await store.get()).revision, next.revision);
}));
test('render snapshots include scene sources and assets and survive later Studio edits', () => fixture(async store => {
  const initial = await store.get(); const job = await store.requestExport(initial.revision);
  await store.writeFiles(initial.revision, [{ path: 'compositions/first.html', content: '<template>next version</template>' }]);
  assert.equal(store.revision(await store.files(store.snapshotDirectory(job.id))), initial.revision);
  const claimed = await store.claimExport(); assert.equal(claimed!.id, job.id);
  assert.equal(await new WorkspaceStore(store.directory).claimExport(), null);
  assert.equal((await store.status()).exportJob!.token, undefined);
  await assert.rejects(store.finishExport(job.id, 'wrong', 'bad'));
  await store.finishExport(job.id, claimed!.token!, 'renderer failed');
  assert.equal((await store.status()).exportJob!.state, 'failed');
}));
test('native Studio motion manifests participate in revisions and snapshots; preview caches do not', () => fixture(async store => {
  const before = await store.get();
  await mkdir(path.join(store.projectDirectory, '.hyperframes/preview'), { recursive: true });
  await writeFile(path.join(store.projectDirectory, '.hyperframes/preview/cached.html'), 'cache');
  assert.equal((await store.get()).revision, before.revision);
  for (const name of ['studio-motion.json', 'studio-manual-edits.json']) await writeFile(path.join(store.projectDirectory, '.hyperframes', name), '{"version":1}');
  const after = await store.get(); assert.notEqual(after.revision, before.revision);
  const job = await store.requestExport(after.revision);
  for (const name of ['studio-motion.json', 'studio-manual-edits.json']) assert.equal(await readFile(path.join(store.snapshotDirectory(job.id), '.hyperframes', name), 'utf8'), '{"version":1}');
  await assert.rejects(readFile(path.join(store.snapshotDirectory(job.id), '.hyperframes/preview/cached.html')), /ENOENT/);
}));
test('stale export requests, dead workers, missing output and expiry are reported honestly', () => fixture(async store => {
  const initial = await store.get();
  await assert.rejects(store.requestExport('0'.repeat(64)), Conflict);
  const job = await store.requestExport(initial.revision);
  await store.saveJob({ ...job, expiresAt: Date.now() - 1 });
  assert.equal((await store.status()).exportJob!.state, 'failed'); assert.equal(await store.claimExport(), null);
  const retry = await store.requestExport(initial.revision); const claimed = await store.claimExport();
  await assert.rejects(store.finishExport(retry.id, claimed!.token!));
  await store.saveJob({ ...claimed!, workerPid: 2147483647 });
  assert.equal((await store.status()).exportJob!.state, 'failed');
  await store.saveJob({ ...retry, state: 'completed', file: `exports/${retry.id}.mp4` });
  const read = await callTool('motion_get_export', {}, store);
  assert.equal(read.job!.state, 'failed'); assert.equal(read.path, undefined);
}));
test('new project and migrated legacy projects pass the actual Hyperframes linter', () => fixture(async store => {
  const fresh = await inspectProject(pluginRoot, store.projectDirectory, 'lint');
  assert.equal(fresh.exitCode, 0); assert.equal(fresh.result.warningCount, 0);
  const legacy = legacyProject(); legacy.shots[0].caption = '<script>alert("text")</script>';
  const old = JSON.stringify({ revision: 7, project: legacy, exportJob: null });
  const other = new WorkspaceStore(path.join(store.directory, 'legacy')); await mkdir(other.directory);
  await writeFile(path.join(other.directory, 'workspace.json'), old); await other.initialize(pluginRoot);
  assert.equal(await readFile(path.join(other.directory, 'workspace.json'), 'utf8'), old);
  assert.match((await other.readFile('compositions/shot-0.html')).content, /&lt;script&gt;/);
  const lint = await inspectProject(pluginRoot, other.projectDirectory, 'lint'); assert.equal(lint.exitCode, 0, JSON.stringify(lint.result));
  const timeline = await inspectProject(pluginRoot, other.projectDirectory, 'timeline');
  assert.equal(timeline.result.timeline.duration, 9);
  assert.equal(timeline.result.timeline.tracks[0].rows.length, 3);
  const before = await other.get(); await other.initialize(pluginRoot); assert.equal((await other.get()).revision, before.revision);
}));
