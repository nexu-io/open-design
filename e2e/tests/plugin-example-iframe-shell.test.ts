// Bundled example pages that showcase a template via a full-page iframe must
// be IFRAME-ONLY shells (recvqholN2wcep).
//
// The daemon's sandboxed preview route (apps/daemon/src/routes/plugins/
// assets.ts) serves example.html with a strict CSP — `default-src 'none'`
// with no `frame-src` — so a nested iframe inside the served page can never
// load. The sanctioned pattern is the iframe-only shell: when the body is
// EXACTLY one `<iframe src="...html">`, `iframeOnlyHtmlShellTarget` unwraps
// it and serves the inner template directly, so no nested frame exists at
// preview time.
//
// trading-analysis-dashboard-template broke this by adding a header strip
// above its iframe: the unwrap no longer matched, the iframe was blocked by
// CSP, and both the live preview and the CI-baked gallery poster rendered as
// a gray broken frame (the Feishu P1 "实时看板示例模板图没加载出来"). This
// guard fails for any example.html that embeds a sibling .html through an
// iframe but is NOT a pure shell, so the breakage can't silently return.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const EXAMPLE_ROOTS = ['plugins/_official/examples', 'design-templates'];

async function findExamplePages(root: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name, 'example.html');
    try {
      await readFile(candidate);
      out.push(candidate);
    } catch {
      // no example page in this template dir
    }
  }
  return out;
}

function bodyContent(html: string): string | null {
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  if (!bodyMatch) return null;
  return (bodyMatch[1] ?? '').replace(/<!--[\s\S]*?-->/g, '').trim();
}

/** Mirrors the daemon's iframeOnlyHtmlShellTarget acceptance shape. */
function isIframeOnlyShell(body: string): boolean {
  return /^<iframe\b[^>]*\bsrc\s*=\s*(['"])[^'"]+\1[^>]*>\s*(?:<\/iframe>)?\s*$/i.test(body);
}

/** True when the body embeds a sibling .html document through an iframe. */
function embedsRelativeHtmlIframe(body: string): boolean {
  const iframe = /<iframe\b[^>]*\bsrc\s*=\s*(['"])([^'"]+)\1/i.exec(body);
  if (!iframe) return false;
  const src = (iframe[2] ?? '').trim();
  if (!src || src.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(src)) return false;
  const pathOnly = src.split(/[?#]/)[0] ?? '';
  return /\.html?$/i.test(pathOnly);
}

describe('bundled example pages that iframe a sibling template are pure shells', () => {
  it('every example.html embedding a relative .html iframe is an iframe-only shell the daemon can unwrap', async () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const rootRel of EXAMPLE_ROOTS) {
      for (const page of await findExamplePages(path.join(repoRoot, rootRel))) {
        const body = bodyContent(await readFile(page, 'utf8'));
        if (body === null) continue;
        if (!embedsRelativeHtmlIframe(body)) continue;
        checked += 1;
        if (!isIframeOnlyShell(body)) {
          offenders.push(path.relative(repoRoot, page));
        }
      }
    }
    // Sanity: the corpus must contain the known shell pages, or the scan
    // itself has gone blind (renamed roots, changed layout).
    expect(checked).toBeGreaterThanOrEqual(2);
    expect(offenders).toEqual([]);
  });
});
