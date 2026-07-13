#!/usr/bin/env node
// Drift check between the TypeScript source-of-truth registry
// (apps/web/src/media/models.ts) and the TS mirror used by the Node daemon
// (apps/daemon/src/media-models.ts). The two are kept in sync by hand because the
// daemon avoids a TS toolchain at runtime; this script lets CI fail the
// build the moment they diverge.
//
// Usage:
//   node scripts/verify-media-models.mjs
//
// Exit codes:
//   0 — registries match
//   1 — drift detected (diff printed to stderr)
//   2 — could not parse one of the registry files

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TS_PATH = path.join(ROOT, 'apps', 'web', 'src', 'media', 'models.ts');
const JS_PATH = path.join(ROOT, 'apps', 'daemon', 'src', 'media-models.ts');

function fail(msg) {
  process.stderr.write(`verify-media-models: ${msg}\n`);
  process.exit(1);
}

function parseError(msg) {
  process.stderr.write(`verify-media-models: ${msg}\n`);
  process.exit(2);
}

// Pull a top-level array literal of `{ id: 'x', ... }` records out of the
// source. We deliberately avoid spinning up a TS compiler — we only need
// the IDs and the bucket shapes the two files agree on.
function extractIds(source, name) {
  const re = new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`, 'm');
  const m = source.match(re);
  if (!m) return null;
  const ids = [];
  const idRe = /\bid:\s*['\"]([^'\"]+)['\"]/g;
  let id;
  while ((id = idRe.exec(m[1])) != null) ids.push(id[1]);
  return ids;
}

function extractAudioIds(source) {
  const re = /export const AUDIO_MODELS_BY_KIND[^=]*=\s*\{([\s\S]*?)\n\};/m;
  const m = source.match(re);
  if (!m) return null;
  const body = m[1];
  const out = {};
  for (const kind of ['music', 'speech', 'sfx']) {
    const kre = new RegExp(`${kind}\\s*:\\s*\\[([\\s\\S]*?)\\]`, 'm');
    const km = body.match(kre);
    if (!km) return null;
    const ids = [];
    const idRe = /\bid:\s*['\"]([^'\"]+)['\"]/g;
    let id;
    while ((id = idRe.exec(km[1])) != null) ids.push(id[1]);
    out[kind] = ids;
  }
  return out;
}

function extractNumberArray(source, name) {
  const re = new RegExp(`export const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`, 'm');
  const m = source.match(re);
  if (!m) return null;
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

function dedupCheck(label, ids) {
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) fail(`duplicate id "${id}" in ${label}`);
    seen.add(id);
  }
  if (ids.length === 0) fail(`${label} is empty`);
}

let ts;
let js;
try {
  ts = readFileSync(TS_PATH, 'utf8');
} catch (err) {
  parseError(`could not read ${TS_PATH}: ${err.message}`);
}
try {
  js = readFileSync(JS_PATH, 'utf8');
} catch (err) {
  parseError(`could not read ${JS_PATH}: ${err.message}`);
}

const tsImage = extractIds(ts, 'IMAGE_MODELS');
const tsVideo = extractIds(ts, 'VIDEO_MODELS');
const tsAudio = extractAudioIds(ts);
const tsLengths = extractNumberArray(ts, 'VIDEO_LENGTHS_SEC');
const tsDurations = extractNumberArray(ts, 'AUDIO_DURATIONS_SEC');

const jsImage = extractIds(js, 'IMAGE_MODELS');
const jsVideo = extractIds(js, 'VIDEO_MODELS');
const jsAudio = extractAudioIds(js);
const jsLengths = extractNumberArray(js, 'VIDEO_LENGTHS_SEC');
const jsDurations = extractNumberArray(js, 'AUDIO_DURATIONS_SEC');

if (!tsImage || !tsVideo || !tsAudio) parseError('failed to parse TS registry');
if (!jsImage || !jsVideo || !jsAudio) parseError('failed to parse JS registry');

dedupCheck('IMAGE_MODELS (ts)', tsImage);
dedupCheck('VIDEO_MODELS (ts)', tsVideo);
dedupCheck('IMAGE_MODELS (js)', jsImage);
dedupCheck('VIDEO_MODELS (js)', jsVideo);
for (const kind of ['music', 'speech', 'sfx']) {
  dedupCheck(`AUDIO_MODELS_BY_KIND.${kind} (ts)`, tsAudio[kind]);
  dedupCheck(`AUDIO_MODELS_BY_KIND.${kind} (js)`, jsAudio[kind]);
}

function diffArrays(label, a, b) {
  const aSet = new Set(a);
  const bSet = new Set(b);
  const onlyA = [...aSet].filter((x) => !bSet.has(x));
  const onlyB = [...bSet].filter((x) => !aSet.has(x));
  if (onlyA.length === 0 && onlyB.length === 0) return null;
  return `${label}: ts only=[${onlyA.join(', ')}], js only=[${onlyB.join(', ')}]`;
}

const diffs = [];
const dImage = diffArrays('IMAGE_MODELS', tsImage, jsImage);
if (dImage) diffs.push(dImage);
const dVideo = diffArrays('VIDEO_MODELS', tsVideo, jsVideo);
if (dVideo) diffs.push(dVideo);
for (const kind of ['music', 'speech', 'sfx']) {
  const d = diffArrays(`AUDIO_MODELS_BY_KIND.${kind}`, tsAudio[kind], jsAudio[kind]);
  if (d) diffs.push(d);
}
if (tsLengths && jsLengths && tsLengths.join(',') !== jsLengths.join(',')) {
  diffs.push(
    `VIDEO_LENGTHS_SEC: ts=[${tsLengths.join(', ')}] js=[${jsLengths.join(', ')}]`,
  );
}
if (
  tsDurations &&
  jsDurations &&
  tsDurations.join(',') !== jsDurations.join(',')
) {
  diffs.push(
    `AUDIO_DURATIONS_SEC: ts=[${tsDurations.join(', ')}] js=[${jsDurations.join(', ')}]`,
  );
}

if (diffs.length > 0) {
  process.stderr.write(
    'verify-media-models: drift detected between apps/web/src/media/models.ts and apps/daemon/src/media-models.ts\n',
  );
  for (const d of diffs) process.stderr.write(`  - ${d}\n`);
  process.stderr.write(
    '\nFix: update both files in lockstep, then re-run this script.\n',
  );
  process.exit(1);
}

process.stdout.write('verify-media-models: OK (TS + JS registries match)\n');
