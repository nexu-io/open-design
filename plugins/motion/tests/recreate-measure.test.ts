import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { assertSkillFrontmatterYaml } from '../scripts/check.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const measurer = path.join(root, 'skills/motion-recreate/scripts/measure_frame.mjs');
const ffmpeg = process.env.HYPERFRAMES_FFMPEG_PATH || process.env.FFMPEG_PATH || 'ffmpeg';
const hasFfmpeg = spawnSync(ffmpeg, ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

test('skill frontmatter check rejects plain values that YAML cannot parse', async () => {
  assert.throws(() => assertSkillFrontmatterYaml('name: x\ndescription: Use it, even with no other words: a bare link', 'x'), /folded block/);
  assert.throws(() => assertSkillFrontmatterYaml('name: x\ndescription: keep #1 and # this', 'x'), /folded block/);
  assertSkillFrontmatterYaml('name: x\ndescription: >-\n  Use it, even with no other words: a bare link\nmetadata:\n  status: ready', 'x');
  assertSkillFrontmatterYaml('name: x\ndescription: "quoted: value"', 'x');
  const recreate = await readFile(path.join(root, 'skills/motion-recreate/SKILL.md'), 'utf8');
  assertSkillFrontmatterYaml(recreate.match(/^---\n([\s\S]*?)\n---/)![1], 'motion-recreate');
});

test('measure_frame never reports a missing element as measured', { skip: !hasFfmpeg && 'ffmpeg/ffprobe unavailable' }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'measure-frame-'));
  try {
    const make = (name: string, filter: string) => {
      const file = path.join(directory, name);
      const made = spawnSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', `color=c=black:s=320x180:d=1:r=10${filter}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
      assert.equal(made.status, 0, made.stderr?.toString());
      return file;
    };
    const box = make('box.mp4', ',drawbox=x=100:y=60:w=60:h=40:color=white:t=fill');
    const blank = make('blank.mp4', '');
    const measure = (ref: string, remix: string, region: string) =>
      spawnSync(process.execPath, [measurer, ref, remix, '--t', '0.5', '--region', region], { encoding: 'utf8' });

    const same = JSON.parse(measure(box, box, '80,40,100,80').stdout);
    assert.equal(same.region_status, 'measured');
    assert.equal(same.height_ok, true);
    assert.equal(same.clipped, false);

    const missing = JSON.parse(measure(box, blank, '80,40,100,80').stdout);
    assert.equal(missing.region_status, 'failed');
    assert.equal(missing.height_ok, false);
    assert.equal(missing.clipped, null);
    assert.equal(missing.height_ratio, undefined);

    const emptyReference = JSON.parse(measure(blank, box, '80,40,100,80').stdout);
    assert.equal(emptyReference.region_status, 'blocked');
    assert.equal(emptyReference.height_ok, false);

    for (const region of ['300,40,100,80', '-1,0,10,10', '0,0,0,10', '1,2,3']) {
      const rejected = measure(box, box, region);
      assert.equal(rejected.status, 1, region);
      assert.match(rejected.stderr, /--region/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
