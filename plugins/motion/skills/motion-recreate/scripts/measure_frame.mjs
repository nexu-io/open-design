#!/usr/bin/env node
// Compare a reference frame and a remix frame with numbers.
//
// Both frames are scaled to the same size so pixel values compare directly.
//
// Whole frame (always reported):
//   mean_luma   average brightness 0-255
//   detail      share of pixels on a sharp edge (lines, labels, wireframes);
//               a lower value means a sparser or blurrier picture
//   accent      share of strongly coloured pixels (brand-colour lines, fills)
//
// Region (with --region): the box around the content that differs from the
// region's background, whichever is lighter or darker. For one line of text its
// height is roughly the cap/ascender height; for a logo it is the logo height.
// A box that touches the region edge usually means the region is too small or
// the content is clipped; touching the frame edge means it is cut off.
//
// Usage:
//   node measure_frame.mjs REF REMIX --t 12.0 [--ref-t 12.4]
//        [--region x,y,w,h] [--ref-region x,y,w,h]
//        [--size 1920x1080] [--threshold 60]
// Times are in seconds; regions are in pixels of --size (default: remix size).
// ffmpeg/ffprobe: HYPERFRAMES_FFMPEG_PATH / FFMPEG_PATH (and the FFPROBE
// equivalents) when set, then the copies beside the Node running this script,
// then PATH. No npm dependencies.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// The self-contained package keeps Node at runtime/node/bin/node (Windows:
// runtime/node/node.exe) and FFmpeg at runtime/media/bin, but puts neither on
// the agent's PATH; run this script with that Node and it finds FFmpeg itself.
const windows = process.platform === 'win32';
const bundled = path.join(path.dirname(process.execPath), windows ? '..' : '../..', 'media', 'bin');
function binary(name, keys) {
  for (const key of keys) if (process.env[key]) return process.env[key];
  const candidate = path.join(bundled, name + (windows ? '.exe' : ''));
  return existsSync(candidate) ? candidate : name;
}
const ffmpeg = binary('ffmpeg', ['HYPERFRAMES_FFMPEG_PATH', 'FFMPEG_PATH']);
const ffprobe = binary('ffprobe', ['HYPERFRAMES_FFPROBE_PATH', 'FFPROBE_PATH']);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { maxBuffer: 1 << 30 });
  if (result.error?.code === 'ENOENT') fail(`${command} not found: set FFMPEG_PATH/FFPROBE_PATH, or run this script with the package's own Node`);
  if (result.error) fail(`${command}: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} failed: ${result.stderr.toString().trim()}`);
  return result.stdout;
}

function probeSize(file) {
  const line = run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file])
    .toString().trim().split(/\r?\n/)[0];
  const [w, h] = line.split(',').map(Number);
  return [w, h];
}

function rgbFrame(file, t, w, h) {
  const raw = run(ffmpeg, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1',
    '-vf', `scale=${w}:${h}:flags=area,format=rgb24`, '-f', 'rawvideo', '-']);
  const n = w * h;
  if (raw.length < n * 3) fail(`could not decode a frame at ${t}s from ${file}`);
  const gray = new Uint8Array(n);
  let chroma = 0;
  for (let i = 0; i < n; i++) {
    const r = raw[i * 3], g = raw[i * 3 + 1], b = raw[i * 3 + 2];
    gray[i] = (77 * r + 150 * g + 29 * b) >> 8;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 60) chroma++;
  }
  return { gray, chroma };
}

const round = (value, digits) => Number(value.toFixed(digits));

function wholeFrame({ gray, chroma }, w, h) {
  let edges = 0, sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x, v = gray[i];
      if (Math.abs(v - gray[i + 1]) > 24 || Math.abs(v - gray[i + w]) > 24) edges++;
    }
  }
  const n = w * h;
  return { mean_luma: round(sum / n, 1), detail: round(edges / n, 4), accent: round(chroma / n, 4) };
}

function parseRegion(name, value, w, h) {
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || !parts.every(Number.isInteger)) fail(`--${name} must be four integers x,y,w,h, got "${value}"`);
  const [x, y, rw, rh] = parts;
  if (x < 0 || y < 0 || rw < 2 || rh < 2 || x + rw > w || y + rh > h) {
    fail(`--${name} ${value} must lie inside the ${w}x${h} frame and be at least 2x2 pixels`);
  }
  return parts;
}

function regionBox(gray, w, h, [x0, y0, rw, rh], threshold) {
  const border = [];
  for (let x = x0; x < x0 + rw; x++) border.push(gray[y0 * w + x], gray[(y0 + rh - 1) * w + x]);
  for (let y = y0; y < y0 + rh; y++) border.push(gray[y * w + x0], gray[y * w + x0 + rw - 1]);
  border.sort((a, b) => a - b);
  const bg = border[Math.floor(border.length / 2)];
  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) {
      if (Math.abs(gray[y * w + x] - bg) >= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        maxY = y;
      }
    }
  }
  if (maxY < 0) return { background_luma: bg, bbox: null };
  return {
    background_luma: bg,
    bbox: [minX, minY, maxX - minX + 1, maxY - minY + 1],
    height_px: maxY - minY + 1,
    width_px: maxX - minX + 1,
    touches_region_edge: minX === x0 || minY === y0 || maxX === x0 + rw - 1 || maxY === y0 + rh - 1,
    touches_frame_edge: minX === 0 || minY === 0 || maxX === w - 1 || maxY === h - 1,
  };
}

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    t: { type: 'string' }, 'ref-t': { type: 'string' }, region: { type: 'string' }, 'ref-region': { type: 'string' },
    size: { type: 'string' }, threshold: { type: 'string', default: '60' }, help: { type: 'boolean', short: 'h' },
  },
});
if (a.help || positionals.length !== 2 || a.t === undefined) {
  console.log('usage: node measure_frame.mjs REF REMIX --t SECONDS [--ref-t SECONDS] [--region x,y,w,h] [--ref-region x,y,w,h] [--size WxH] [--threshold 60]');
  process.exit(a.help ? 0 : 2);
}
const [refFile, remixFile] = positionals;
const [w, h] = a.size ? a.size.toLowerCase().split('x').map(Number) : probeSize(remixFile);
if (!(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0)) fail(`invalid frame size ${w}x${h}`);
const t = Number(a.t), refT = a['ref-t'] === undefined ? t : Number(a['ref-t']);
const threshold = Number(a.threshold);
const refFrame = rgbFrame(refFile, refT, w, h), mixFrame = rgbFrame(remixFile, t, w, h);
const ref = wholeFrame(refFrame, w, h), mix = wholeFrame(mixFrame, w, h);
const out = {
  size: [w, h], ref_t: refT, remix_t: t, ref, remix: mix,
  brightness_ok: mix.mean_luma >= ref.mean_luma * 0.9,
  detail_ok: mix.detail >= ref.detail * 0.7,
  accent_ok: ref.accent < 0.002 || mix.accent >= ref.accent * 0.6,
};
if (a.region || a['ref-region']) {
  const mixRegion = parseRegion('region', a.region || a['ref-region'], w, h);
  const refRegion = parseRegion('ref-region', a['ref-region'] || a.region, w, h);
  ref.region = regionBox(refFrame.gray, w, h, refRegion, threshold);
  mix.region = regionBox(mixFrame.gray, w, h, mixRegion, threshold);
  // An element that cannot be found must never read as a pass: a missing remix
  // element fails, and an empty reference region means the measurement is blocked.
  if (!ref.region.bbox) {
    out.region_status = 'blocked';
    out.region_error = 'no content in the reference region; choose a region around the reference element and measure again';
    out.height_ok = false;
    out.clipped = null;
  } else if (!mix.region.bbox) {
    out.region_status = 'failed';
    out.region_error = 'no content in the remix region; the element is missing or the region is wrong';
    out.height_ok = false;
    out.clipped = null;
  } else {
    out.region_status = 'measured';
    out.height_ratio = round(mix.region.height_px / ref.region.height_px, 2);
    out.height_ok = mix.region.height_px / ref.region.height_px >= 0.8;
    out.clipped = mix.region.touches_frame_edge;
  }
}
console.log(JSON.stringify(out, null, 2));
