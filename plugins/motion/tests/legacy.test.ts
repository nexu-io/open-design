import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateProject } from '../shared/legacy.ts';
import { fixture, legacyProject } from './fixtures.ts';
import { pluginRoot, inspectProject } from '../hyperframes.ts';

test('legacy validation rejects dangling media and invalid source ranges before migration', () => {
  const project = legacyProject(); project.shots[0].assetId = 'missing';
  assert.throws(() => validateProject(project), /不存在/);
  project.assets.push({ id: 'missing', name: 'clip.mp4', data: 'data:video/mp4;base64,AAAA', type: 'video', duration: 2 });
  assert.throws(() => validateProject(project), /超出/);
  project.shots[0].duration = 1; project.shots[0].start = 1;
  assert.equal(validateProject(project).shots[0].start, 1);
} );
test('legacy conversion preserves embedded media bytes, source trims and clip durations as native HTML', () => fixture(async store => {
  const project = legacyProject();
  project.assets.push({ id: 'video', name: 'reference.mp4', data: 'data:video/mp4;base64,AAAA', type: 'video', duration: 20 });
  project.shots[1].assetId = 'video'; project.shots[1].start = 4;
  const old = JSON.stringify({ project, revision: 2 }); await writeFile(path.join(store.directory, 'workspace.json'), old);
  await store.initialize(pluginRoot);
  assert.deepEqual(await readFile(path.join(store.projectDirectory, 'assets/media-0.mp4')), Buffer.from([0, 0, 0]));
  assert.match((await store.readFile('compositions/shot-1.html')).content, /data-media-start="4"/);
  assert.equal(await readFile(path.join(store.directory, 'workspace.json'), 'utf8'), old);
  const native = await inspectProject(pluginRoot, store.projectDirectory, 'timeline');
  assert.equal(native.result.timeline.duration, 9);
  assert.ok(native.result.timeline.tracks.some(track => track.rows.some(row => row.id === 'shot-1' && row.start === 3 && row.duration === 3)));
}, false));
test('malformed legacy data is never silently replaced with a new sample', () => fixture(async store => {
  await writeFile(path.join(store.directory, 'workspace.json'), '{broken');
  await assert.rejects(store.initialize(pluginRoot));
  assert.equal((await store.get()).project, null);
  assert.equal(await readFile(path.join(store.directory, 'workspace.json'), 'utf8'), '{broken');
}, false));
