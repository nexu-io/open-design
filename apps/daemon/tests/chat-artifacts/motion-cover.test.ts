import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { afterEach, expect, it } from 'vitest';
import { closeDatabase, openDatabase, upsertMessage } from '../../src/db.js';
import { createChatArtifactBlobStore } from '../../src/chat-artifacts/blob-store.js';
import { captureRunChatArtifactSnapshots } from '../../src/chat-artifacts/run-capture.js';
import { freezeAndRenderChatArtifactCovers } from '../../src/chat-artifacts/cover.js';
import { projectChatArtifactRefs } from '../../src/chat-artifacts/refs.js';
import { readMotionCoverSpec } from '../../src/chat-artifacts/motion-cover.js';

const exec = promisify(execFile);
let root: string;
afterEach(async () => { closeDatabase(); if (root) await fs.rm(root, { recursive: true, force: true }); });

async function capture(poster: string | undefined, overwrite = false, dimensions = { width: 320, duration: 2 }) {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-motion-cover-'));
  const dataDir = path.join(root, 'data');
  const db = openDatabase(root, { dataDir });
  db.prepare('INSERT INTO projects (id,name,created_at,updated_at) VALUES (?,?,?,?)').run('p', 'Motion', 1, 1);
  db.prepare('INSERT INTO conversations (id,project_id,created_at,updated_at) VALUES (?,?,?,?)').run('c', 'p', 1, 1);
  upsertMessage(db, 'c', { id: 'm', role: 'assistant', content: 'Motion film', runId: 'r', runStatus: 'succeeded' });
  const video = path.join(root, 'film.mp4');
  await exec(ffmpeg.path, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=black:s=320x180:r=10:d=1', '-f', 'lavfi', '-i', 'color=red:s=320x180:r=10:d=1', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
  const source = path.join(root, 'index.html');
  await fs.writeFile(source, `<meta name="od-motion-output" content="video"><link rel="alternate" type="video/mp4" href="film.mp4"><main data-composition-id="main" data-duration="${dimensions.duration}" data-width="${dimensions.width}" data-height="180" ${poster === undefined ? '' : `data-poster-time="${poster}"`}></main>`);
  const deps = { db, blobs: createChatArtifactBlobStore({ dataDir }) };
  const captured = await captureRunChatArtifactSnapshots(deps, { projectId: 'p', projectRoot: root, messageId: 'm', runId: 'r', touchedPaths: [source, video] });
  const report = await freezeAndRenderChatArtifactCovers(deps, {
    projectRoot: root, rows: captured.rows, renderer: null,
    ...(overwrite ? { videoFrameExtractor: async ({ outputPath }: { outputPath: string }) => {
      await exec(ffmpeg.path, ['-y', '-loglevel', 'error', '-i', video, '-frames:v', '1', outputPath]);
      await fs.appendFile(source, '<!-- changed -->');
    } } : {}),
  });
  return { report, refs: projectChatArtifactRefs(db, 'p', 'm'), deps };
}

it('extracts the authored time and shares the frozen 16:9 cover without a desktop renderer', async () => {
  const { refs, deps } = await capture('1.2');
  const html = refs.find(ref => ref.kind === 'html')!;
  const video = refs.find(ref => ref.kind === 'video')!;
  expect(html.snapshotState).toBe('ready');
  expect(video.snapshotState).toBe('ready');
  expect(video).toMatchObject({ motionPreview: { width: 320, height: 180, posterTime: 1.2 } });
  expect(html.motionPreview).toEqual(video.motionPreview);
  const ids = [html, video].map(ref => ref.snapshotId!);
  const db = deps.db;
  const rows = ids.map(id => db.prepare('SELECT thumbnail_digest AS digest FROM chat_artifact_snapshots WHERE id=?').get(id) as { digest: string });
  expect(rows[0]!.digest).toBe(rows[1]!.digest);
  const blob = db.prepare('SELECT storage_key AS key FROM chat_artifact_blobs WHERE digest=?').get(rows[0]!.digest) as {key:string};
  const { stdout } = await exec(ffmpeg.path, ['-loglevel', 'error', '-i', path.join(root, 'data/chat-artifact-blobs', blob.key), '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer' });
  expect(stdout[0]).toBeGreaterThan(180);
  expect(stdout[1]).toBeLessThan(30);
});

it.each(['-1', '2', 'NaN'])('refuses invalid authored poster time %s without substituting a first frame', async (time) => {
  const { refs, report } = await capture(time);
  expect(report.failed).toBe(2);
  expect(refs.every(ref => ref.snapshotState === 'failed' && !ref.thumbnailUrl)).toBe(true);
});

it('refuses a cover if the source changes while its frame is decoded', async () => {
  const { refs } = await capture('1.2', true);
  expect(refs.every(ref => ref.snapshotState === 'failed')).toBe(true);
});

it.each([{ width: 640, duration: 2 }, { width: 320, duration: 3 }])('verifies the real MP4 against declared dimensions/clock %j', async (dimensions) => {
  const { refs, report } = await capture('1.2', false, dimensions);
  expect(report.failed).toBe(2);
  expect(refs.every(ref => ref.snapshotState === 'failed' && !ref.motionPreview)).toBe(true);
});

it('retains first-frame compatibility for legacy sources without a poster declaration', async () => {
  const { refs, report } = await capture(undefined);
  const video = refs.find(ref => ref.kind === 'video')!;
  expect(report.frozen).toBe(1);
  expect(video.snapshotState).toBe('ready');
  expect(video.motionPreview).toBeUndefined();
});

it('refuses an explicit cover declaration without composition dimensions', () => {
  expect(() => readMotionCoverSpec('<meta name="od-motion-output" content="video"><link rel="alternate" type="video/mp4" href="film.mp4"><main data-composition-id="main" data-poster-time="1"></main>', 'index.html')).toThrow();
});
