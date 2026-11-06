import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyExport, verificationBinaries } from '../scripts/verify-export.ts';
import type { ExportExpectation } from '../shared/export-spec.ts';
import { callTool } from '../mcp.ts';
import { pluginRoot, snapshotExportExpectation } from '../hyperframes.ts';
import { WorkspaceStore } from '../workspace.ts';

const binaries = verificationBinaries();
const available = Object.values(binaries).every(binary => spawnSync(binary, ['-version'], { timeout: 10_000 }).status === 0);
const spec: ExportExpectation = { width: 320, height: 180, fps: 30, duration: 1, audio: 'silent' };
async function fixture(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'motion-verify-'));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
function clip(file: string, size = '320x180', fps = '30', audio = false) {
  const result = spawnSync(binaries.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
    `testsrc2=s=${size}:r=${fps}:d=1`, ...(audio ? ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'aac'] : ['-an']),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', file], { timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr?.toString());
}
function source(fps = '30', duration = 1) {
  return `<!doctype html><html><head><title>Verification input</title></head><body><div data-composition-id="main" data-start="0" data-duration="${duration}" data-width="320" data-height="180" ${fps ? `data-fps="${fps}"` : ''}>Native composition</div></body></html>`;
}

test('verification rejects invalid expectations and missing files without reporting a pass', () => fixture(async directory => {
  for (const invalid of [{ duration: NaN }, { duration: 0 }, { fps: 0 }, { fps: 241 }, { width: -1 }, { height: 1.5 }, { audio: 'invented' }]) {
    await assert.rejects(verifyExport(path.join(directory, 'absent.mp4'), { ...spec, ...invalid } as ExportExpectation), /Expected export specification/);
  }
  // Native compositions are no longer limited to 60 seconds or frame-aligned durations.
  for (const duration of [1, 1.01, 61]) {
    const report = await verifyExport(path.join(directory, 'absent.mp4'), { ...spec, duration });
    assert.equal(report.status, 'failed'); assert.equal(report.checks[0].name, 'file');
  }
}));

test('snapshot specifications use the native fps default and rational frame rates', () => fixture(async directory => {
  for (const [authored, expected] of [['', 30], ['24', 24], ['30000/1001', 30000 / 1001]] as const) {
    await writeFile(path.join(directory, 'index.html'), source(authored, 61));
    const result = await snapshotExportExpectation(pluginRoot, directory);
    assert.deepEqual(result, { width: 320, height: 180, fps: expected, duration: 61, audio: 'optional' });
  }
  await writeFile(path.join(directory, 'index.html'), source('invalid'));
  await assert.rejects(snapshotExportExpectation(pluginRoot, directory), /帧率无效/);
}));

test('native H.264 export passes full decode and seeks, while creative and playback checks remain explicit', { skip: !available }, () => fixture(async directory => {
  const file = path.join(directory, 'valid.mp4'); clip(file);
  const report = await verifyExport(file, spec);
  assert.equal(report.status, 'passed', JSON.stringify(report));
  assert.match(report.sha256!, /^[a-f0-9]{64}$/);
  for (const name of ['full-decode', 'seek-first', 'seek-middle', 'seek-last']) assert.equal(report.checks.find(c => c.name === name)?.status, 'passed');
  assert.equal(report.remainingChecks.length, 3);
  const before = await readFile(file);
  const wrongDuration = await verifyExport(file, { ...spec, duration: 2 });
  assert.equal(wrongDuration.status, 'failed');
  assert.equal(wrongDuration.checks.find(c => c.name === 'duration')?.status, 'failed');
  assert.equal(wrongDuration.checks.find(c => c.name === 'seek-last')?.status, 'failed');
  assert.deepEqual(await readFile(file), before, 'Verification must not modify media.');
}));

test('wrong dimensions/fps, truncated media, and missing tools cannot silently pass', { skip: !available }, () => fixture(async directory => {
  const file = path.join(directory, 'wrong-size.mp4'); clip(file, '640x360', '24');
  const wrong = await verifyExport(file, spec);
  for (const name of ['dimensions', 'frame-rate']) assert.equal(wrong.checks.find(c => c.name === name)?.status, 'failed');
  assert.equal(wrong.status, 'failed');
  const valid = path.join(directory, 'valid.mp4'); clip(valid);
  const truncated = path.join(directory, 'truncated.mp4');
  const bytes = await readFile(valid);
  await writeFile(truncated, bytes.subarray(0, Math.floor(bytes.length * 0.7)));
  const corrupt = await verifyExport(truncated, spec);
  assert.equal(corrupt.status, 'failed', JSON.stringify(corrupt));
  const missing = await verifyExport(valid, spec, { ...binaries, ffprobe: path.join(directory, 'missing-ffprobe') });
  assert.equal(missing.status, 'blocked');
  assert.equal(missing.checks.find(c => c.name === 'probe')?.status, 'not_run');
}));

test('soundtracks are decoded and required/silent audio policies cannot silently pass mismatches', { skip: !available }, () => fixture(async directory => {
  const silent = path.join(directory, 'silent.mp4'); clip(silent);
  const required = await verifyExport(silent, { ...spec, audio: 'required' });
  assert.equal(required.status, 'failed'); assert.equal(required.checks.find(c => c.name === 'audio')?.status, 'failed');
  const audible = path.join(directory, 'audible.mp4'); clip(audible, '320x180', '30', true);
  const report = await verifyExport(audible, { ...spec, audio: 'required' });
  assert.equal(report.status, 'passed', JSON.stringify(report));
  assert.equal(report.checks.find(c => c.name === 'full-decode')?.status, 'passed');
  const forbidden = await verifyExport(audible, spec);
  assert.equal(forbidden.status, 'failed'); assert.equal(forbidden.checks.find(c => c.name === 'audio')?.status, 'failed');
}));

test('MCP verification binds job ID/revision and preserves snapshot specifications across later edits', { skip: !available }, () => fixture(async directory => {
  const store = new WorkspaceStore(directory);
  const saved = await store.writeFiles((await store.get()).revision, [{ path: 'index.html', content: source() }]);
  const requested = await store.requestExport(saved.revision);
  assert.deepEqual(requested.expected, { ...spec, audio: 'optional' });
  await assert.rejects(callTool('motion_verify_export', { jobId: requested.id, expectedRevision: saved.revision }, store), /已完成/);
  const claimed = (await store.claimExport())!;
  // Later active-project edits cannot change the captured snapshot specification.
  await store.writeFiles(saved.revision, [{ path: 'index.html', content: source('24', 2).replace('data-width="320"', 'data-width="640"') }]);
  const expected = await snapshotExportExpectation(pluginRoot, store.snapshotDirectory(requested.id));
  assert.deepEqual(expected, { ...spec, audio: 'optional' });
  assert.deepEqual((await store.job())!.expected, expected);
  await mkdir(path.join(directory, 'exports'));
  clip(path.join(directory, 'exports', requested.id + '.mp4'));
  await store.finishExport(requested.id, claimed.token!);
  await rm(store.snapshotDirectory(requested.id), { recursive: true });
  const report = await callTool('motion_verify_export', { jobId: requested.id, expectedRevision: saved.revision, audio: 'silent' }, store) as any;
  assert.equal(report.status, 'passed', JSON.stringify(report));
  assert.deepEqual(report.expected, spec); assert.equal(report.revision, saved.revision);
  await assert.rejects(callTool('motion_verify_export', { jobId: 'other-job', expectedRevision: saved.revision }, store), /已完成/);
  await assert.rejects(callTool('motion_verify_export', { jobId: requested.id, expectedRevision: 'f'.repeat(64) }, store), /已完成/);
  await assert.rejects(callTool('motion_verify_export', { jobId: requested.id, expectedRevision: saved.revision, audio: 'invented' }, store), /Expected export specification/);
  const old = (await store.job())!; delete old.expected;
  await store.saveJob(old);
  await assert.rejects(callTool('motion_verify_export', { jobId: requested.id, expectedRevision: saved.revision }, store), /快照规格/);
}));

test('legacy numeric verification remains compatible while native exports use explicit specifications', { skip: !available }, () => fixture(async directory => {
  const file = path.join(directory, 'legacy.mp4'); clip(file, '540x960', '24');
  const report = await verifyExport(file, 1);
  assert.equal(report.status, 'passed', JSON.stringify(report));
  assert.deepEqual(report.expected, { width: 540, height: 960, fps: 24, duration: 1, audio: 'silent' });
  await assert.rejects(verifyExport(file, 61), /Expected duration/);
  await assert.rejects(verifyExport(file, 1.01), /Expected duration/);
}));
