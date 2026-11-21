// Authored overrides layer for a brand kit.
//
// The kit under `system/` (plus `brand.html` and `DESIGN.md`) is rebuilt from
// its inputs after every chat turn, so anything an agent hand-edits there is
// overwritten. Design decisions `brand.json` cannot express — patterns, icon
// treatments, contrast fixes, a reworked artifact page — are authored in the
// project's `overrides/` folder instead, mirrored into the brand workspace at
// finalize, and re-applied by every rebuild. The paths and the prompt wording
// share one source: `@open-design/contracts` brand-kit-authoring.

import fs from 'node:fs';
import path from 'node:path';

import {
  BRAND_OVERRIDES_STYLESHEET,
  BRAND_OVERRIDES_SYSTEM_DIR,
  BRAND_SYSTEM_OVERRIDES_STYLESHEET,
  isReservedBrandSystemPath,
} from '@open-design/contracts';
import {
  findRealTagEnd,
  findRealTagOffset,
  HTML_TAG_PATTERNS,
} from '@open-design/contracts/runtime/html-injection-points';

import type { BrandSystem } from './engine/index.js';
import type { AssetKind } from './schema.js';

export interface BrandOverrides {
  /** Contents of `overrides/brand.css`, or null when absent. */
  stylesheet: string | null;
  /** `overrides/system/**`, keyed by bundle-relative POSIX path. */
  files: Map<string, Buffer>;
}

export const EMPTY_BRAND_OVERRIDES: BrandOverrides = { stylesheet: null, files: new Map() };

/**
 * Read the authored overrides under `<root>/overrides/`. Throws when an
 * override targets a reserved token/doc path, so the author learns why the
 * change would not land instead of it being silently dropped.
 */
export function readBrandOverrides(root: string): BrandOverrides {
  const stylesheetPath = path.join(root, ...BRAND_OVERRIDES_STYLESHEET.split('/'));
  const stylesheet = isFile(stylesheetPath) ? fs.readFileSync(stylesheetPath, 'utf8') : null;
  const files = new Map<string, Buffer>();
  const systemDir = path.join(root, ...BRAND_OVERRIDES_SYSTEM_DIR.split('/'));
  for (const file of collectFiles(systemDir)) {
    if (isReservedBrandSystemPath(file.rel)) {
      throw new Error(
        `${BRAND_OVERRIDES_SYSTEM_DIR}/${file.rel} cannot override a generated token or doc file — ` +
          'change brand.json (or brand.json.seed for engine tokens) instead.',
      );
    }
    files.set(file.rel, fs.readFileSync(file.abs));
  }
  return { stylesheet, files };
}

export function hasBrandOverrides(overrides: BrandOverrides): boolean {
  return overrides.stylesheet !== null || overrides.files.size > 0;
}

/**
 * Gallery srcdoc hook: an overridden artifact kind previews its authored page
 * (resolved from `artifacts/` like the file itself); every other preview is
 * resolved from the gallery's own location. Both get the authored stylesheet.
 */
export function brandOverridesPreviewDecorator(
  overrides: BrandOverrides,
): ((html: string, kind: AssetKind) => string) | undefined {
  if (!hasBrandOverrides(overrides)) return undefined;
  return (html, kind) => {
    const authoredRel = `artifacts/${kind}.html`;
    const authored = overrides.files.get(authoredRel);
    if (authored) {
      const page = linkAuthoredStylesheet(authored.toString('utf8'), authoredRel, overrides);
      return injectAfterHeadOpen(page, '<base href="artifacts/">');
    }
    return linkAuthoredStylesheet(html, BRAND_SYSTEM_OVERRIDES_STYLESHEET, overrides);
  };
}

/**
 * Apply the overrides to an assembled bundle: publish the stylesheet, let
 * authored files replace or add bundle entries, and link the stylesheet into
 * every page — generated or authored. Non-HTML authored files are carried as
 * `.b64` entries so binary assets are written byte-for-byte.
 */
export function applyBrandOverrides(system: BrandSystem, overrides: BrandOverrides): BrandSystem {
  if (!hasBrandOverrides(overrides)) return system;
  const files: Record<string, string> = { ...system.files };
  for (const [rel, content] of overrides.files) {
    delete files[rel];
    if (isHtmlPath(rel)) files[rel] = content.toString('utf8');
    else files[`${rel}.b64`] = content.toString('base64');
  }
  if (overrides.stylesheet !== null) {
    files[BRAND_SYSTEM_OVERRIDES_STYLESHEET] = overrides.stylesheet;
    for (const rel of Object.keys(files)) {
      if (isHtmlPath(rel)) files[rel] = linkAuthoredStylesheet(files[rel]!, rel, overrides);
    }
  }
  return { ...system, files };
}

/** `brand.html` sits at the project root next to `system/`; link the published
 *  stylesheet when the project authors one. */
export function linkBrandOverridesIntoKitPage(html: string, projectDir: string): string {
  if (!isFile(path.join(projectDir, ...BRAND_OVERRIDES_STYLESHEET.split('/')))) return html;
  return injectBeforeHeadClose(html, stylesheetLink(`system/${BRAND_SYSTEM_OVERRIDES_STYLESHEET}`));
}

/** Link the published stylesheet into the page at bundle path `rel`, with an
 *  href relative to that page. No-op when no stylesheet is authored. */
function linkAuthoredStylesheet(html: string, rel: string, overrides: BrandOverrides): string {
  if (overrides.stylesheet === null) return html;
  const depth = rel.split('/').length - 1;
  return injectBeforeHeadClose(html, stylesheetLink(`${'../'.repeat(depth)}${BRAND_SYSTEM_OVERRIDES_STYLESHEET}`));
}

function isHtmlPath(rel: string): boolean {
  return rel.toLowerCase().endsWith('.html');
}

function stylesheetLink(href: string): string {
  return `<link rel="stylesheet" href="${href}" data-od-brand-overrides>`;
}

/** Last in `<head>` so authored rules win the cascade over generated styles. */
function injectBeforeHeadClose(html: string, tag: string): string {
  const headClose = findRealTagOffset(html, HTML_TAG_PATTERNS.headClose);
  if (headClose >= 0) return `${html.slice(0, headClose)}${tag}\n${html.slice(headClose)}`;
  return injectAfterHeadOpen(html, tag);
}

/** First in `<head>` — a `<base>` must precede every relative URL. */
function injectAfterHeadOpen(html: string, tag: string): string {
  const headEnd = findRealTagEnd(html, HTML_TAG_PATTERNS.headOpen);
  if (headEnd >= 0) return `${html.slice(0, headEnd)}\n${tag}${html.slice(headEnd)}`;
  return tag + html;
}

function isFile(abs: string): boolean {
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

/** Regular files only: symlinks are skipped so an override cannot pull in
 *  content from outside its folder. */
function collectFiles(root: string): Array<{ abs: string; rel: string }> {
  const out: Array<{ abs: string; rel: string }> = [];
  const walk = (dir: string, prefix: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.isFile()) out.push({ abs, rel });
    }
  };
  walk(root, '');
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}
