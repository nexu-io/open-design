#!/usr/bin/env node
// Garbage-collect orphaned plugin-preview clips from the repository-assets R2
// bucket (spec slice 4b). Preview clips are immutable and content-addressed, so
// the bucket only ever grows: a content change ships a NEW <id>/<fingerprint>/
// directory and the old one is left behind. This job deletes the leftovers —
// but ONLY ones no live build still references.
//
// Source of truth = the object keys named by every PROTECTED manifest, NOT
// filename parsing. A clip stays protected while ANY of these reference it:
//   - any git tag's manifest          (shipped stable/preview releases)
//   - any live release/** branch HEAD  (feeds the non-tagged nightly + preview)
//   - the current main manifest        (beta / staging / the next build)
// Anything outside that set AND older than a grace window is an orphan.
//
// SAFETY: dry-run by default — it prints what it WOULD delete and deletes
// nothing. Real deletion requires BOTH `--delete` and GC_ENABLE_DELETE=1, so the
// scheduled workflow can run in report-only mode for a while before anyone arms
// it. Deletions are also recoverable: re-running the bake at a clip's source
// state regenerates the identical <id>/<fingerprint>/ keys.
//
// Usage:
//   node scripts/plugin-previews-gc.mjs [--delete] [--grace-days N] [--prefix plugin-previews/]
// Env (only needed for the live R2 list/delete, not for the pure unit tests):
//   R2_BUCKET, R2_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION
//   GC_ENABLE_DELETE=1   (second arming switch, with --delete)

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const MANIFEST_PATH = 'data/plugin-previews/manifest.json';
const DEFAULT_PREFIX = 'plugin-previews/';
const DEFAULT_GRACE_DAYS = 90;

// ---- pure helpers (unit-tested) -------------------------------------------

// The prefix-relative object keys a single manifest references (video + poster
// of every preview entry). Tolerant of partial/legacy entries.
export function keysFromManifest(manifest) {
  const previews = (manifest && manifest.previews) || {};
  const keys = [];
  for (const entry of Object.values(previews)) {
    if (entry && typeof entry.video === 'string') keys.push(entry.video);
    if (entry && typeof entry.poster === 'string') keys.push(entry.poster);
  }
  return keys;
}

// Union of referenced keys across every protected manifest.
export function protectedKeys(manifests) {
  const set = new Set();
  for (const m of manifests) for (const k of keysFromManifest(m)) set.add(k);
  return set;
}

// Orphans = listed objects whose key is not protected AND older than the grace
// window. `objects` is [{ key, lastModifiedMs }]; `protectedSet` holds
// prefix-relative keys; `nowMs`/`graceDays` bound the age gate.
export function selectOrphans(objects, protectedSet, { nowMs, graceDays }) {
  const graceMs = graceDays * 24 * 60 * 60 * 1000;
  return objects
    .filter((o) => !protectedSet.has(o.key))
    .filter((o) => nowMs - o.lastModifiedMs > graceMs)
    .map((o) => o.key);
}

// ---- IO (live run) ---------------------------------------------------------

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

// Manifest JSON at a git ref, or null when the ref has no manifest yet.
function manifestAtRef(ref) {
  try {
    return JSON.parse(git(['show', `${ref}:${MANIFEST_PATH}`]));
  } catch {
    return null;
  }
}

// Every ref whose manifest must protect its clips: all tags + main + each live
// release/** branch HEAD.
function protectedRefs() {
  const refs = new Set(['origin/main']);
  const tags = git(['tag']).split('\n').map((s) => s.trim()).filter(Boolean);
  for (const t of tags) refs.add(t);
  const branches = git(['for-each-ref', '--format=%(refname)', 'refs/remotes/origin/release'])
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((r) => r.replace('refs/remotes/', ''));
  for (const b of branches) refs.add(b);
  return [...refs];
}

// List the bucket's preview objects as [{ key, lastModifiedMs }] (key is
// prefix-relative). `aws s3 ls --recursive` lines: "DATE TIME  SIZE  full/key".
function listR2(prefix) {
  const bucket = process.env.R2_BUCKET;
  const endpoint = (process.env.R2_ENDPOINT || '').replace(/\/+$/, '');
  if (!bucket || !endpoint) throw new Error('R2_BUCKET and R2_ENDPOINT are required to list R2');
  const out = execFileSync(
    'aws',
    ['s3', 'ls', `s3://${bucket}/${prefix}`, '--recursive', '--endpoint-url', endpoint],
    { encoding: 'utf8' },
  );
  const objects = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+\d+\s+(.+)$/);
    if (!m) continue;
    const fullKey = m[3];
    if (!fullKey.startsWith(prefix)) continue;
    const key = fullKey.slice(prefix.length);
    if (!key || key.endsWith('/')) continue; // skip the manifest pointer / dir markers
    if (key === 'manifest.json') continue;
    objects.push({ key, lastModifiedMs: Date.parse(`${m[1]}T${m[2]}Z`) });
  }
  return objects;
}

function deleteR2(prefix, keys) {
  const bucket = process.env.R2_BUCKET;
  const endpoint = (process.env.R2_ENDPOINT || '').replace(/\/+$/, '');
  for (const key of keys) {
    execFileSync(
      'aws',
      ['s3', 'rm', `s3://${bucket}/${prefix}${key}`, '--endpoint-url', endpoint],
      { stdio: 'inherit' },
    );
  }
}

function parseArgs(argv) {
  const args = { delete: false, graceDays: DEFAULT_GRACE_DAYS, prefix: DEFAULT_PREFIX };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--delete') args.delete = true;
    else if (argv[i] === '--grace-days') args.graceDays = Number(argv[(i += 1)]);
    else if (argv[i] === '--prefix') args.prefix = argv[(i += 1)];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const refs = protectedRefs();
  const manifests = refs.map(manifestAtRef).filter(Boolean);
  const protectedSet = protectedKeys(manifests);
  console.log(`protected by ${manifests.length}/${refs.length} refs → ${protectedSet.size} live keys`);

  const objects = listR2(args.prefix);
  const orphans = selectOrphans(objects, protectedSet, { nowMs: Date.now(), graceDays: args.graceDays });
  console.log(
    `${objects.length} objects under ${args.prefix}; ${orphans.length} orphan(s) older than ${args.graceDays}d`,
  );
  for (const k of orphans) console.log(`  orphan: ${k}`);

  const armed = args.delete && process.env.GC_ENABLE_DELETE === '1';
  if (!orphans.length) return;
  // Fail closed: never delete from a protected set built on partial ref data
  // (e.g. main's manifest could not be read). An empty/main-less protected set
  // would mark live clips as orphans.
  if (armed && (protectedSet.size === 0 || !manifestAtRef('origin/main'))) {
    console.error(
      'refusing to delete: protected set is empty or origin/main manifest is unreadable — fail-closed',
    );
    process.exit(1);
  }
  if (!armed) {
    console.log(
      `DRY RUN — deleting nothing. Re-run with --delete and GC_ENABLE_DELETE=1 to remove the ${orphans.length} orphan(s).`,
    );
    return;
  }
  console.log(`deleting ${orphans.length} orphan(s)…`);
  deleteR2(args.prefix, orphans);
}

const invokedDirectly =
  process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
