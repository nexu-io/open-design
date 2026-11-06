import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { validateExportExpectation } from '../shared/export-spec.ts';
import type { ExportExpectation } from '../shared/export-spec.ts';
export type { ExportExpectation } from '../shared/export-spec.ts';
import { isMain } from '../shared/entry.ts';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
export function verificationBinaries() {
  const ffmpeg = process.env.HYPERFRAMES_FFMPEG_PATH || process.env.FFMPEG_PATH || (existsSync(path.join(root, '.tools/ffmpeg')) ? path.join(root, '.tools/ffmpeg') : 'ffmpeg');
  const sibling = path.join(path.dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  const ffprobe = process.env.HYPERFRAMES_FFPROBE_PATH || process.env.FFPROBE_PATH || (path.dirname(ffmpeg) !== '.' && existsSync(sibling) ? sibling : 'ffprobe');
  return { ffmpeg, ffprobe };
}

type Check = { name: string; status: 'passed' | 'failed' | 'not_run'; details: string };
type Binaries = { ffmpeg: string; ffprobe: string };
export type VerificationReport = {
  scope: 'technical';
  status: 'passed' | 'failed' | 'blocked';
  file: string; sha256?: string;
  expected: ExportExpectation;
  checks: Check[];
  remainingChecks: string[];
};

async function run(binary: string, args: string[], signal?: AbortSignal) {
  return execute(binary, args, { encoding: 'utf8', timeout: 60_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true, signal });
}
function rate(value: unknown): number {
  if (typeof value !== 'string') return NaN;
  const parts = value.split('/').map(Number);
  return parts.length === 2 ? parts[0] / parts[1] : parts[0];
}
function processFailure(error: unknown): { unavailable: boolean; message: string } {
  const e = error as Error & { code?: string | number; killed?: boolean; stderr?: string };
  return { unavailable: e.code === 'ENOENT' || e.code === 'EACCES',
    message: e.killed ? 'Verification process timed out (60 seconds).' : (e.stderr || e.message || String(error)).slice(-1600) };
}

// This verifies encoded media, not creative quality or whether the soundtrack fits the brief.
export async function verifyExport(filename: string, expectation: number | ExportExpectation, binaries: Binaries = verificationBinaries(), signal?: AbortSignal): Promise<VerificationReport> {
  const checkedRun = (binary: string, args: string[]) => run(binary, args, signal);
  if (typeof expectation === 'number' && (!Number.isFinite(expectation) || expectation < 0.5 || expectation > 60 || Math.abs(expectation * 24 - Math.round(expectation * 24)) > 0.001)) {
    throw new Error('Expected duration for legacy exports must be 0.5–60 seconds, aligned to 24 fps; use a JSON specification for native exports.');
  }
  const expected = validateExportExpectation(typeof expectation === 'number'
    ? { width: 540, height: 960, fps: 24, duration: expectation, audio: 'silent' } : expectation);
  const { width, height, fps, duration: expectedDuration } = expected;
  const report: VerificationReport = { scope: 'technical', status: 'failed', file: path.resolve(filename),
    expected, checks: [],
    remainingChecks: ['Inspect final-file frames against the brief and storyboard.', 'Play the exported MP4 through, seek, and replay in the target browser/player.',
      'Check intended sound, audible content and synchronization against the brief; optional audio does not prove a requested soundtrack exists.'] };
  const check = (name: string, passed: boolean, details: string) => report.checks.push({ name, status: passed ? 'passed' : 'failed', details });
  const failure = (name: string, error: unknown) => {
    const detail = processFailure(error);
    report.checks.push({ name, status: detail.unavailable ? 'not_run' : 'failed', details: detail.message });
  };
  const finish = () => {
    report.status = report.checks.some(c => c.status === 'failed') ? 'failed' : report.checks.some(c => c.status === 'not_run') ? 'blocked' : 'passed';
    return report;
  };

  let before;
  try {
    before = await stat(report.file);
    check('file', before.isFile() && before.size > 0, `${before.size} bytes`);
    if (!before.isFile() || !before.size) return finish();
  } catch (error) {
    check('file', false, (error as Error).message);
    return finish();
  }

  let probe;
  try {
    const result = await checkedRun(binaries.ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', report.file]);
    if (result.stderr.trim()) throw new Error(result.stderr);
    probe = JSON.parse(result.stdout);
    check('probe', true, 'ffprobe read stream and container metadata.');
  } catch (error) {
    failure('probe', error);
    report.checks.push({ name: 'decode-and-seek', status: 'not_run', details: 'Requires readable stream metadata.' });
    return finish();
  }

  const video = (probe.streams || []).filter((s: any) => s.codec_type === 'video');
  const audio = (probe.streams || []).filter((s: any) => s.codec_type === 'audio');
  check('mp4-container', String(probe.format?.format_name || '').split(',').includes('mp4'), String(probe.format?.format_name));
  check('video-stream', video.length === 1 && video[0]?.codec_name === 'h264' && video[0]?.pix_fmt === 'yuv420p',
    `${video.length} video stream(s); ${video[0]?.codec_name}; ${video[0]?.pix_fmt}`);
  check('dimensions', video[0]?.width === width && video[0]?.height === height, `${video[0]?.width}×${video[0]?.height}`);
  check('frame-rate', Math.abs(rate(video[0]?.r_frame_rate) - fps) < 0.001 && Math.abs(rate(video[0]?.avg_frame_rate) - fps) < 0.001,
    `nominal=${video[0]?.r_frame_rate}; average=${video[0]?.avg_frame_rate}`);
  check('audio', (expected.audio === 'silent' ? audio.length === 0 : expected.audio === 'required' ? audio.length > 0 : true)
    && audio.every((stream: any) => stream.codec_name === 'aac'), `${audio.length} audio stream(s); policy=${expected.audio}; codecs=${audio.map((stream: any) => stream.codec_name).join(',')}`);
  const seconds = Number(video[0]?.duration ?? probe.format?.duration);
  const tolerance = Math.max(0.1, 1 / fps);
  check('duration', Number.isFinite(seconds) && Math.abs(seconds - expectedDuration) <= tolerance + 1e-6,
    `actual=${seconds}s; expected=${expectedDuration}s; tolerance=${tolerance}s`);

  try {
    const decoded = await checkedRun(binaries.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-xerror', '-err_detect', 'explode',
      '-i', report.file, '-map', '0:v:0', '-map', '0:a?', '-fps_mode', 'passthrough', '-progress', 'pipe:1', '-f', 'null', '-']);
    if (decoded.stderr.trim()) throw new Error(decoded.stderr);
    const counts = [...decoded.stdout.matchAll(/^frame=(\d+)\s*$/gm)];
    const count = Number(counts.at(-1)?.[1]);
    check('full-decode', count > 0, `${count} video frames and all audio streams decoded without reported errors.`);
    check('decoded-duration', count > 0 && Math.abs(count / fps - expectedDuration) <= tolerance + 1e-6,
      `${count} decoded frames; expected=${Math.ceil(expectedDuration * fps - 1e-8)}`);
  } catch (error) { failure('full-decode', error); }

  const targets = [0, Math.floor(expectedDuration * fps / 2) / fps, Math.max(0, Math.ceil(expectedDuration * fps - 1e-8) - 1) / fps];
  for (const [index, time] of targets.entries()) {
    try {
      const result = await checkedRun(binaries.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-xerror', '-err_detect', 'explode',
        '-ss', String(time), '-i', report.file, '-map', '0:v:0', '-frames:v', '1', '-an', '-f', 'framemd5', 'pipe:1']);
      if (result.stderr.trim()) throw new Error(result.stderr);
      check(['seek-first', 'seek-middle', 'seek-last'][index], /^\s*\d+,/m.test(result.stdout), `Seek and decode at ${time.toFixed(6)}s.`);
    } catch (error) { failure(['seek-first', 'seek-middle', 'seek-last'][index], error); }
  }
  try {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(report.file)) hash.update(chunk);
    report.sha256 = hash.digest('hex');
    const after = await stat(report.file);
    check('unchanged-file', before.size === after.size && before.mtimeMs === after.mtimeMs && before.ino === after.ino,
      'File identity, size and modification time compared across verification.');
  } catch (error) { check('unchanged-file', false, (error as Error).message); }
  return finish();
}

if (isMain(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node --experimental-strip-types scripts/verify-export.ts FILE EXPECTATION_JSON_OR_LEGACY_SECONDS');
    const report = await verifyExport(process.argv[2], JSON.parse(process.argv[3]));
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'passed') process.exitCode = 1;
  } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
