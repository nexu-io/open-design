// Video card covers: pull THIS turn's first frame out of the file while the
// daemon still owns the moment (user ruling 2026-09-02:「视频这个东西,那看起来
// 视频还是要快照一下首帧的..先显示首帧吧」).
//
// WHY A FRAME AND NOT THE FILE. The same day's capacity ruling keeps video
// ORIGINALS out of the blob store (`policy.ts`): one blob is capped at 64 MiB
// and one project at 2 GiB, and an exhausted project budget fails the whole
// batch — including the image snapshots that WERE ruled on. A first frame is a
// single still, the same order of magnitude as an HTML cover, so it rides the
// COVER path and not the original path. Storing a poster is not a licence to
// start storing videos again; `capture.ts`'s per-kind gate still refuses the
// original bytes, and the counter-control in the suite pins that.
//
// WHY IT IS EXTRACTED SYNCHRONOUSLY. The HTML cover path can freeze its input
// (a self-contained document) and render it minutes later, because the frozen
// document no longer refers to anything on disk. A video has no equivalent
// freeze that does not amount to copying the file — which is exactly what the
// capacity ruling forbids. So the extraction IS the freeze: it happens inside
// the run-terminal window, and the window is verified around it the way
// `capture.ts` verifies a byte copy (stat, work, stat, refuse on any drift).
// A frame decoded from a file that moved underneath us would be a picture of a
// version that message never produced.
//
// WHY FFMPEG. It is already a daemon runtime dependency — `media/index.ts`
// encodes HyperFrames MP4s with the same bundled binary, and `tools/pack`
// already ships it on mac, Windows and Linux. No new binary, no new packaging
// decision.
//
// WHY FAILURE IS SILENT. Product ruling 2026-09-02: no placeholder and no error
// copy (「不允许退回不就一个错误文案显示在上面了?这感觉更奇怪呢」). A video with
// no frozen poster falls back to exactly what it does today — the card's
// `<video>` element pointing at the live workspace file, with the browser
// painting whatever frame is there now.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

import type { ChatArtifactFailureCode } from './types.js';

/**
 * Wall clock for one extraction. This one is spent INSIDE the turn (see the
 * module header), so it is deliberately tighter than the HTML cover's 20s
 * render budget: decoding a single frame is a seek and one decode, and a file
 * that cannot manage it in this long is not worth holding a chat turn open for.
 */
export const CHAT_ARTIFACT_VIDEO_FRAME_BUDGET_MS = 10_000;

/**
 * Per-turn ceiling, for the same reason the budget is tight: this cost is
 * charged to the turn's latency. A run that produced a dozen clips gets posters
 * for the first few and live previews for the rest.
 */
export const CHAT_ARTIFACT_VIDEO_FRAME_MAX_PER_RUN = 4;

/**
 * JPEG, not PNG. A decoded video frame is photographic, so PNG would be several
 * megabytes of losslessly-compressed noise against `quota.ts`'s 8 MiB thumbnail
 * cap, while q4 JPEG lands in the hundreds of kilobytes at the same visual
 * quality. The mime travels with the blob, and `image/jpeg` is on the
 * snapshot route's inline-safe list.
 */
export const CHAT_ARTIFACT_VIDEO_FRAME_MIME = 'image/jpeg';

export type ChatArtifactVideoFrameExtractor = (input: {
  absolutePath: string;
  outputPath: string;
  budgetMs: number;
}) => Promise<void>;

export type FreezeVideoFrameOutcome =
  | { ok: true; bytes: Buffer; mime: string }
  | { ok: false; failureCode: ChatArtifactFailureCode };

/**
 * Decode the first frame of `absolutePath` into `outputPath`, or throw.
 *
 * `-nostdin` matters: ffmpeg reads stdin by default, and a child that inherits
 * the daemon's would swallow input meant for the process. `-an -sn` keeps the
 * decoder off the audio and subtitle streams it has no use for here.
 */
export const extractVideoFirstFrameWithFfmpeg: ChatArtifactVideoFrameExtractor = (input) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffmpegInstaller.path,
      [
        '-y',
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        input.absolutePath,
        '-frames:v',
        '1',
        '-an',
        '-sn',
        '-f',
        'image2',
        '-c:v',
        'mjpeg',
        '-q:v',
        '4',
        input.outputPath,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`video first frame exceeded ${input.budgetMs}ms`));
    }, input.budgetMs);
    timer.unref?.();
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(
        new Error(
          `ffmpeg first frame failed (${signal ? `signal ${signal}` : `exit ${String(code)}`}): ${stderr.trim()}`,
        ),
      );
    });
  });

/**
 * Extract the first frame inside a verified window.
 *
 * The stat pair around the decode is the whole guarantee: the frame must come
 * from the bytes this turn produced, and a write that landed while ffmpeg was
 * reading would otherwise hand back a frame of the NEXT version — indis-
 * tinguishable, once it is a JPEG, from the right one.
 *
 * Pure of the database on purpose: the caller owns the ref bookkeeping and the
 * honest-miss row, so this stays a capability that can be tested with a file
 * and a temp directory.
 */
export async function freezeVideoFirstFrame(
  absolutePath: string,
  extract: ChatArtifactVideoFrameExtractor = extractVideoFirstFrameWithFfmpeg,
  budgetMs: number = CHAT_ARTIFACT_VIDEO_FRAME_BUDGET_MS,
): Promise<FreezeVideoFrameOutcome> {
  let before: fs.Stats;
  try {
    before = await fs.promises.stat(absolutePath);
  } catch {
    return { ok: false, failureCode: 'source_missing' };
  }
  if (!before.isFile()) return { ok: false, failureCode: 'source_missing' };

  let workDir: string;
  try {
    workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'od-video-frame-'));
  } catch {
    return { ok: false, failureCode: 'internal_error' };
  }
  const outputPath = path.join(workDir, 'frame.jpg');

  try {
    try {
      await extract({ absolutePath, outputPath, budgetMs });
    } catch (err) {
      // `timeout` is worth telling apart from a decode that simply failed: one
      // is a capacity signal about this daemon, the other is about this file.
      const timedOut = err instanceof Error && /exceeded \d+ms/u.test(err.message);
      logVideoFrameFailure(absolutePath, err);
      return { ok: false, failureCode: timedOut ? 'timeout' : 'renderer_unavailable' };
    }

    let bytes: Buffer;
    try {
      bytes = await fs.promises.readFile(outputPath);
    } catch {
      return { ok: false, failureCode: 'renderer_unavailable' };
    }
    // A zero-byte output is ffmpeg reporting success over a stream it could not
    // decode. There is no frame here to be honest about.
    if (bytes.byteLength === 0) return { ok: false, failureCode: 'renderer_unavailable' };

    // Close the window. Any drift means the frame may be the next version's.
    let after: fs.Stats;
    try {
      after = await fs.promises.stat(absolutePath);
    } catch {
      return { ok: false, failureCode: 'source_changed' };
    }
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      return { ok: false, failureCode: 'source_changed' };
    }

    return { ok: true, bytes, mime: CHAT_ARTIFACT_VIDEO_FRAME_MIME };
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function logVideoFrameFailure(absolutePath: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  try {
    // Basename only — never the absolute path, never bytes.
    console.warn(`[chat-artifacts] video frame failed for ${path.basename(absolutePath)}: ${message}`);
  } catch {
    // logging is best effort
  }
}
