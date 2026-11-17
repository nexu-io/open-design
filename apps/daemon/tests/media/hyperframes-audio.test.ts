import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { hyperFramesAudioEncodingArgs, prepareHyperFramesAudio } from '../../src/media/hyperframes-audio.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hf-audio-'));
  await writeFile(path.join(root, 'music.mp3'), 'fixture');
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

it('resolves a timed local track and keeps frame capture silent', async () => {
  const result = await prepareHyperFramesAudio('<audio id="sound" src="music.mp3" data-start="2" data-duration="3" data-volume="0.5"></audio>', root);
  expect(result.tracks).toMatchObject([{ start: 2, duration: 3, volume: .5 }]);
  expect(result.html).not.toContain('<audio');
  expect(result.html).toContain('id="sound"');
});

it('rejects remote assets and symlinks outside the composition', async () => {
  await expect(prepareHyperFramesAudio('<audio src="https://example.com/music.mp3" data-duration="3"></audio>', root)).rejects.toThrow('local relative');
  const outside = await mkdtemp(path.join(tmpdir(), 'hf-audio-outside-'));
  try {
    await writeFile(path.join(outside, 'private.mp3'), 'private');
    await symlink(path.join(outside, 'private.mp3'), path.join(root, 'escape.mp3'));
    await expect(prepareHyperFramesAudio('<audio src="escape.mp3" data-duration="3"></audio>', root)).rejects.toThrow('inside');
  } finally { await rm(outside, { recursive: true, force: true }); }
});

it.each(['data-start="intro + 2"', 'data-volume="2"', 'loop', 'data-media-start="2"'])(
  'rejects unsupported audio semantics: %s', async (attribute) => {
    await expect(prepareHyperFramesAudio(`<audio src="music.mp3" data-duration="3" ${attribute}></audio>`, root)).rejects.toThrow();
  },
);

it('fades each track out where it stops sounding, including a cut at the film end', () => {
  const track = { file: 'music.mp3', format: 'mp3', volume: 1 };
  const graph = (tracks: Parameters<typeof hyperFramesAudioEncodingArgs>[0], duration: number) =>
    hyperFramesAudioEncodingArgs(tracks, duration)[1];
  // Music authored for 15 s in a film cut to 10 s fades over the film's last 0.6 s.
  expect(graph([{ ...track, start: 0, duration: 15 }], 10)).toContain('afade=t=out:st=9.4:d=0.6');
  // A track that ends inside the film fades at its own end, offset by its start.
  expect(graph([{ ...track, start: 2, duration: 4 }], 10)).toContain('afade=t=out:st=3.4:d=0.6');
  // Short tracks keep most of their sound: the fade is at most a quarter of what plays.
  expect(graph([{ ...track, start: 0, duration: 1 }], 10)).toContain('afade=t=out:st=0.75:d=0.25');
  // A track that starts after the film ends contributes no fade.
  expect(graph([{ ...track, start: 12, duration: 3 }], 10)).not.toContain('afade');
});
