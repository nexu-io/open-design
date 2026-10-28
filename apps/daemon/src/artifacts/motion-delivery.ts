import fs from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import { execFile } from 'node:child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { isMotionVideoComposition } from '@open-design/contracts/runtime/motion-source-player';
import { prepareHyperFramesAudio } from '../media/hyperframes-audio.js';

/** Export inputs read from an actual composition, never from an Agent plan. */
export interface MotionExportSpec {
  sourcePath: string;
  videoPath: string;
  audio: 'required' | 'silent';
}

export async function readMotionExportSpec(input: {
  projectRoot: string;
  sourcePath: string;
  outputPath: string;
}): Promise<MotionExportSpec | undefined> {
  const root = await fs.realpath(input.projectRoot);
  const source = await fs.realpath(path.resolve(root, input.sourcePath));
  const html = await fs.readFile(source, 'utf8');
  if (!isMotionVideoComposition(html)) return undefined;
  if (!source.startsWith(root + path.sep)) throw new Error('Motion source must stay inside the project.');
  const $ = load(html);
  const href = $('link[rel="alternate"][type="video/mp4"]').attr('href');
  if (!href || /[?#\\]/.test(href) || /^[a-z]+:/i.test(href) || path.isAbsolute(href)) {
    throw new Error('Motion source must link its actual project-relative MP4 output.');
  }
  const video = path.resolve(path.dirname(source), href);
  if (!video.startsWith(root + path.sep) || !/\.mp4$/i.test(video)
    || video !== path.resolve(root, input.outputPath)) {
    throw new Error('Motion source MP4 link must match the requested export path inside the project.');
  }
  const outputParent = await fs.realpath(path.dirname(video));
  if (outputParent !== root && !outputParent.startsWith(root + path.sep)) {
    throw new Error('Motion MP4 output directory must stay inside the project.');
  }
  const existingOutput = await fs.realpath(video).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (existingOutput && !existingOutput.startsWith(root + path.sep)) {
    throw new Error('Motion MP4 output must stay inside the project.');
  }
  const policy = $('meta[name="od-motion-audio"]').attr('content');
  if (policy !== undefined && policy !== 'required' && policy !== 'silent') {
    throw new Error('Motion audio policy must be required or silent.');
  }
  const audio = policy ?? ($('audio').length ? 'required' : 'silent');
  const { tracks } = await prepareHyperFramesAudio(html, path.dirname(source));
  if (audio === 'required' && !tracks.some(track => track.volume > 0)) {
    throw new Error('Audible motion needs a real local audio track before export.');
  }
  if (audio === 'silent' && tracks.length) {
    throw new Error('Silent motion cannot declare audio tracks.');
  }
  return { sourcePath: input.sourcePath, videoPath: input.outputPath, audio };
}

/** FFmpeg export evidence; it does not settle a Run or evaluate creative quality. */
export async function assertMotionExport(videoFile: string, spec: MotionExportSpec): Promise<void> {
  const handle = await fs.open(videoFile, 'r');
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== 12 || header.toString('ascii', 4, 8) !== 'ftyp'
      || (await handle.stat()).size <= 32) {
      throw new Error('Motion export did not produce an MP4.');
    }
  } finally {
    await handle.close();
  }
  await new Promise<void>((resolve, reject) => {
    execFile(process.env.HYPERFRAMES_FFMPEG_PATH?.trim() || ffmpegInstaller.path,
      ['-v', 'error', '-i', videoFile, '-map', '0:v:0', '-frames:v', '1', '-f', 'null', '-'],
      { timeout: 30_000, maxBuffer: 128 * 1024 }, error => {
        if (error) reject(new Error('Motion MP4 has no decodable video frame.'));
        else resolve();
      });
  });
  const audible = await hasAudibleTrack(videoFile);
  if (spec.audio === 'required' && !audible) throw new Error('Motion MP4 is missing audible audio.');
  if (spec.audio === 'silent' && audible) throw new Error('Silent motion MP4 contains audible audio.');
}

function hasAudibleTrack(file: string): Promise<boolean> {
  return new Promise(resolve => {
    execFile(process.env.HYPERFRAMES_FFMPEG_PATH?.trim() || ffmpegInstaller.path,
      ['-hide_banner', '-i', file, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'],
      { timeout: 30_000, maxBuffer: 128 * 1024 }, (error, _stdout, stderr) => {
        const peak = /max_volume:\s*(-?[\d.]+) dB/.exec(stderr);
        resolve(!error && !!peak && Number(peak[1]) > -80);
      });
  });
}
