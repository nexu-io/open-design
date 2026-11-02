import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  compareMotionFilms,
  MotionCompareError,
  parseDuration,
  parseSsim,
  pickCompareTimes,
} from '../../src/media/motion-compare.js';

const BANNER = `  Duration: 00:00:12.34, start: 0.000000, bitrate: 2102 kb/s`;

describe('motion compare parsing', () => {
  it('reads a duration from the ffmpeg banner', () => {
    expect(parseDuration(BANNER)).toBe(12.34);
    expect(parseDuration('no duration here')).toBe(0);
  });

  it('reads the ssim score and ignores unrelated output', () => {
    expect(parseSsim('[Parsed_ssim_0] SSIM Y:0.99 U:0.98 V:0.97 All:0.9843 (18.04)')).toBe(0.9843);
    expect(parseSsim('no score')).toBeNull();
  });

  it('opens and closes the film, and puts a frame at the head of every shot', () => {
    const times = pickCompareTimes(20, undefined, [5, 12]);
    expect(times[0]).toBeLessThan(1);
    expect(Math.max(...times)).toBeLessThan(20);
    expect(times.some((t) => t >= 5 && t < 6)).toBe(true);
    expect(times.some((t) => t >= 12 && t < 13)).toBe(true);
    expect(times.length).toBeLessThanOrEqual(12);
  });

  it('uses the times the caller asked for, clamped inside the film', () => {
    expect(pickCompareTimes(10, [2, 99], [])).toEqual([2, 9.8]);
  });
});

describe('compareMotionFilms', () => {
  let project = '';
  const ff = ffmpegInstaller.path;

  const make = (name: string, filter: string) => {
    const made = spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', filter,
      '-t', '4', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(project, name)]);
    expect(made.status).toBe(0);
  };

  beforeAll(async () => {
    project = await mkdtemp(path.join(os.tmpdir(), 'motion-cmp-'));
    make('ref.mp4', 'color=c=red:s=640x360:d=4');
    make('same.mp4', 'color=c=red:s=640x360:d=4');
    make('other.mp4', 'color=c=blue:s=640x360:d=4');
    make('short.mp4', 'color=c=red:s=640x360:d=1.5');
    make('portrait.mp4', 'color=c=red:s=360x640:d=4');
    await writeFile(path.join(project, 'notes.txt'), 'not a video');
  });

  afterAll(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('scores an identical film as a near match and writes the pairs', async () => {
    const r = await compareMotionFilms({ projectDir: project, reference: 'ref.mp4', candidate: 'same.mp4', times: [0.5, 2], id: 'a' });
    expect(r.dir).toBe('.motion-compare/a');
    expect(r.referenceDurationSec).toBeCloseTo(4, 0);
    expect(r.pairs).toHaveLength(2);
    expect(r.pairs[0]!.ssim).toBeGreaterThan(0.95);
    expect(r.worst!.ssim).toBeGreaterThan(0.95);
    expect((await readFile(path.join(project, r.sheet))).length).toBeGreaterThan(1000);
    const facts = JSON.parse(await readFile(path.join(project, r.facts), 'utf8'));
    expect(facts.pairs).toHaveLength(2);
  });

  it('marks a film that drifted from the reference, and names where', async () => {
    const r = await compareMotionFilms({ projectDir: project, reference: 'ref.mp4', candidate: 'other.mp4', times: [0.5, 2], id: 'b' });
    expect(r.pairs[0]!.ssim).toBeLessThan(0.5);
    expect(r.worst!.ssim).toBeLessThan(0.5);
  });

  it('skips timestamps past the end of the film instead of failing', async () => {
    const r = await compareMotionFilms({ projectDir: project, reference: 'ref.mp4', candidate: 'short.mp4', times: [0.5, 3.5], id: 'c' });
    expect(r.pairs).toHaveLength(1);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]!.reason).toContain('ends at');
    expect(r.durationDeltaSec).toBeLessThan(0);
  });

  it('compares a portrait film against a landscape reference on one canvas', async () => {
    const r = await compareMotionFilms({ projectDir: project, reference: 'ref.mp4', candidate: 'portrait.mp4', times: [0.5, 2], id: 'p' });
    expect(r.pairs).toHaveLength(2);
    expect(r.skipped).toHaveLength(0);
    expect([r.width, r.height]).toEqual([640, 360]);
    expect(r.pairs[0]!.ssim).toBeLessThan(1);
  });

  it('refuses a path outside the project and a non-video', async () => {
    await expect(compareMotionFilms({ projectDir: project, reference: '../etc/passwd', candidate: 'ref.mp4' }))
      .rejects.toBeInstanceOf(MotionCompareError);
    await expect(compareMotionFilms({ projectDir: project, reference: 'ref.mp4', candidate: 'notes.txt' }))
      .rejects.toMatchObject({ code: 'NO_VIDEO' });
  });

  it('refuses a video reached through a symlinked parent directory', async () => {
    const outside = path.join(project, 'outside-secret');
    await mkdir(outside, { recursive: true });
    await copyFile(path.join(project, 'ref.mp4'), path.join(outside, 'ref.mp4'));
    const inside = path.join(project, 'symlink-case');
    await mkdir(inside, { recursive: true });
    await copyFile(path.join(project, 'same.mp4'), path.join(inside, 'same.mp4'));
    await symlink(outside, path.join(inside, 'outside-dir'));
    await expect(compareMotionFilms({ projectDir: inside, reference: 'outside-dir/ref.mp4', candidate: 'same.mp4', times: [0.5], id: 'e' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('works in a project whose only files sit at the top level', async () => {
    const fresh = path.join(project, 'fresh');
    await mkdir(fresh, { recursive: true });
    await copyFile(path.join(project, 'ref.mp4'), path.join(fresh, 'ref.mp4'));
    await copyFile(path.join(project, 'same.mp4'), path.join(fresh, 'same.mp4'));
    const r = await compareMotionFilms({ projectDir: fresh, reference: 'ref.mp4', candidate: 'same.mp4', times: [1], id: 'd' });
    expect(r.pairs).toHaveLength(1);
    expect(r.sheet).toContain('.motion-compare/d/');
  });
});
