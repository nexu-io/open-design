/**
 * Post-build copier — `skills/<slug>/example.html` and
 * `design-templates/<slug>/example.html` get copied next to the
 * static detail-page output (`out/skills/<slug>/example.html`,
 * `out/templates/live-<slug>/preview.html` for live-artifacts) so the
 * detail-page iframe and "Open in new tab" links resolve.
 *
 * Why post-build copy and not Astro endpoint routes:
 *   Astro 6 does not register `pages/<dir>/[slug]/<file>.<ext>.ts`
 *   files as static endpoints under dynamic segments — the route is
 *   silently dropped at build time and the iframe URL 404s on deploy
 *   even with `export const prerender = true`. A flat copy step at the
 *   end of `astro build` sidesteps the routing mismatch entirely.
 *
 * Without this step the build artifact only contains the per-detail
 * `index.html` Astro generates from `[slug]/index.astro`. Cloudflare
 * Pages then SPA-fallbacks `/skills/<slug>/example.html` to the
 * homepage, which the browser displays as "404 / wrong page" inside
 * the iframe.
 *
 * Live-artifact templates carry a `live-` slug prefix
 * (`shapeLiveArtifactTemplate()` in `_lib/catalog.ts`); their detail
 * page sits at `/templates/live-<slug>/`, so the preview must land at
 * `out/templates/live-<slug>/preview.html`. The source file is
 * `index.html` (the rendered preview), not `template.html` (which
 * still contains `{{data.*}}` placeholders).
 *
 * Runs after `astro build`. Read source from the repo-root content
 * directories (`skills/`, `design-templates/`, `templates/`) — same
 * convention `generate-previews.ts` already uses.
 */

import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..', '..');
const OUT_DIR = path.join(APP_ROOT, 'out');
const SKILLS_SRC = path.join(REPO_ROOT, 'skills');
const DESIGN_TEMPLATES_SRC = path.join(REPO_ROOT, 'design-templates');
const LIVE_ARTIFACTS_SRC = path.join(REPO_ROOT, 'templates', 'live-artifacts');
const BUNDLED_PLUGINS_SRC = path.join(REPO_ROOT, 'plugins', '_official');
// Buckets that may carry a runnable `example.html` referenced by the
// manifest's `od.preview.entry`. `design-systems`, `image-templates`,
// `video-templates`, `scenarios` ship media (poster URL or generated
// card) instead and don't need an iframe-able local entry.
const BUNDLED_BUCKETS_WITH_EXAMPLE = ['examples'] as const;

let copied = 0;
let skipped = 0;

function copyIfExists(srcFile: string, destFile: string): boolean {
  if (!existsSync(srcFile)) return false;
  mkdirSync(path.dirname(destFile), { recursive: true });
  copyFileSync(srcFile, destFile);
  return true;
}

// Mirror every file referenced from an entry HTML so the iframe URL
// can resolve them on Cloudflare Pages instead of SPA-falling-back to
// the homepage. Replaces the older single-shape `./assets/` heuristic
// with a generic walker:
//
//   1. Parse relative refs in the form `(src|href|poster|srcset)="X"`
//      and `url(X)`. Skip absolute URLs, data: / mailto: / javascript:,
//      anchors, and root-relative paths starting with `/`.
//   2. Resolve each ref against `path.dirname(entrypointSrc)` to get
//      the source file. Honest sibling refs (`assets/styles.css`,
//      `./assets/styles.css`) and cross-folder refs that step out of
//      the entry's folder (`../<other-folder>/assets/hero.png`) both
//      resolve cleanly.
//   3. Resolve the same ref against `path.dirname(iframeAbsPath)` to
//      compute the destination path inside `out/`. Browsers do the
//      identical resolution against the iframe URL, so as long as the
//      destination falls inside `iframeRootDir` (`out/plugins`,
//      `out/skills`, …) the iframe will fetch it back.
//   4. Recurse into copied HTML / CSS / JS so a multi-step chain
//      (entry → `assets/template.html` → `assets/fonts/foo.woff`)
//      doesn't strand intermediate files un-copied.
//
// `visited` keeps the recursion bounded; every source path is processed
// at most once per build.
const REF_PATTERN =
  /\b(?:src|href|poster|srcset|data-src)\s*=\s*["']([^"']+)["']|url\(\s*(['"]?)([^'")\s]+)\2\s*\)/gi;

function extractRelativeRefs(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(REF_PATTERN)) {
    const raw = (m[1] ?? m[3] ?? '').split(/[?#]/, 1)[0]?.trim();
    if (!raw) continue;
    // srcset can carry multiple URLs separated by commas + descriptors;
    // split on whitespace/commas and process each candidate.
    for (const piece of raw.split(/[,\s]+/)) {
      const v = piece.split(/[?#]/, 1)[0]?.trim();
      if (!v) continue;
      if (/^(?:https?:|data:|mailto:|tel:|javascript:|#|\/\/)/i.test(v)) continue;
      if (v.startsWith('/')) continue; // root-absolute; not ours to mirror
      out.add(v);
    }
  }
  return [...out];
}

function isWithin(parent: string, candidate: string): boolean {
  const rel = path.relative(parent, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

interface MirrorContext {
  /** Absolute path of the source file under the repo. */
  entrypointSrc: string;
  /** Absolute path of where the entry got copied to under `out/`. */
  iframeAbsPath: string;
  /** Highest directory in `out/` that cross-folder refs may walk into. */
  iframeRootDir: string;
  /** Highest directory in the repo that source refs may walk into. */
  srcRootDir: string;
  /**
   * Targets we've already copied. Keyed on the *destination* path
   * because the same source file can legitimately need to land at two
   * different out-locations: e.g. `open-design-landing/assets/hero.png`
   * is a same-folder ref for the `example-open-design-landing` entry
   * (lands at `out/plugins/example-open-design-landing/assets/hero.png`)
   * AND a cross-folder ref for `example-open-design-landing-deck`
   * (whose iframe URL `../open-design-landing/assets/hero.png` resolves
   * to `out/plugins/open-design-landing/assets/hero.png`). Tracking by
   * source path would deduplicate the second copy and 404 the deck.
   */
  visitedTargets: Set<string>;
}

function mirrorReferencedFiles(ctx: MirrorContext): number {
  if (!existsSync(ctx.entrypointSrc)) return 0;
  if (statSync(ctx.entrypointSrc).isDirectory()) return 0;

  let html: string;
  try {
    html = readFileSync(ctx.entrypointSrc, 'utf8');
  } catch {
    return 0;
  }

  let count = 0;
  for (const refPath of extractRelativeRefs(html)) {
    const srcRefAbs = path.resolve(path.dirname(ctx.entrypointSrc), refPath);
    if (!isWithin(ctx.srcRootDir, srcRefAbs)) continue;
    if (!existsSync(srcRefAbs)) continue;
    if (statSync(srcRefAbs).isDirectory()) continue;

    const outRefAbs = path.resolve(path.dirname(ctx.iframeAbsPath), refPath);
    if (!isWithin(ctx.iframeRootDir, outRefAbs)) continue;

    if (ctx.visitedTargets.has(outRefAbs)) continue;
    ctx.visitedTargets.add(outRefAbs);

    mkdirSync(path.dirname(outRefAbs), { recursive: true });
    copyFileSync(srcRefAbs, outRefAbs);
    count++;
    if (/\.(html?|css|js|mjs|svg)$/i.test(srcRefAbs)) {
      count += mirrorReferencedFiles({
        entrypointSrc: srcRefAbs,
        iframeAbsPath: outRefAbs,
        iframeRootDir: ctx.iframeRootDir,
        srcRootDir: ctx.srcRootDir,
        visitedTargets: ctx.visitedTargets,
      });
    }
  }
  return count;
}

function listDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((name) => {
    const full = path.join(root, name);
    return statSync(full).isDirectory() && !name.startsWith('_') && !name.startsWith('.');
  });
}

// Shared visited set so a file copied during one entrypoint's mirror
// pass isn't re-read for another entrypoint's. Keeps the build fast
// when (e.g.) two design-templates reference the same shared library.
const visitedTargets = new Set<string>();
let referencedFilesCopied = 0;

// 1. Skills — `skills/<slug>/example.html` → `out/skills/<slug>/example.html`.
for (const slug of listDirs(SKILLS_SRC)) {
  const srcDir = path.join(SKILLS_SRC, slug);
  const destDir = path.join(OUT_DIR, 'skills', slug);
  const entrypointSrc = path.join(srcDir, 'example.html');
  const iframeAbs = path.join(destDir, 'example.html');
  const ok = copyIfExists(entrypointSrc, iframeAbs);
  if (ok) {
    copied++;
    referencedFilesCopied += mirrorReferencedFiles({
      entrypointSrc,
      iframeAbsPath: iframeAbs,
      iframeRootDir: path.join(OUT_DIR, 'skills'),
      srcRootDir: SKILLS_SRC,
      visitedTargets,
    });
  } else {
    skipped++;
  }
}

// 2. Design templates — `design-templates/<slug>/example.html` →
//    `out/skills/<slug>/example.html`. The landing-page detail layer
//    treats design templates as a flavor of skill template (see
//    `_lib/catalog.ts` and `pages/templates/[slug]/index.astro` which
//    routes skill-template-origin records to `/skills/<slug>/example.html`).
for (const slug of listDirs(DESIGN_TEMPLATES_SRC)) {
  const srcDir = path.join(DESIGN_TEMPLATES_SRC, slug);
  const destDir = path.join(OUT_DIR, 'skills', slug);
  const entrypointSrc = path.join(srcDir, 'example.html');
  const iframeAbs = path.join(destDir, 'example.html');
  const ok = copyIfExists(entrypointSrc, iframeAbs);
  if (ok) {
    copied++;
    referencedFilesCopied += mirrorReferencedFiles({
      entrypointSrc,
      iframeAbsPath: iframeAbs,
      iframeRootDir: path.join(OUT_DIR, 'skills'),
      srcRootDir: DESIGN_TEMPLATES_SRC,
      visitedTargets,
    });
  }
}

// 3. Live-artifact templates — `templates/live-artifacts/<slug>/index.html`
//    → `out/templates/live-<slug>/preview.html`. The detail-page slug
//    is `live-${rawSlug}` (catalog.ts `shapeLiveArtifactTemplate()`)
//    and the iframe targets `/templates/live-<slug>/preview.html`. We
//    serve `index.html` (the rendered preview) rather than
//    `template.html` (raw template with `{{data.*}}` placeholders).
for (const slug of listDirs(LIVE_ARTIFACTS_SRC)) {
  const srcDir = path.join(LIVE_ARTIFACTS_SRC, slug);
  const destDir = path.join(OUT_DIR, 'templates', `live-${slug}`);
  const entrypointSrc = path.join(srcDir, 'index.html');
  const iframeAbs = path.join(destDir, 'preview.html');
  const ok = copyIfExists(entrypointSrc, iframeAbs);
  if (ok) {
    copied++;
    referencedFilesCopied += mirrorReferencedFiles({
      entrypointSrc,
      iframeAbsPath: iframeAbs,
      iframeRootDir: path.join(OUT_DIR, 'templates'),
      srcRootDir: LIVE_ARTIFACTS_SRC,
      visitedTargets,
    });
  }
}

// 4. Bundled plugins — `plugins/_official/<bucket>/<slug>/<entry>` →
//    `out/plugins/<manifest-id>/<entry>`. Detail pages live at
//    `/plugins/<manifest-id>/`, so the iframe and "Open in new tab"
//    pill point at `/plugins/<manifest-id>/<entry>`. Cross-folder
//    refs inside example.html (`../<other-folder>/assets/hero.png`)
//    resolve in the iframe URL to `/plugins/<other-folder>/...`
//    (bare folder name, no manifest-id prefix), so the mirror lands
//    those siblings under `out/plugins/<other-folder>/...` — that's
//    the same shape the browser will request, since walking out of
//    `<manifest-id>` and into `<other-folder>` strips the prefix.
//
// We deliberately walk only `examples/` for now: that's the bucket
// whose manifests carry a local `od.preview.entry`. The other
// bundled-plugin buckets (image/video templates, scenarios,
// design-systems) ship a remote poster URL or a generated fallback
// card and never need a local iframe target.
for (const bucket of BUNDLED_BUCKETS_WITH_EXAMPLE) {
  const bucketDir = path.join(BUNDLED_PLUGINS_SRC, bucket);
  if (!existsSync(bucketDir)) continue;
  for (const slug of listDirs(bucketDir)) {
    const slugDir = path.join(bucketDir, slug);
    const manifestPath = path.join(slugDir, 'open-design.json');
    if (!existsSync(manifestPath)) continue;

    let manifest: { name?: unknown; od?: { preview?: { entry?: unknown } } };
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      continue;
    }
    const manifestId = typeof manifest.name === 'string' ? manifest.name : null;
    const entryRel =
      typeof manifest.od?.preview?.entry === 'string'
        ? manifest.od.preview.entry
        : null;
    if (!manifestId || !entryRel) continue;

    const entrySrc = path.resolve(slugDir, entryRel);
    // Skip manifests that promise an entry the repo doesn't actually
    // ship. Without this, the detail page's `previewEntryUrl` (which
    // also guards on file existence) would still misalign with the
    // copy step's accounting and we'd silently swallow errors.
    if (!existsSync(entrySrc)) continue;
    const entryRelClean = entryRel.replace(/^\.\//, '');
    const destDir = path.join(OUT_DIR, 'plugins', manifestId);
    const iframeAbs = path.join(destDir, entryRelClean);
    const ok = copyIfExists(entrySrc, iframeAbs);
    if (ok) {
      copied++;
      referencedFilesCopied += mirrorReferencedFiles({
        entrypointSrc: entrySrc,
        iframeAbsPath: iframeAbs,
        iframeRootDir: path.join(OUT_DIR, 'plugins'),
        srcRootDir: BUNDLED_PLUGINS_SRC,
        visitedTargets,
      });
    }
  }
}

console.log(
  `[copy-example-html] copied ${copied} entry files + ${referencedFilesCopied} referenced files, skipped ${skipped} (no preview source in repo)`,
);
