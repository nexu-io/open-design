import { spawn } from 'node:child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { hyperFramesAudioEncodingArgs, type HyperFramesAudioTrack } from './hyperframes-audio.js';

const FRAME_ENCODING_TIMEOUT_MS = 5 * 60 * 1000;

export interface EncodeFramesAudio {
  /** Prepared audio tracks to mix under the frames. Empty means silent output. */
  tracks: HyperFramesAudioTrack[];
  /** Film duration in seconds; the mixed audio is padded/trimmed to this length. */
  duration: number;
}

/**
 * Encode a numbered PNG frame sequence into an H.264 MP4.
 *
 * Shared by every frame-capture renderer (HyperFrames/Motion and the p5
 * hand-painted renderer). Audio is optional: callers without an audio
 * pipeline get a video-only file, while HyperFrames keeps its mixed tracks.
 */
export function encodeFramesMp4(
  framePattern: string,
  fps: number,
  outputPath: string,
  audio?: EncodeFramesAudio,
): Promise<void> {
  const ffmpegPath = process.env.HYPERFRAMES_FFMPEG_PATH?.trim() || ffmpegInstaller.path;
  const audioTracks = audio?.tracks ?? [];
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-framerate',
        String(fps),
        '-start_number',
        '0',
        '-i',
        framePattern,
        ...audioTracks.flatMap((track) => ['-protocol_whitelist', 'file,pipe', '-f', track.format, '-i', track.file]),
        ...hyperFramesAudioEncodingArgs(audioTracks, audio?.duration ?? 0),
        '-vf',
        'pad=ceil(iw/2)*2:ceil(ih/2)*2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        outputPath,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('FFmpeg encoding timed out after 5 minutes'));
    }, FRAME_ENCODING_TIMEOUT_MS);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(
        `FFmpeg encoding failed (${signal ? `signal ${signal}` : `exit ${String(code)}`}): ${stderr.trim()}`,
      ));
    });
  });
}
