import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { describe, it } from 'vitest';

import { hyperFramesAudioEncodingArgs, type HyperFramesAudioTrack } from '../../src/media/hyperframes-audio.js';

const ffmpegPath = process.env.HYPERFRAMES_FFMPEG_PATH?.trim()
  || (createRequire(import.meta.url)('@ffmpeg-installer/ffmpeg') as { path: string }).path;
const SAMPLE_RATE = 8000;
const FILM_DURATION = 4;
const CHANNELS = 2;
type SignalTrack = HyperFramesAudioTrack & { signal: string };

function tone(frequency: number, duration: number, input: Partial<HyperFramesAudioTrack> = {}): SignalTrack {
  return {
    file: 'signal.wav', format: 'wav', start: 0, duration, volume: 1,
    ...input,
    signal: `sine=frequency=${frequency}:sample_rate=${SAMPLE_RATE}:duration=${duration}`,
  };
}

async function render(tracks: SignalTrack[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `color=black:s=16x16:r=10:d=${FILM_DURATION}`,
      ...tracks.flatMap((track) => ['-f', 'lavfi', '-i', track.signal]),
      ...hyperFramesAudioEncodingArgs(tracks, FILM_DURATION),
      // Inspect the production mix as PCM without lossy AAC quantization.
      '-vn', '-c:a', 'pcm_f32le', '-f', 'f32le', '-ar', String(SAMPLE_RATE), 'pipe:1',
    ], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024, timeout: 10_000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

function rms(pcm: Buffer, start: number, end: number): number {
  const first = Math.round(start * SAMPLE_RATE) * CHANNELS;
  const last = Math.round(end * SAMPLE_RATE) * CHANNELS;
  assert.ok(last * 4 <= pcm.length, 'the output must include the measured time window');
  let energy = 0;
  for (let sample = first; sample < last; sample += 1) {
    energy += pcm.readFloatLE(sample * 4) ** 2;
  }
  return Math.sqrt(energy / (last - first));
}

describe('HyperFrames audio mix levels', () => {
  it('does not turn up a continuing track when a shorter muted track ends', async () => {
    const pcm = await render([tone(440, FILM_DURATION), tone(880, 1, { volume: 0 })]);
    const before = rms(pcm, 0.2, 0.4);
    const after = rms(pcm, 1.4, 1.6);

    assert.ok(before > 0.01, 'the continuing track must be audible');
    assert.ok(Math.abs(after / before - 1) < 0.01, `unexpected gain after the short track ended: ${after / before}`);
  });

  it('matches the sum of individually rendered tracks across staggered starts, ends, and fades', async () => {
    const tracks = [
      tone(440, FILM_DURATION, { volume: 0.4 }),
      tone(660, 0.75, { start: 0.25, volume: 0.3 }),
      tone(880, 1, { start: 1.5, volume: 0.2 }),
    ];
    const mixed = await render(tracks);
    const solo = await Promise.all(tracks.map((track) => render([track])));
    assert.equal(mixed.length, FILM_DURATION * SAMPLE_RATE * CHANNELS * 4);
    for (const pcm of solo) assert.equal(pcm.length, mixed.length);
    let maxError = 0;
    for (let offset = 0; offset < mixed.length; offset += 4) {
      const expected = solo.reduce((sum, pcm) => sum + pcm.readFloatLE(offset), 0);
      maxError = Math.max(maxError, Math.abs(mixed.readFloatLE(offset) - expected));
    }
    assert.ok(maxError < 0.00001, `mix changed the authored sum by ${maxError}`);
  });

  it('keeps levels stable when an input file ends before its declared track duration', async () => {
    const shortInput = tone(880, 0.5, { duration: 3, volume: 0 });
    const pcm = await render([tone(440, FILM_DURATION), shortInput]);
    const before = rms(pcm, 0.1, 0.3);
    const after = rms(pcm, 1.2, 1.4);

    assert.ok(Math.abs(after / before - 1) < 0.01, `unexpected gain after input EOF: ${after / before}`);
  });

  it('ends at the film duration with a silent tail after all tracks finish', async () => {
    const pcm = await render([tone(440, 0.5), tone(880, 0.5, { start: 1 })]);

    assert.equal(pcm.length, FILM_DURATION * SAMPLE_RATE * CHANNELS * 4);
    assert.ok(rms(pcm, 0.1, 0.3) > 0.01);
    assert.equal(rms(pcm, 2, 3.5), 0);
  });

  it('retains a single track start, fade, and silence after its end', async () => {
    const pcm = await render([tone(440, 1, { start: 1, volume: 0.5 })]);

    assert.equal(pcm.length, FILM_DURATION * SAMPLE_RATE * CHANNELS * 4);
    assert.equal(rms(pcm, 0.1, 0.9), 0);
    const middle = rms(pcm, 1.2, 1.4);
    assert.ok(middle > 0.01);
    assert.ok(rms(pcm, 1.85, 1.95) < middle * 0.5);
    assert.equal(rms(pcm, 2.2, 3.8), 0);
  });
});
