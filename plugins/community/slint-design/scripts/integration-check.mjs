#!/usr/bin/env node
/**
 * Fast, zero-deps integration checks for slint-design.
 * No Electron / daemon / network. Safe for GHA smoke + local CI.
 *
 * Validates:
 *  - manifest + SKILL shape
 *  - od.preview.type=image with poster file present and NO entry
 *  - examples/templates exist
 *  - stub redirect README
 *  - community marketplace catalog discovery + version alignment
 *  - optional: slint-viewer --check on examples (skip if missing)
 */
import { readFileSync, existsSync, accessSync, constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pluginRoot, '../../..');
const failures = [];

function fail(msg) {
  failures.push(msg);
  console.error(`FAIL: ${msg}`);
}
function ok(msg) {
  console.log(`OK: ${msg}`);
}

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function mustExist(rel, base = pluginRoot) {
  const abs = path.join(base, rel);
  if (!existsSync(abs)) fail(`missing file: ${path.relative(repoRoot, abs)}`);
  else ok(`exists ${rel}`);
  return abs;
}

// --- manifest / SKILL ---
const manifestPath = mustExist('open-design.json');
const skillPath = mustExist('SKILL.md');
const manifest = readJson(manifestPath);
const skill = readFileSync(skillPath, 'utf8');

if (manifest.name !== 'slint-design') fail(`manifest.name=${manifest.name}`);
else ok('manifest.name=slint-design');
if (manifest.version !== '0.1.0') fail(`manifest.version=${manifest.version}`);
else ok(`manifest.version=${manifest.version}`);
if (manifest.od?.kind !== 'skill') fail(`od.kind=${manifest.od?.kind}`);
else ok('od.kind=skill');
if (manifest.od?.taskKind !== 'new-generation') fail(`od.taskKind=${manifest.od?.taskKind}`);
else ok('od.taskKind=new-generation');

const preview = manifest.od?.preview ?? {};
if (preview.type !== 'image') fail(`preview.type=${preview.type} (want image)`);
else ok('preview.type=image');
if (typeof preview.entry === 'string' && preview.entry.length > 0) {
  fail(`preview.entry must be absent for image preview, got ${preview.entry}`);
} else {
  ok('preview.entry absent (image poster path)');
}
if (typeof preview.poster !== 'string' || !preview.poster) fail('preview.poster missing');
else {
  const posterAbs = path.resolve(pluginRoot, preview.poster);
  if (!existsSync(posterAbs)) fail(`poster file missing: ${preview.poster}`);
  else ok(`poster file ${preview.poster}`);
}

const mcp = manifest.od?.context?.mcp ?? [];
const docsMcp = mcp.find((m) => m?.name === 'slint-docs');
if (!docsMcp || docsMcp.url !== 'https://docs.slint.dev/mcp') {
  fail('docs MCP https://docs.slint.dev/mcp missing');
} else {
  ok('docs MCP url declared (no network fetch)');
}

if (!skill.startsWith('---\n') || !skill.includes('name: slint-design')) {
  fail('SKILL.md frontmatter missing name: slint-design');
} else {
  ok('SKILL.md frontmatter');
}

// --- examples / templates ---
for (const rel of [
  'examples/hello-window.slint',
  'examples/hello-window.png',
  'templates/desktop-window/ui.slint',
  'templates/settings-form/ui.slint',
  'scripts/smoke.sh',
  'references/workflow.md',
]) {
  mustExist(rel);
}

// --- stub redirect ---
const stub = path.join(repoRoot, 'plugins/slint-design/README.md');
if (!existsSync(stub)) fail('stub plugins/slint-design/README.md missing');
else {
  const body = readFileSync(stub, 'utf8');
  if (!body.includes('plugins/community/slint-design')) {
    fail('stub README does not point at community path');
  } else {
    ok('stub README redirects to community/slint-design');
  }
}

// --- catalog discovery (community marketplace) ---
const marketPath = path.join(
  repoRoot,
  'plugins/registry/community/open-design-marketplace.json',
);
if (!existsSync(marketPath)) fail('community marketplace missing');
else {
  const market = readJson(marketPath);
  const entry = (market.plugins ?? []).find((p) => p.name === 'community/slint-design');
  if (!entry) fail('community/slint-design not in marketplace catalog');
  else {
    ok('catalog lists community/slint-design');
    if (entry.version !== manifest.version) {
      fail(`catalog version ${entry.version} != manifest ${manifest.version}`);
    } else {
      ok('catalog version aligns with manifest');
    }
    const sub = String(entry.source ?? '').replace(
      /^github:nexu-io\/open-design(?:@[^/]+)?\//,
      '',
    );
    if (sub !== 'plugins/community/slint-design') {
      fail(`catalog source subpath=${sub}`);
    } else {
      ok('catalog source subpath plugins/community/slint-design');
    }
  }
}

// --- optional viewer --check (no screenshots; keep CI fast) ---
const viewer = process.env.SLINT_VIEWER || 'slint-viewer';
let viewerOk = false;
try {
  if (viewer.startsWith('/')) accessSync(viewer, constants.X_OK);
  else {
    const which = spawnSync('bash', ['-lc', `command -v ${JSON.stringify(viewer)}`], {
      encoding: 'utf8',
    });
    if (which.status !== 0) throw new Error('not on PATH');
  }
  viewerOk = true;
} catch {
  console.log('SKIP: slint-viewer not available; --check omitted');
}

if (viewerOk) {
  const files = [
    'examples/hello-window.slint',
    'templates/desktop-window/ui.slint',
    'templates/settings-form/ui.slint',
  ];
  for (const rel of files) {
    const abs = path.join(pluginRoot, rel);
    const r = spawnSync(viewer, ['--check', abs], {
      encoding: 'utf8',
      timeout: 15_000,
    });
    if (r.status !== 0) {
      fail(`--check ${rel}: ${r.stderr || r.stdout || r.error}`);
    } else {
      ok(`--check ${rel}`);
    }
  }
}

if (failures.length) {
  console.error(`\n${failures.length} integration check(s) failed.`);
  process.exit(1);
}
console.log('\nAll slint-design integration checks passed.');
