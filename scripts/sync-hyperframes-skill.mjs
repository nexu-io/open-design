#!/usr/bin/env node
// Maintainer tool: refresh the vendored HyperFrames skill in
// `skills/hyperframes/` from the upstream `heygen-com/hyperframes`
// publication.
//
// Why vendor instead of relying on `npx skills add`? Coverage. The
// `skills` CLI only symlinks into a known list of agent dirs (Claude
// Code, Codex, Cursor, Trae, Factory, etc.) — but OD supports a wider
// agent set (Hermes, Kimi, Qwen, BYOK CLIs that aren't on `skills`'s
// allowlist). By vendoring under `skills/hyperframes/` and routing the
// content through OD's own skill scanner (which injects the SKILL.md
// body into the system prompt), every OD-supported agent — including
// BYOK setups — gets HyperFrames guidance uniformly.
//
// This script does NOT auto-merge. Reasons:
//   1. We add an OD-specific frontmatter shim (od.mode/surface/preview/…)
//      and an "Open Design integration" section near the top of
//      SKILL.md. An auto-merge would either drop the shim (breaking OD
//      classification) or duplicate it on every sync.
//   2. Upstream may rename references, restructure subdirs, or change
//      `triggers`. A human eye catches that in one read.
//
// What it DOES do:
//   - Run `npx skills add heygen-com/hyperframes -y` into a temp dir
//   - Diff the upstream `hyperframes/` subtree against the vendored copy
//   - Print a summary of changed files (added / modified / removed)
//   - Exit non-zero when there's drift, so you notice
//
// Usage:
//   node scripts/sync-hyperframes-skill.mjs           # show diff
//   node scripts/sync-hyperframes-skill.mjs --apply   # NOT IMPLEMENTED;
//                                                       always reviewed
//                                                       by hand
//
// To actually apply: copy the upstream files in by hand, re-add the OD
// frontmatter shim and the "Open Design integration" section.

import { execFile as execFileCb } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const VENDORED = path.join(REPO_ROOT, 'skills', 'hyperframes');

async function main() {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'od-hf-sync-'));
  try {
    console.log(`[sync] installing upstream into ${tmpRoot}`);
    // `-y` auto-accepts the install confirmation prompt; we install just
    // the `hyperframes` sub-skill (the main one we vendor) to keep the
    // probe focused.
    await execFile(
      'npx',
      ['-y', 'skills', 'add', 'heygen-com/hyperframes', '-s', 'hyperframes', '-y'],
      { cwd: tmpRoot, timeout: 90_000, maxBuffer: 16 * 1024 * 1024 },
    );

    const upstream = path.join(tmpRoot, '.agents', 'skills', 'hyperframes');
    if (!(await exists(upstream))) {
      console.error(
        `[sync] upstream not found at expected path: ${upstream}\n` +
          '       The skills CLI may have changed where it installs to.',
      );
      process.exit(2);
    }

    const upstreamFiles = await collect(upstream);
    const vendoredFiles = await collect(VENDORED);

    const upstreamMap = new Map(upstreamFiles.map((f) => [f.rel, f]));
    const vendoredMap = new Map(vendoredFiles.map((f) => [f.rel, f]));

    const added = [];
    const modified = [];
    const removed = [];

    for (const [rel, up] of upstreamMap) {
      const ven = vendoredMap.get(rel);
      if (!ven) {
        added.push(rel);
        continue;
      }
      // SKILL.md gets local edits (frontmatter shim + OD integration
      // section), so a byte-for-byte compare always reports drift.
      // Compare only the body AFTER our injected section by matching
      // upstream's first H2 heading. Imperfect but useful as a hint.
      if (rel === 'SKILL.md') {
        const upstreamMarker = '\n## Approach\n';
        const upBody = up.text.includes(upstreamMarker)
          ? up.text.slice(up.text.indexOf(upstreamMarker))
          : up.text;
        const venBody = ven.text.includes(upstreamMarker)
          ? ven.text.slice(ven.text.indexOf(upstreamMarker))
          : ven.text;
        if (upBody !== venBody) modified.push(`${rel} (body after ## Approach)`);
        continue;
      }
      if (up.text !== ven.text) modified.push(rel);
    }
    for (const rel of vendoredMap.keys()) {
      if (!upstreamMap.has(rel)) removed.push(rel);
    }

    if (added.length === 0 && modified.length === 0 && removed.length === 0) {
      console.log('[sync] vendored copy matches upstream — nothing to do.');
      process.exit(0);
    }

    console.log('\n[sync] DRIFT DETECTED — review and update by hand.\n');
    if (added.length) {
      console.log(`  Added (in upstream, missing locally):`);
      for (const r of added) console.log(`    + ${r}`);
    }
    if (modified.length) {
      console.log(`  Modified upstream:`);
      for (const r of modified) console.log(`    ~ ${r}`);
    }
    if (removed.length) {
      console.log(`  Removed upstream (still vendored locally):`);
      for (const r of removed) console.log(`    - ${r}`);
    }
    console.log(
      '\n  Upstream copy lives at:\n' +
        `    ${upstream}\n` +
        '  (script does not auto-apply — re-run with diff tools, then\n' +
        '   commit the merge by hand. Re-add OD frontmatter shim if it\n' +
        '   gets dropped during the merge.)',
    );
    process.exit(1);
  } finally {
    // Best-effort cleanup. Leaves the upstream dir behind if the user
    // wants to inspect it in the failure path.
    if (process.env.OD_KEEP_HF_SYNC_TMP) {
      console.log(`[sync] OD_KEEP_HF_SYNC_TMP set — leaving ${tmpRoot}`);
    } else {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  }
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function collect(root) {
  const out = [];
  await walk(root, '', out);
  return out;
}

async function walk(root, rel, out) {
  let entries;
  try {
    entries = await readdir(path.join(root, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      await walk(root, childRel, out);
      continue;
    }
    if (!e.isFile()) continue;
    const text = await readFile(path.join(root, childRel), 'utf8').catch(
      () => null,
    );
    if (text == null) continue;
    out.push({ rel: childRel, text });
  }
}

main().catch((err) => {
  console.error('[sync] failed:', err && err.message ? err.message : err);
  process.exit(2);
});
