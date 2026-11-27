import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, it } from 'vitest';
import { compareMotionFilms, parseSsim } from '../../src/media/motion-compare.js';

it('reads a negative overall SSIM from FFmpeg output', () => {
  const stderr = '[Parsed_ssim_2] SSIM Y:-0.768285 U:0.999969 V:0.999969 All:-0.178867 (-0.714648)';
  assert.equal(parseSsim(stderr), -0.1789);
});

it('preserves positive, zero, and perfect-match SSIM scores', () => {
  assert.equal(parseSsim('All:0.984345 (18.04)'), 0.9843);
  assert.equal(parseSsim('All:0.000000 (0.000000)'), 0);
  assert.equal(parseSsim('All:1.000000 (inf)'), 1);
});

it('does not turn missing or invalid scores into comparison measurements', () => {
  for (const stderr of ['no score', 'All:nan', 'All:-inf', 'All:.', 'All:1.2.3']) {
    assert.equal(parseSsim(stderr), null, stderr);
  }
});

let project = '';
const ff = process.env.HYPERFRAMES_FFMPEG_PATH?.trim() || ffmpegInstaller.path;

beforeAll(async () => {
  project = await mkdtemp(path.join(os.tmpdir(), 'motion-negative-ssim-'));
  // Inverted spatial detail has a valid negative SSIM. Flat colors alone do not
  // exercise this: they have no structure for the metric to anticorrelate.
  const pattern = 'nullsrc=s=640x360:r=8,geq=lum=128+100*sin(2*PI*X/32)*sin(2*PI*Y/32):cb=128:cr=128';
  for (const [name, filter] of [
    ['reference.mp4', pattern],
    ['inverted.mp4', `${pattern},negate`],
    ['mixed.mp4', `${pattern},negate=enable='gte(t,0.5)'`],
  ] as const) {
    const made = spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', filter, '-t', '1', '-c:v', 'libx264', '-crf', '0',
      '-pix_fmt', 'yuv420p', path.join(project, name)], {
      encoding: 'utf8', timeout: 10_000, killSignal: 'SIGKILL',
    });
    assert.equal(made.status, 0, made.stderr || String(made.error));
  }
});

afterAll(async () => {
  if (project) await rm(project, { recursive: true, force: true });
});

it('keeps negative comparisons and writes their images and facts', async () => {
  const result = await compareMotionFilms({
    projectDir: project, reference: 'reference.mp4', candidate: 'inverted.mp4',
    times: [0.25], id: 'inverted',
  });
  assert.equal(result.pairs.length, 1);
  assert.deepEqual(result.skipped, []);
  assert.ok(result.pairs[0]!.ssim < 0);
  assert.equal(result.worst?.ssim, result.pairs[0]!.ssim);
  for (const file of [result.pairs[0]!.pair, result.sheet]) {
    assert.ok(file.length > 0);
    assert.ok((await stat(path.join(project, file))).size > 0);
  }
  const facts = JSON.parse(await readFile(path.join(project, result.facts), 'utf8'));
  assert.equal(facts.pairs[0].ssim, result.pairs[0]!.ssim);
});

it('selects the negative sample as the worst frame instead of omitting it', async () => {
  const result = await compareMotionFilms({
    projectDir: project, reference: 'reference.mp4', candidate: 'mixed.mp4',
    times: [0.25, 0.75], id: 'mixed',
  });
  assert.deepEqual(result.pairs.map(pair => pair.at), [0.25, 0.75]);
  assert.deepEqual(result.skipped, []);
  assert.ok(result.pairs[0]!.ssim > 0.95);
  assert.ok(result.pairs[1]!.ssim < 0);
  assert.deepEqual(result.worst, { at: 0.75, ssim: result.pairs[1]!.ssim });
});
