// Motion reference pack: turns a user's reference video (an attached project
// file or a link) into measured facts the agent can rebuild a film from —
// duration, size, fps, audio presence, shot cuts, a frame at every shot and a
// contact sheet. The agent reads these files; nothing here interprets the film.
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { spawn } from 'node:child_process';
import { resolveYtDlp } from './yt-dlp.js';
import { assertPublicAssetUrl, fetchPublicAsset } from '../public-asset-fetch.js';
import { startEgressProxy } from './egress-proxy.js';
import { createWriteStream } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const MOTION_REFERENCE_ROOT = '.motion-reference';
export const MOTION_REFERENCE_MAX_BYTES = 200 * 1024 * 1024;
export const MOTION_REFERENCE_MAX_SECONDS = 180;
const MAX_FRAMES = 24;
const MIN_FRAME_GAP_SECONDS = 0.4;
const SCENE_THRESHOLD = 0.3;
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const TEXT_AS_VIDEO = /Input #\d+, (?:tty|ansi)\b/;

export class MotionReferenceError extends Error {
  constructor(public code: 'BAD_REQUEST' | 'NEEDS_UPLOAD' | 'TOO_LARGE' | 'TOO_LONG' | 'NOT_VIDEO' | 'PROBE_FAILED', message: string, public status = 400) {
    super(message);
  }
}

export interface MotionReferenceFrame { path: string; at: number }
export interface MotionReferenceResult {
  dir: string;
  video: string;
  source: { kind: 'file' | 'url'; value: string };
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  cuts: number[];
  frames: MotionReferenceFrame[];
  contactSheet: string;
  /** The reference's own soundtrack as a WAV, ready to copy into a composition; null when it has none. */
  audio: string | null;
  facts: string;
  /** The shared replication rules, copied beside the measurements for the agent to read. */
  rules: string | null;
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

function within(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Probe with the bundled ffmpeg (no ffprobe ships with Open Design). */
export function parseProbe(stderr: string): { durationSec: number; width: number; height: number; fps: number; hasAudio: boolean; hasVideo: boolean } {
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const durationSec = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
  const video = /Stream #\S+.*?Video:([^\n]*)/.exec(stderr);
  const desc = video?.[1] ?? '';
  const size = /\b(\d{2,5})x(\d{2,5})\b/.exec(desc);
  const fps = /([\d.]+)\s*fps/.exec(desc) ?? /([\d.]+)\s*tbr/.exec(desc);
  return {
    durationSec: Math.round(durationSec * 1000) / 1000,
    width: size ? Number(size[1]) : 0,
    height: size ? Number(size[2]) : 0,
    fps: fps ? Math.round(Number(fps[1]) * 100) / 100 : 0,
    hasAudio: /Stream #\S+.*?Audio:/.test(stderr),
    // Older ffmpeg builds open any .txt/.nfo as "tty" (ANSI art) and report a
    // video stream for it. That is a text file, not a reference video.
    hasVideo: Boolean(video) && !TEXT_AS_VIDEO.test(stderr),
  };
}

/** Shot-cut times from ffmpeg's scene score (showinfo pts_time lines). */
export function parseCuts(stderr: string, durationSec: number): number[] {
  const cuts: number[] = [];
  for (const m of stderr.matchAll(/pts_time:([\d.]+)/g)) {
    const t = Math.round(Number(m[1]) * 1000) / 1000;
    if (t <= 0.05 || (durationSec && t >= durationSec - 0.05)) continue;
    if (cuts.length && t - cuts[cuts.length - 1]! < 0.2) continue;
    cuts.push(t);
  }
  return cuts.slice(0, 80);
}

/**
 * One frame early in every shot, an even grid across the film (soft cross-fades
 * and same-background beats rarely register as cuts), the opening and the end,
 * thinned to MAX_FRAMES.
 */
export function pickFrameTimes(cuts: number[], durationSec: number): number[] {
  const end = Math.max(0, durationSec - 0.2);
  const starts = [0, ...cuts];
  const times: number[] = [];
  const grid = Math.max(1, durationSec / (MAX_FRAMES - 2));
  for (let t = grid; t < end; t += grid) times.push(t);
  for (let i = 0; i < starts.length; i += 1) {
    const from = starts[i]!, to = i + 1 < starts.length ? starts[i + 1]! : durationSec;
    const len = to - from;
    times.push(Math.min(end, from + Math.min(0.3, len / 3)));
    if (len > 3) times.push(Math.min(end, from + len / 2));
  }
  times.push(end);
  const sorted = [...new Set(times.map((t) => Math.round(t * 100) / 100))].sort((a, b) => a - b);
  const spaced: number[] = [];
  for (const t of sorted) if (!spaced.length || t - spaced[spaced.length - 1]! >= MIN_FRAME_GAP_SECONDS) spaced.push(t);
  if (spaced.length <= MAX_FRAMES) return spaced;
  const step = (spaced.length - 1) / (MAX_FRAMES - 1);
  return Array.from({ length: MAX_FRAMES }, (_, i) => spaced[Math.round(i * step)]!);
}

/**
 * Save a link that serves a video file directly. Returns null when the link is
 * not a video file or cannot be reached, so the caller decides what to say.
 * A too-large video is still refused outright: falling back cannot help there.
 */
async function fetchDirect(url: string, dir: string, fetcher: LinkFetcher = fetchPublicAsset): Promise<string | null> {
  // `source` is user- or agent-supplied, so both the URL and every redirect hop
  // go through the shared public-address guard: a public link must not be able
  // to make the daemon reach loopback, link-local or private-network services.
  let response: Response;
  try { response = await fetcher(url); } catch { return null; }
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !response.body || !/^video\//i.test(type)) return null;
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MOTION_REFERENCE_MAX_BYTES) throw new MotionReferenceError('TOO_LARGE', 'The video is larger than 200 MB.');
  const ext = type.includes('webm') ? '.webm' : type.includes('quicktime') ? '.mov' : '.mp4';
  const target = path.join(dir, `reference${ext}`);
  let bytes = 0;
  const counted = Readable.fromWeb(response.body as any).on('data', (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > MOTION_REFERENCE_MAX_BYTES) counted.destroy(new MotionReferenceError('TOO_LARGE', 'The video is larger than 200 MB.'));
  });
  try { await pipeline(counted, createWriteStream(target)); } catch { return null; }
  return target;
}

/**
 * Video sites yt-dlp is trusted to fetch from. yt-dlp makes its own requests
 * and follows its own redirects, outside the public-address guard, so it only
 * ever sees a link to one of these public platforms whose host has also passed
 * that guard. Any other link is fetched only as a direct file, through the guard.
 */
const DOWNLOADER_HOSTS = [
  'x.com', 'twitter.com', 'youtube.com', 'youtu.be', 'vimeo.com', 'bilibili.com', 'b23.tv',
  'tiktok.com', 'douyin.com', 'instagram.com', 'facebook.com', 'fb.watch', 'linkedin.com',
  'reddit.com', 'v.redd.it', 'dribbble.com', 'behance.net', 'threads.net', 'xiaohongshu.com', 'weibo.com',
];

export function isDownloaderHost(url: string): boolean {
  let host: string;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  return DOWNLOADER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

async function downloadUrl(url: string, dir: string, toolsDir: string | null, fetcher?: LinkFetcher): Promise<string> {
  const viaDownloader = isDownloaderHost(url)
    && await assertPublicAssetUrl(url).then(() => true, () => false);
  const ytdlp = viaDownloader ? await resolveYtDlp(toolsDir) : null;
  if (ytdlp) {
    const out = path.join(dir, 'reference.%(ext)s');
    // yt-dlp resolves redirects and extractor URLs itself, so the only way to
    // hold the no-private-egress boundary is to constrain its connections:
    // every request it makes goes through a loopback proxy that applies the
    // same public-address policy, including each redirect hop.
    const proxy = await startEgressProxy();
    let result;
    try {
      result = await run(ytdlp, [
        '--ignore-config', '--no-playlist', '--no-progress', '--match-filter', `!is_live & duration <= ${MOTION_REFERENCE_MAX_SECONDS}`,
        '-f', 'bv*[height<=1080]+ba/b[height<=1080]/b', '--merge-output-format', 'mp4',
        '--max-filesize', String(MOTION_REFERENCE_MAX_BYTES), '-o', out,
        '--proxy', proxy.url, url,
      ], 300_000);
    } finally {
      await proxy.close().catch(() => {});
    }
    const saved = (await readdir(dir)).find((name) => name.startsWith('reference.') && VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase()));
    if (result.code === 0 && saved) return path.join(dir, saved);
    // A direct video file link carries no page metadata, so the downloader
    // filters it out before writing anything. Fall through to a plain fetch
    // instead of telling the user to upload; only give up when that fails too.
    const blocked = /login|sign in|cookies|private/i.test(result.stderr) ? 'the site requires a login'
      : /does not pass filter|is_live|duration/i.test(result.stderr) ? `it is live or longer than ${MOTION_REFERENCE_MAX_SECONDS} seconds`
        : null;
    const direct = await fetchDirect(url, dir, fetcher);
    if (direct) return direct;
    throw new MotionReferenceError('NEEDS_UPLOAD', `Could not download the link (${blocked ?? 'the download failed'}). Download the video and attach the file instead.`);
  }
  // Any other link is fetched only as a direct video file, through the guard.
  const direct = await fetchDirect(url, dir, fetcher);
  if (direct) return direct;
  throw new MotionReferenceError('NEEDS_UPLOAD', 'This link is not a video file or a supported video site. Download the video and attach the file instead.');
}

async function resolveProjectFile(projectDir: string, source: string): Promise<string> {
  const root = await realpath(projectDir);
  const target = path.resolve(root, source.replace(/^\.\//, ''));
  if (!within(root, target)) throw new MotionReferenceError('BAD_REQUEST', 'source must be a file inside the project');
  const info = await lstat(target).catch(() => null);
  if (!info || info.isSymbolicLink() || !info.isFile()) throw new MotionReferenceError('BAD_REQUEST', `source ${source} is not a file in the project`);
  if (!within(root, await realpath(target))) throw new MotionReferenceError('BAD_REQUEST', 'source must be a file inside the project');
  if (info.size > MOTION_REFERENCE_MAX_BYTES) throw new MotionReferenceError('TOO_LARGE', 'The video is larger than 200 MB.');
  return target;
}

/**
 * Fetcher used for a pasted link. Defaults to the shared public-address guard,
 * so a public link can never redirect the daemon into loopback or private
 * space. Tests inject their own loopback server.
 */
export type LinkFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export async function buildMotionReference(input: { projectDir: string; source: string; id?: string; toolsDir?: string; rulesFile?: string; fetchLink?: LinkFetcher }): Promise<MotionReferenceResult> {
  const source = input.source?.trim();
  if (!source) throw new MotionReferenceError('BAD_REQUEST', 'source is required (a project file path or an http(s) link)');
  const id = input.id?.trim() || `ref-${Date.now().toString(36)}`;
  if (!ID_RE.test(id)) throw new MotionReferenceError('BAD_REQUEST', 'id must be letters, digits, dot, dash or underscore');
  // A new project has no folder until its first file; create it before resolving.
  await mkdir(input.projectDir, { recursive: true });
  const projectDir = await realpath(input.projectDir);
  const relDir = path.posix.join(MOTION_REFERENCE_ROOT, id);
  const dir = path.join(projectDir, MOTION_REFERENCE_ROOT, id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(path.join(dir, 'frames'), { recursive: true });

  const isUrl = /^https?:\/\//i.test(source);
  let video: string;
  if (isUrl) video = await downloadUrl(source, dir, input.toolsDir ?? null, input.fetchLink);
  else {
    const file = await resolveProjectFile(projectDir, source);
    video = path.join(dir, `reference${path.extname(file).toLowerCase() || '.mp4'}`);
    await copyFile(file, video);
  }

  const ff = ffmpegPath();
  const probe = parseProbe((await run(ff, ['-hide_banner', '-i', video], 60_000)).stderr);
  if (!probe.hasVideo || !probe.durationSec) throw new MotionReferenceError('NOT_VIDEO', 'The source is not a readable video.');
  if (probe.durationSec > MOTION_REFERENCE_MAX_SECONDS) {
    throw new MotionReferenceError('TOO_LONG', `The video is ${probe.durationSec.toFixed(1)} s; references up to ${MOTION_REFERENCE_MAX_SECONDS} s are supported. Trim it and attach the part to replicate.`);
  }
  const scene = await run(ff, ['-hide_banner', '-nostats', '-i', video, '-an', '-vf', `scale=480:-2,select='gt(scene,${SCENE_THRESHOLD})',showinfo`, '-f', 'null', '-'], 300_000);
  const cuts = parseCuts(scene.stderr, probe.durationSec);

  const times = pickFrameTimes(cuts, probe.durationSec);
  const frames: MotionReferenceFrame[] = [];
  for (const [i, at] of times.entries()) {
    const name = `frame-${String(i + 1).padStart(2, '0')}.jpg`;
    const out = path.join(dir, 'frames', name);
    const shot = await run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', at.toFixed(3), '-i', video, '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '3', out], 60_000);
    if (shot.code === 0 && (await stat(out).catch(() => null))?.size) frames.push({ path: path.posix.join(relDir, 'frames', name), at });
  }
  if (!frames.length) throw new MotionReferenceError('PROBE_FAILED', 'Could not read frames from the video.');

  // Keep the reference's soundtrack beside the frames. Replication reuses it by
  // default; extracting it here means the agent never has to touch the video.
  let audio: string | null = null;
  if (probe.hasAudio) {
    const out = path.join(dir, 'audio.wav');
    const pulled = await run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'pcm_s16le', out], 120_000);
    if (pulled.code === 0 && (await stat(out).catch(() => null))?.size) audio = path.posix.join(relDir, 'audio.wav');
  }

  const columns = Math.min(4, frames.length), rows = Math.ceil(frames.length / columns);
  const contact = path.join(dir, 'contact.jpg');
  await run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(dir, 'frames', 'frame-%02d.jpg'),
    '-vf', `scale=480:-2,tile=${columns}x${rows}:padding=4:color=white`, '-frames:v', '1', '-q:v', '3', contact], 60_000);

  const result: MotionReferenceResult = {
    dir: relDir,
    video: path.posix.join(relDir, path.basename(video)),
    source: { kind: isUrl ? 'url' : 'file', value: source },
    ...probe,
    cuts,
    frames,
    contactSheet: path.posix.join(relDir, 'contact.jpg'),
    audio,
    facts: path.posix.join(relDir, 'facts.json'),
    rules: null,
  };
  delete (result as any).hasVideo;
  if (input.rulesFile && (await stat(input.rulesFile).catch(() => null))?.isFile()) {
    await copyFile(input.rulesFile, path.join(dir, 'REPLICATE.md'));
    result.rules = path.posix.join(relDir, 'REPLICATE.md');
  }
  await writeFile(path.join(dir, 'facts.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}
