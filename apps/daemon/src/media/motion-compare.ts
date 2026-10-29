// Motion compare: puts a produced film next to the reference it was made from,
// at the same timestamps, and measures how far apart the two frames are. The
// agent reads the pairs; the score only says which timestamp to look at first.
// Judging whether a film is right stays with the model — this tool removes the
// guesswork about where it drifted, not the judgement.
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { spawn } from 'node:child_process';
import { lstat, mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MOTION_COMPARE_ROOT = '.motion-compare';
const MAX_TIMES = 12;
const FRAME_WIDTH = 640;
const SHEET_COLUMNS = 3;

export class MotionCompareError extends Error {
  constructor(public code: 'BAD_REQUEST' | 'NO_VIDEO' | 'PROBE_FAILED', message: string, public status = 400) {
    super(message);
  }
}

export interface MotionComparePair {
  at: number;
  /** Structural similarity of the two frames, 0–1; lower means further apart. */
  ssim: number;
  referenceFrame: string;
  candidateFrame: string;
  pair: string;
}

export interface MotionCompareResult {
  dir: string;
  reference: string;
  candidate: string;
  referenceDurationSec: number;
  candidateDurationSec: number;
  durationDeltaSec: number;
  width: number;
  height: number;
  pairs: MotionComparePair[];
  /** Timestamps the candidate could not supply a frame for, with the reason. */
  skipped: { at: number; reason: string }[];
  worst: { at: number; ssim: number } | null;
  sheet: string;
  facts: string;
}

function ffmpegPath(): string {
  return process.env.HYPERFRAMES_FFMPEG_PATH?.trim() || ffmpegInstaller.path;
}

function run(cmd: string, args: string[], timeoutMs = 120_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; if (stderr.length > 4_000_000) stderr = stderr.slice(-2_000_000); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); });
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: 1, stdout, stderr: String(err) }); });
  });
}

export function parseDuration(stderr: string): number {
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  return d ? Math.round((Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3])) * 1000) / 1000 : 0;
}

/** `All:0.984` from ffmpeg's ssim filter. */
export function parseSsim(stderr: string): number | null {
  const m = /All:([\d.]+)/.exec(stderr);
  return m ? Math.round(Number(m[1]) * 10000) / 10000 : null;
}

/**
 * Where to look: the opening, the ending, an even grid, and — when the caller
 * passes the reference's shot cuts — the first moment of every shot, because
 * that is where a rebuilt film most often drifts.
 */
export function pickCompareTimes(durationSec: number, requested?: number[], cuts?: number[]): number[] {
  const end = Math.max(0, durationSec - 0.2);
  const clamp = (t: number) => Math.min(end, Math.max(0, Math.round(t * 100) / 100));
  const wanted = (requested ?? []).filter((t) => Number.isFinite(t) && t >= 0).map(clamp);
  const times = [...wanted];
  if (!wanted.length) {
    times.push(clamp(0.3));
    const slots = MAX_TIMES - 2;
    for (let i = 1; i <= slots; i += 1) times.push(clamp((end * i) / (slots + 1)));
    times.push(end);
  }
  for (const cut of (cuts ?? []).slice(0, MAX_TIMES)) times.push(clamp(cut + 0.15));
  const sorted = [...new Set(times)].sort((a, b) => a - b);
  if (sorted.length <= MAX_TIMES) return sorted;
  const step = (sorted.length - 1) / (MAX_TIMES - 1);
  return Array.from({ length: MAX_TIMES }, (_, i) => sorted[Math.round(i * step)]!);
}

function within(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function resolveVideo(projectDir: string, source: string): Promise<string> {
  const trimmed = source?.trim();
  if (!trimmed) throw new MotionCompareError('BAD_REQUEST', 'a video path is required');
  const target = path.resolve(projectDir, trimmed.replace(/^\.\//, ''));
  const rel = path.relative(projectDir, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new MotionCompareError('BAD_REQUEST', `${trimmed} is outside the project`);
  }
  const info = await lstat(target).catch(() => null);
  if (!info || info.isSymbolicLink() || !info.isFile()) {
    throw new MotionCompareError('BAD_REQUEST', `${trimmed} is not a file in the project`);
  }
  // A symlinked parent directory resolves outside the project even though the
  // leaf itself is a real file, so re-check the resolved path.
  const resolved = await realpath(target).catch(() => null);
  const root = await realpath(projectDir).catch(() => projectDir);
  if (!resolved || !within(root, resolved)) {
    throw new MotionCompareError('BAD_REQUEST', `${trimmed} resolves outside the project`);
  }
  return resolved;
}

export async function compareMotionFilms(input: {
  projectDir: string;
  reference: string;
  candidate: string;
  times?: number[];
  cuts?: number[];
  id?: string;
}): Promise<MotionCompareResult> {
  await mkdir(input.projectDir, { recursive: true });
  const projectDir = await realpath(input.projectDir);
  const reference = await resolveVideo(projectDir, input.reference);
  const candidate = await resolveVideo(projectDir, input.candidate);
  const id = input.id?.trim() || `cmp-${Date.now().toString(36)}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) {
    throw new MotionCompareError('BAD_REQUEST', 'id must be letters, digits, dot, dash or underscore');
  }

  const ff = ffmpegPath();
  const referenceProbe = await run(ff, ['-hide_banner', '-i', reference], 60_000);
  const candidateProbe = await run(ff, ['-hide_banner', '-i', candidate], 60_000);
  const referenceDurationSec = parseDuration(referenceProbe.stderr);
  const candidateDurationSec = parseDuration(candidateProbe.stderr);
  // Older ffmpeg builds open any .txt as "tty" (ANSI art) with a duration.
  const textAsVideo = /Input #\d+, (?:tty|ansi)\b/;
  if (!referenceDurationSec || !candidateDurationSec
    || textAsVideo.test(referenceProbe.stderr) || textAsVideo.test(candidateProbe.stderr)) {
    throw new MotionCompareError('NO_VIDEO', 'Both the reference and the produced film must be readable videos.');
  }

  const relDir = path.posix.join(MOTION_COMPARE_ROOT, id);
  const dir = path.join(projectDir, MOTION_COMPARE_ROOT, id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(path.join(dir, 'frames'), { recursive: true });

  const times = pickCompareTimes(referenceDurationSec, input.times, input.cuts);
  // Both frames land on one canvas shaped like the reference, so a film with a
  // different aspect ratio is letterboxed and still scored instead of failing.
  const refSize = /Stream #\S+.*?Video:.*?\b(\d{2,5})x(\d{2,5})\b/.exec(referenceProbe.stderr);
  const canvasW = FRAME_WIDTH;
  const canvasH = refSize
    ? Math.max(2, Math.round((FRAME_WIDTH * Number(refSize[2])) / Number(refSize[1]) / 2) * 2)
    : Math.round((FRAME_WIDTH * 9) / 16 / 2) * 2;
  const fit = `scale=${canvasW}:${canvasH}:force_original_aspect_ratio=decrease,pad=${canvasW}:${canvasH}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
  const extract = async (video: string, at: number, out: string): Promise<boolean> => {
    const shot = await run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', at.toFixed(3), '-i', video,
      '-frames:v', '1', '-vf', fit, out], 60_000);
    return shot.code === 0 && Boolean((await stat(out).catch(() => null))?.size);
  };

  const pairs: MotionComparePair[] = [];
  const skipped: { at: number; reason: string }[] = [];
  let width = 0, height = 0;

  for (const [i, at] of times.entries()) {
    const n = String(i + 1).padStart(2, '0');
    const refFrame = path.join(dir, 'frames', `ref-${n}.png`);
    const candFrame = path.join(dir, 'frames', `film-${n}.png`);
    if (at > candidateDurationSec - 0.05) {
      skipped.push({ at, reason: `the film ends at ${candidateDurationSec.toFixed(2)}s` });
      continue;
    }
    if (!await extract(reference, at, refFrame)) { skipped.push({ at, reason: 'no reference frame at this time' }); continue; }
    if (!await extract(candidate, at, candFrame)) { skipped.push({ at, reason: 'no film frame at this time' }); continue; }

    const scored = await run(ff, ['-hide_banner', '-i', refFrame, '-i', candFrame, '-lavfi', 'ssim', '-f', 'null', '-'], 60_000);
    const ssim = parseSsim(scored.stderr);
    if (ssim === null) { skipped.push({ at, reason: 'could not score this pair' }); continue; }

    if (!width) {
      const size = await run(ff, ['-hide_banner', '-i', refFrame], 30_000);
      const m = /Stream #\S+.*?Video:.*?\b(\d{2,5})x(\d{2,5})\b/.exec(size.stderr);
      if (m) { width = Number(m[1]); height = Number(m[2]); }
    }

    const pairName = `pair-${n}.jpg`;
    const pairPath = path.join(dir, pairName);
    const stacked = await run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', refFrame, '-i', candFrame,
      '-filter_complex', '[0][1]hstack=inputs=2,pad=iw:ih+8:0:4:white', '-frames:v', '1', '-q:v', '3', pairPath], 60_000);
    if (stacked.code !== 0) { skipped.push({ at, reason: 'could not build the side-by-side image' }); continue; }

    pairs.push({
      at,
      ssim,
      referenceFrame: path.posix.join(relDir, 'frames', `ref-${n}.png`),
      candidateFrame: path.posix.join(relDir, 'frames', `film-${n}.png`),
      pair: path.posix.join(relDir, pairName),
    });
  }

  if (!pairs.length) throw new MotionCompareError('PROBE_FAILED', 'Could not read a single comparable frame from both videos.');

  const rows = Math.ceil(pairs.length / SHEET_COLUMNS);
  const sheet = path.join(dir, 'sheet.jpg');
  const tiled = await run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(dir, 'pair-%02d.jpg'),
    '-vf', `scale=600:-2,tile=${Math.min(SHEET_COLUMNS, pairs.length)}x${rows}:padding=6:color=white`, '-frames:v', '1', '-q:v', '3', sheet], 60_000);

  const worst = pairs.reduce((low, p) => (p.ssim < low.ssim ? p : low), pairs[0]!);
  const result: MotionCompareResult = {
    dir: relDir,
    reference: input.reference,
    candidate: input.candidate,
    referenceDurationSec,
    candidateDurationSec,
    durationDeltaSec: Math.round((candidateDurationSec - referenceDurationSec) * 1000) / 1000,
    width,
    height,
    pairs,
    skipped,
    worst: { at: worst.at, ssim: worst.ssim },
    sheet: tiled.code === 0 ? path.posix.join(relDir, 'sheet.jpg') : '',
    facts: path.posix.join(relDir, 'facts.json'),
  };
  await writeFile(path.join(dir, 'facts.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}
