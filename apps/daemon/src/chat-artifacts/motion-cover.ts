import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { load } from 'cheerio';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import type { MotionArtifactPreview } from '@open-design/contracts';
import type { ChatArtifactCaptureDeps } from './capture.js';
import { attachChatArtifactThumbnail } from './run-capture.js';
import { setSnapshotMotionPreview, type MessageArtifactRow } from './store.js';
import { CHAT_ARTIFACT_VIDEO_FRAME_MAX_PER_RUN, freezeVideoFirstFrame, type ChatArtifactVideoFrameExtractor } from './video-cover.js';
import type { ChatArtifactFailureCode } from './types.js';

const exec = promisify(execFile);
class MotionCoverDeclarationError extends Error {
  constructor(message: string, readonly videoPath?: string) {
    super(message);
  }
}

/** Only a marked video with an explicit cover time opts into this contract.
 * Old sources retain the first-frame compatibility path. Invalid declarations
 * are refused rather than silently replaced by a different frame. */
export function readMotionCoverSpec(html: string, sourcePath: string): MotionArtifactPreview | null {
  const $ = load(html);
  if ($('meta[name="od-motion-output"]').attr('content') !== 'video') return null;
  const root = $('[data-composition-id]').first();
  const rawTime = root.attr('data-poster-time');
  if (rawTime === undefined) return null;
  const width = Number(root.attr('data-width'));
  const height = Number(root.attr('data-height'));
  const duration = Number(root.attr('data-duration'));
  const posterTime = Number(rawTime);
  const href = $('link[rel="alternate"][type="video/mp4"]').attr('href');
  if (!href || /[?#\\]/.test(href) || /^[a-z]+:|^\//i.test(href)) {
    throw new MotionCoverDeclarationError('invalid Motion poster video link');
  }
  const videoPath = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), href));
  if (videoPath.startsWith('../') || !/\.mp4$/i.test(videoPath)) {
    throw new MotionCoverDeclarationError('Motion poster video escapes the project');
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width <= 0 || height <= 0 || width > 16384 || height > 16384
    || !Number.isFinite(duration) || duration <= 0
    || !rawTime.trim() || !Number.isFinite(posterTime) || posterTime < 0 || posterTime >= duration) {
    throw new MotionCoverDeclarationError('invalid Motion poster declaration', videoPath);
  }
  return { width, height, duration, posterTime, sourcePath, videoPath };
}

async function inside(root: string, relative: string): Promise<string> {
  const file = await fs.realpath(path.resolve(root, relative));
  if (!file.startsWith(root + path.sep)) throw new Error('Motion poster path escapes the project');
  return file;
}

/** Validate the real stream, not just the HTML's declared dimensions/clock. */
async function verifyVideo(file: string, spec: MotionArtifactPreview): Promise<void> {
  const { stderr } = await exec(ffmpeg.path, ['-nostdin', '-hide_banner', '-i', file, '-map', '0:v:0', '-frames:v', '1', '-f', 'null', '-'], { timeout: 10000, maxBuffer: 128 * 1024 });
  const clock = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(stderr);
  const size = /Video:[^\n]*?\b(\d{1,5})x(\d{1,5})\b/.exec(stderr);
  const duration = clock ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) : NaN;
  if (!size || Number(size[1]) !== spec.width || Number(size[2]) !== spec.height
    || !Number.isFinite(duration) || Math.abs(duration - spec.duration) > 0.05 || spec.posterTime >= duration) {
    throw new Error('Motion source and video dimensions/clock do not match');
  }
}

export async function freezeMotionArtifactCovers(deps: ChatArtifactCaptureDeps, input: {
  projectRoot: string;
  rows: readonly MessageArtifactRow[];
  videoFrameExtractor?: ChatArtifactVideoFrameExtractor;
}) {
  const handled = new Set<string>();
  const failures: Array<{ row: MessageArtifactRow; code: ChatArtifactFailureCode }> = [];
  let frozen = 0;
  let attempts = 0;
  let skipped = 0;
  const root = await fs.realpath(input.projectRoot).catch(() => null);
  if (!root) return { handled, frozen, failures, attempts, skipped };
  for (const sourceRow of input.rows.filter(row => row.kind === 'html')) {
    let source: string, before: Awaited<ReturnType<typeof fs.stat>>, spec: MotionArtifactPreview | null;
    try {
      source = await inside(root, sourceRow.labelAtCapture);
      before = await fs.stat(source);
      spec = readMotionCoverSpec(await fs.readFile(source, 'utf8'), sourceRow.labelAtCapture);
      if (!spec) continue;
    } catch (error) {
      // A declared but invalid time must not reach ordinary screenshot logic.
      if (!(error instanceof MotionCoverDeclarationError)) continue;
      const related = input.rows.filter(row => row.id === sourceRow.id || (row.kind === 'video' && row.labelAtCapture === error.videoPath));
      related.forEach(row => { handled.add(row.id); failures.push({ row, code: 'renderer_unavailable' }); });
      continue;
    }
    const related = input.rows.filter(row => row.id === sourceRow.id || (row.kind === 'video' && row.labelAtCapture === spec!.videoPath));
    related.forEach(row => handled.add(row.id));
    if (attempts >= CHAT_ARTIFACT_VIDEO_FRAME_MAX_PER_RUN) {
      skipped += related.length;
      continue;
    }
    attempts++;
    let code: ChatArtifactFailureCode = 'renderer_unavailable';
    try {
      const video = await inside(root, spec.videoPath);
      const videoBefore = await fs.stat(video);
      await verifyVideo(video, spec);
      const cover = await freezeVideoFirstFrame(video, input.videoFrameExtractor, undefined, spec.posterTime);
      if (!cover.ok) { code = cover.failureCode; throw new Error(code); }
      const after = await fs.stat(source), videoAfter = await fs.stat(video);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || videoBefore.size !== videoAfter.size || videoBefore.mtimeMs !== videoAfter.mtimeMs) { code = 'source_changed'; throw new Error(code); }
      for (const row of related) {
        const result = await attachChatArtifactThumbnail(deps, { messageArtifactId: row.id, bytes: cover.bytes, mime: cover.mime });
        if (result.state !== 'ready' || !result.snapshotId) throw new Error('Motion cover could not be stored');
        setSnapshotMotionPreview(deps.db, result.snapshotId, spec);
        frozen++;
      }
    } catch (error) {
      console.warn(`[chat-artifacts] Motion cover failed for ${sourceRow.labelAtCapture}: ${error instanceof Error ? error.message : String(error)}`);
      related.forEach(row => failures.push({ row, code }));
    }
  }
  return { handled, frozen, failures, attempts, skipped };
}
