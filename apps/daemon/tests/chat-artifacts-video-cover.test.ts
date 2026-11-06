/**
 * The video card's FROZEN FIRST FRAME (user ruling 2026-09-02:
 * 「视频这个东西,那看起来视频还是要快照一下首帧的..先显示首帧吧」).
 *
 * WHAT THIS PINS, AND WHY IT NEEDS A REAL TURN. A video card has no snapshot of
 * its own — the same day's capacity ruling keeps video ORIGINALS out of the blob
 * store — so its card fell back to the live workspace file and let the browser
 * paint whatever frame is on disk TODAY. Overwrite the file and the first frame
 * inside an old message changes with it. That is the image card's original bug,
 * wearing a `<video>` element.
 *
 * The freeze therefore has to happen at the run-terminal chokepoint, and the
 * only way to prove it did is to drive a real turn through `/api/chat` and then
 * overwrite the file the way the next turn would. A test that called the
 * extraction helper directly would be green on a build that never calls it.
 *
 * TWO COUNTER-CONTROLS RIDE ALONG in the same turn, because "freeze the first
 * frame" is one step away from two regressions that look like fixes:
 *
 *   * the video's ORIGINAL bytes must still be absent from the blob store —
 *     storing a poster is not permission to start storing videos again;
 *   * an image must still store its original — the poster path must not be
 *     implemented by loosening the per-kind policy for everyone.
 */

import type http from 'node:http';
import Database from 'better-sqlite3';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

import { startServer } from '../src/server.js';
import { projectChatArtifactRefs } from '../src/chat-artifacts/refs.js';
import {
  CHAT_ARTIFACT_VIDEO_FRAME_BUDGET_MS,
  extractVideoFirstFrameWithFfmpeg,
  freezeVideoFirstFrame,
} from '../src/chat-artifacts/video-cover.js';
import type { ChatArtifactRef } from '../src/chat-artifacts/types.js';

const execFileAsync = promisify(execFile);
const FFMPEG = ffmpegInstaller.path;

let baseUrl: string;
let server: http.Server;
const tempDirs: string[] = [];

/** Flat single-colour fixtures: the frame's identity is readable as one pixel. */
// 读文件回来的是 `Buffer<ArrayBufferLike>`,而 `Buffer.alloc` 推断出的是
// `Buffer<ArrayBuffer>` —— 后者更窄,直接赋值会被 tsc 拦下。标注成宽的那个。
let videoV1: Buffer<ArrayBufferLike> = Buffer.alloc(0); // red
let videoV2: Buffer<ArrayBufferLike> = Buffer.alloc(0); // blue
let imageV1: Buffer<ArrayBufferLike> = Buffer.alloc(0); // green
let imageV2: Buffer<ArrayBufferLike> = Buffer.alloc(0); // yellow

async function scratchDir(prefix: string): Promise<string> {
  const dir = await fsp.mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** One flat-colour H.264 clip. */
async function makeVideo(dir: string, name: string, colour: string): Promise<Buffer> {
  const out = join(dir, name);
  await execFileAsync(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=${colour}:s=320x240:d=1:r=10`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    out,
  ]);
  return await fsp.readFile(out);
}

async function makeImage(dir: string, name: string, colour: string): Promise<Buffer> {
  const out = join(dir, name);
  await execFileAsync(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=${colour}:s=16x16:d=1`,
    '-frames:v', '1', '-f', 'image2', '-c:v', 'png',
    out,
  ]);
  return await fsp.readFile(out);
}

/**
 * The one pixel every assertion is about: decode whatever this is (mp4, jpeg,
 * png), take its first frame, average it down to 1x1 and read the RGB triple.
 *
 * This is the measuring instrument, so the suite proves up front that it can
 * SEE the difference it is about to assert on — red and blue must not read the
 * same, or every "the frame is still the old one" assertion would be vacuous.
 */
async function dominantColour(bytes: Buffer, hint: string): Promise<[number, number, number]> {
  const dir = await scratchDir('od-w65-probe-');
  const file = join(dir, `probe.${hint}`);
  await fsp.writeFile(file, bytes);
  const { stdout } = await execFileAsync(
    FFMPEG,
    [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', file,
      '-frames:v', '1', '-vf', 'scale=1:1',
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
    ],
    { encoding: 'buffer', maxBuffer: 1 << 20 },
  );
  const raw = stdout as unknown as Buffer;
  expect(raw.byteLength, `probe should decode ${hint}`).toBeGreaterThanOrEqual(3);
  return [raw[0]!, raw[1]!, raw[2]!];
}

function colourDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

async function withFakeAgent<T>(binName: string, script: string, run: () => Promise<T>): Promise<T> {
  const dir = await scratchDir('od-w65-bin-');
  const oldPath = process.env.PATH;
  try {
    if (process.platform === 'win32') {
      const runner = join(dir, `${binName}-test-runner.cjs`);
      await fsp.writeFile(runner, script);
      await fsp.writeFile(join(dir, `${binName}.cmd`), `@echo off\r\nnode "${runner}" %*\r\n`);
    } else {
      const bin = join(dir, binName);
      await fsp.writeFile(bin, `#!/usr/bin/env node\n${script}`);
      await fsp.chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${delimiter}${oldPath ?? ''}`;
    return await run();
  } finally {
    process.env.PATH = oldPath;
  }
}

async function waitFor<T>(
  probe: () => T | Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = await probe();
  while (!predicate(last) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    last = await probe();
  }
  return last;
}

function dataDir(): string {
  const dir = process.env.OD_DATA_DIR;
  if (!dir) throw new Error('OD_DATA_DIR is required for chat artifact cover tests');
  return dir;
}

function withDb<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(resolve(dataDir(), 'app.sqlite'));
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function refsFor(projectId: string, messageId: string): ChatArtifactRef[] {
  return withDb((db) => projectChatArtifactRefs(db, projectId, messageId));
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * Drive one real turn that writes `clip.mp4` + `shot.png` into the run cwd.
 * The fake agent prints its own cwd so the overwrite can target the same file
 * the daemon just captured, without assuming a projects-directory layout.
 */
async function runTurnThatWritesMedia(): Promise<{
  projectId: string;
  messageId: string;
  cwd: string;
}> {
  const projectId = `proj-${randomUUID()}`;
  const assistantMessageId = `assistant-${randomUUID()}`;
  const created = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, name: 'chat artifact video cover fixture' }),
  });
  expect(created.ok).toBe(true);

  const conversations = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`);
  expect(conversations.ok).toBe(true);
  const conversationId = ((await conversations.json()) as { conversations: Array<{ id: string }> })
    .conversations[0]?.id;
  expect(conversationId).toBeTruthy();

  const script = `
const fs = require('node:fs');
const path = require('node:path');
fs.writeFileSync(path.join(process.cwd(), 'clip.mp4'), Buffer.from(${JSON.stringify(videoV1.toString('base64'))}, 'base64'));
fs.writeFileSync(path.join(process.cwd(), 'shot.png'), Buffer.from(${JSON.stringify(imageV1.toString('base64'))}, 'base64'));
console.log(JSON.stringify({ type: 'step_start' }));
console.log(JSON.stringify({ type: 'text', part: { text: 'cwd=' + process.cwd() + '=cwd' } }));
console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
process.exit(0);
`;

  const body = await withFakeAgent('opencode', script, async () => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'opencode',
        projectId,
        conversationId,
        assistantMessageId,
        message: 'render a clip',
      }),
    });
    expect(response.ok).toBe(true);
    return await response.text();
  });

  const cwd = /cwd=(.+?)=cwd/.exec(body)?.[1];
  expect(cwd, 'the fake agent should report the run cwd').toBeTruthy();
  return { projectId, messageId: assistantMessageId, cwd: cwd! };
}

describe('video cards freeze the first frame of the turn that produced them', () => {
  beforeAll(async () => {
    const fixtures = await scratchDir('od-w65-fixtures-');
    videoV1 = await makeVideo(fixtures, 'v1.mp4', 'red');
    videoV2 = await makeVideo(fixtures, 'v2.mp4', 'blue');
    imageV1 = await makeImage(fixtures, 'i1.png', 'green');
    imageV2 = await makeImage(fixtures, 'i2.png', 'yellow');

    // The daemon does NOT get a desktop renderer here, on purpose: the HTML
    // cover path needs an Electron window, and a first frame must not.
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  }, 60_000);

  afterAll(async () => {
    for (const dir of tempDirs.splice(0)) {
      await fsp.rm(dir, { recursive: true, force: true });
    }
    if (server) await new Promise<void>((done) => server.close(() => done()));
  });

  it('measures a difference the two fixtures actually have', async () => {
    // Guard against the vacuous shape of the assertion below: if v1 and v2
    // decoded to the same pixel, "the cover is still v1's frame" would pass on
    // a build with no freeze at all.
    expect(videoV1.equals(videoV2)).toBe(false);
    const red = await dominantColour(videoV1, 'mp4');
    const blue = await dominantColour(videoV2, 'mp4');
    expect(colourDistance(red, blue)).toBeGreaterThan(200);
    expect(imageV1.equals(imageV2)).toBe(false);
  });

  it('serves the frame that turn produced after the workspace file is overwritten', async () => {
    const turn = await runTurnThatWritesMedia();
    const expected = await dominantColour(videoV1, 'mp4');
    const overwritten = await dominantColour(videoV2, 'mp4');

    // The next turn's overwrite lands. From here on, the only red frame in
    // existence is the one the daemon froze at the chokepoint.
    await fsp.writeFile(join(turn.cwd, 'clip.mp4'), videoV2);
    expect((await fsp.readFile(join(turn.cwd, 'clip.mp4'))).equals(videoV2)).toBe(true);

    const refs = await waitFor(
      () => refsFor(turn.projectId, turn.messageId),
      (list) => list.some((ref) => ref.label === 'clip.mp4' && Boolean(ref.thumbnailUrl)),
    );
    const video = refs.find((ref) => ref.label === 'clip.mp4');
    expect(video, 'the turn produced clip.mp4, so the message should carry a ref').toBeTruthy();
    expect(video?.displayPolicy).toBe('latest_with_static_preview');
    // Click still opens the live workspace file — the freeze is the card face
    // only (user ruling 2026-09-02).
    expect(video?.workspaceArtifactId).toBeTruthy();
    expect(video?.thumbnailUrl, 'the video card should carry a frozen first frame').toBeTruthy();

    const cover = await fetch(`${baseUrl}${video!.thumbnailUrl!}`);
    expect(cover.status).toBe(200);
    const coverBytes = Buffer.from(await cover.arrayBuffer());
    const actual = await dominantColour(coverBytes, 'jpg');
    expect(colourDistance(actual, expected)).toBeLessThan(30);
    expect(colourDistance(actual, overwritten)).toBeGreaterThan(200);
  });

  it('still keeps the video ORIGINAL out of the blob store', async () => {
    const turn = await runTurnThatWritesMedia();
    const refs = await waitFor(
      () => refsFor(turn.projectId, turn.messageId),
      (list) => list.some((ref) => ref.label === 'clip.mp4' && Boolean(ref.thumbnailUrl)),
    );
    const video = refs.find((ref) => ref.label === 'clip.mp4');
    // A poster is a rendering OF the file, never a copy of it. The card must
    // not gain a content URL, and the store must not gain the video's bytes.
    expect(video?.snapshotUrl).toBeUndefined();
    expect(video?.thumbnailUrl).toBeTruthy();

    const stored = withDb((db) => ({
      contentDigests: db
        .prepare(
          `SELECT content_digest AS digest FROM chat_artifact_snapshots
            WHERE source_path_at_capture = 'clip.mp4'`,
        )
        .all() as Array<{ digest: string | null }>,
      videoBlob: db
        .prepare(`SELECT digest FROM chat_artifact_blobs WHERE digest = ?`)
        .get(sha256(videoV1)) as { digest: string } | undefined,
    }));
    expect(stored.contentDigests.length).toBeGreaterThan(0);
    for (const row of stored.contentDigests) expect(row.digest).toBeNull();
    expect(stored.videoBlob, 'the video bytes must never reach the blob store').toBeUndefined();
  });

  it('leaves the workspace file identity alone while attaching a cover', async () => {
    const turn = await runTurnThatWritesMedia();
    await waitFor(
      () => refsFor(turn.projectId, turn.messageId),
      (list) => list.some((ref) => ref.label === 'clip.mp4' && Boolean(ref.thumbnailUrl)),
    );

    /*
     * The cover is `image/jpeg`; the FILE is still `video/mp4`. These travel
     * through the same capture entry point, and `workspace_artifacts` is the
     * mutable Design Files identity the card's click resolves through — a cover
     * that restamps it has quietly rewritten what the workspace thinks the file
     * IS. Nothing renders that column today, which is exactly why it needs a
     * test: the damage would be invisible until something did.
     */
    const artifact = withDb(
      (db) =>
        db
          .prepare(
            `SELECT kind, mime FROM workspace_artifacts
              WHERE project_id = ? AND current_path = 'clip.mp4' AND deleted_at IS NULL`,
          )
          .get(turn.projectId) as { kind: string; mime: string | null } | undefined,
    );
    expect(artifact?.kind).toBe('video');
    expect(artifact?.mime).toBe('video/mp4');
  });

  /*
   * The end-to-end case above cannot reach the one race that matters most: a
   * write that lands WHILE ffmpeg is reading. The decode is milliseconds, so
   * there is no reliable way to slip an overwrite into the middle of it from
   * the HTTP boundary — and without this pair, dropping the second stat would
   * leave every test green.
   */
  it('refuses a frame decoded across a write that landed mid-extraction', async () => {
    const dir = await scratchDir('od-w65-window-');
    const clip = join(dir, 'clip.mp4');
    await fsp.writeFile(clip, videoV1);

    const outcome = await freezeVideoFirstFrame(clip, async (input) => {
      await extractVideoFirstFrameWithFfmpeg(input);
      // The next turn's write lands before the extraction reports back. The
      // frame in hand may be either version, so neither may be published.
      await fsp.writeFile(input.absolutePath, videoV2);
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false ? outcome.failureCode : null).toBe('source_changed');
  });

  it('publishes the frame when the window held', async () => {
    const dir = await scratchDir('od-w65-window-ok-');
    const clip = join(dir, 'clip.mp4');
    await fsp.writeFile(clip, videoV1);

    const outcome = await freezeVideoFirstFrame(
      clip,
      extractVideoFirstFrameWithFfmpeg,
      CHAT_ARTIFACT_VIDEO_FRAME_BUDGET_MS,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const colour = await dominantColour(outcome.bytes, 'jpg');
    expect(colourDistance(colour, await dominantColour(videoV1, 'mp4'))).toBeLessThan(30);
  });

  it('still freezes an image ORIGINAL in the same turn', async () => {
    const turn = await runTurnThatWritesMedia();
    const refs = await waitFor(
      () => refsFor(turn.projectId, turn.messageId),
      (list) => list.some((ref) => ref.label === 'shot.png' && ref.snapshotState === 'ready'),
    );
    const image = refs.find((ref) => ref.label === 'shot.png');
    expect(image?.displayPolicy).toBe('immutable_snapshot');
    expect(image?.snapshotUrl, 'images still carry their exact bytes').toBeTruthy();

    // Same overwrite, opposite expectation source: the image path is unchanged
    // and still serves the original, not a re-render of it.
    await fsp.writeFile(join(turn.cwd, 'shot.png'), imageV2);
    const served = await fetch(`${baseUrl}${image!.snapshotUrl!}`);
    expect(served.status).toBe(200);
    expect(Buffer.from(await served.arrayBuffer()).equals(imageV1)).toBe(true);
  });
});
