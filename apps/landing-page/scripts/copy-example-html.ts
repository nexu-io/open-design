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

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..', '..');
const OUT_DIR = path.join(APP_ROOT, 'out');
const SKILLS_SRC = path.join(REPO_ROOT, 'skills');
const DESIGN_TEMPLATES_SRC = path.join(REPO_ROOT, 'design-templates');
const LIVE_ARTIFACTS_SRC = path.join(REPO_ROOT, 'templates', 'live-artifacts');

let copied = 0;
let skipped = 0;

function copyIfExists(srcFile: string, destFile: string): boolean {
  if (!existsSync(srcFile)) return false;
  mkdirSync(path.dirname(destFile), { recursive: true });
  copyFileSync(srcFile, destFile);
  return true;
}

function listDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((name) => {
    const full = path.join(root, name);
    return statSync(full).isDirectory() && !name.startsWith('_') && !name.startsWith('.');
  });
}

// 1. Skills — `skills/<slug>/example.html` → `out/skills/<slug>/example.html`.
for (const slug of listDirs(SKILLS_SRC)) {
  const ok = copyIfExists(
    path.join(SKILLS_SRC, slug, 'example.html'),
    path.join(OUT_DIR, 'skills', slug, 'example.html'),
  );
  if (ok) copied++;
  else skipped++;
}

// 2. Design templates — `design-templates/<slug>/example.html` →
//    `out/skills/<slug>/example.html`. The landing-page detail layer
//    treats design templates as a flavor of skill template (see
//    `_lib/catalog.ts` and `pages/templates/[slug]/index.astro` which
//    routes skill-template-origin records to `/skills/<slug>/example.html`).
for (const slug of listDirs(DESIGN_TEMPLATES_SRC)) {
  const ok = copyIfExists(
    path.join(DESIGN_TEMPLATES_SRC, slug, 'example.html'),
    path.join(OUT_DIR, 'skills', slug, 'example.html'),
  );
  if (ok) copied++;
}

// 3. Live-artifact templates — `templates/live-artifacts/<slug>/index.html`
//    → `out/templates/live-<slug>/preview.html`. The detail-page slug
//    is `live-${rawSlug}` (catalog.ts `shapeLiveArtifactTemplate()`)
//    and the iframe targets `/templates/live-<slug>/preview.html`. We
//    serve `index.html` (the rendered preview) rather than
//    `template.html` (raw template with `{{data.*}}` placeholders).
for (const slug of listDirs(LIVE_ARTIFACTS_SRC)) {
  const ok = copyIfExists(
    path.join(LIVE_ARTIFACTS_SRC, slug, 'index.html'),
    path.join(OUT_DIR, 'templates', `live-${slug}`, 'preview.html'),
  );
  if (ok) copied++;
}

console.log(`[copy-example-html] copied ${copied} files, skipped ${skipped} (no preview source in repo)`);
