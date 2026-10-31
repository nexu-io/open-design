import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';

export interface HyperFramesAudioTrack {
  file: string;
  format: string;
  start: number;
  duration: number;
  volume: number;
}

/** Resolve authored audio before frame capture; FFmpeg owns the audio clock. */
export async function prepareHyperFramesAudio(html: string, compositionDir: string): Promise<{
  html: string;
  tracks: HyperFramesAudioTrack[];
}> {
  const $ = load(html);
  const elements = $('audio').toArray();
  if (elements.length === 0) return { html, tracks: [] };
  if (elements.length > 32) throw new Error('HyperFrames supports at most 32 audio tracks');
  const root = await realpath(compositionDir);
  const tracks: HyperFramesAudioTrack[] = [];
  for (const element of elements) {
    const audio = $(element);
    const src = audio.attr('src')?.trim();
    if (!src || /^(?:[a-z][a-z\d+.-]*:|[\\/])/i.test(src)) {
      throw new Error('HyperFrames audio requires a local relative src inside the composition');
    }
    const file = await realpath(path.resolve(root, src));
    const relative = path.relative(root, file);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('HyperFrames audio must stay inside the composition');
    }
    if (!(await stat(file)).isFile()) throw new Error('HyperFrames audio src must be a file');
    const formats: Record<string, string> = { '.mp3': 'mp3', '.wav': 'wav', '.ogg': 'ogg', '.m4a': 'mov', '.mp4': 'mov', '.flac': 'flac', '.aac': 'aac', '.webm': 'matroska' };
    const format = formats[path.extname(file).toLowerCase()];
    if (!format) throw new Error('HyperFrames audio requires a supported media file, not a playlist');
    const start = Number(audio.attr('data-start') ?? '0');
    const duration = Number(audio.attr('data-duration'));
    const volume = Number(audio.attr('data-volume') ?? '1');
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration <= 0
      || !Number.isFinite(volume) || volume < 0 || volume > 1) {
      throw new Error('HyperFrames audio requires numeric start >= 0, duration > 0 and volume between 0 and 1');
    }
    if (audio.is('[loop], [data-media-start], [data-playback-rate]')) {
      throw new Error('HyperFrames desktop audio requires pre-trimmed, non-looping tracks at normal speed');
    }
    tracks.push({ file, format, start, duration, volume });
    // Keep IDs available to authored scripts while the capture window stays silent.
    audio.replaceWith($('<span hidden></span>').attr('id', audio.attr('id') ?? ''));
  }
  return { html: $.html(), tracks };
}

export function hyperFramesAudioEncodingArgs(tracks: HyperFramesAudioTrack[], duration: number): string[] {
  if (tracks.length === 0) return [];
  // Filters stay within FFmpeg 4.1 (the bundled Linux build): every track is
  // made stereo so one per-channel delay covers it (no `adelay all=1`), and
  // amix's input averaging is undone with a gain (no `amix normalize=0`).
  // Each track fades out where it stops sounding: its own authored end or the
  // film's end, whichever comes first. A track that already ends quietly is
  // unchanged; one cut short (a remake made shorter than its music) no longer
  // stops on a click.
  const filters = tracks.map((track, index) => {
    const delayMs = Math.round(track.start * 1000);
    const audible = Math.min(track.duration, duration - track.start);
    const fade = audible > 0 ? Math.min(0.6, audible / 4) : 0;
    const fadeOut = fade > 0 ? `afade=t=out:st=${round(audible - fade)}:d=${round(fade)},` : '';
    return `[${index + 1}:a]atrim=duration=${track.duration},asetpts=PTS-STARTPTS,`
      + `aformat=channel_layouts=stereo,${fadeOut}volume=${track.volume},adelay=${delayMs}|${delayMs}[a${index}]`;
  });
  const mixed = tracks.length === 1
    ? '[a0]'
    : tracks.map((_, index) => `[a${index}]`).join('')
      + `amix=inputs=${tracks.length}:duration=longest:dropout_transition=0,volume=${tracks.length},`;
  filters.push(`${mixed}apad,atrim=duration=${duration}[audio]`);
  return ['-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[audio]', '-c:a', 'aac', '-b:a', '192k'];
}

function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}
