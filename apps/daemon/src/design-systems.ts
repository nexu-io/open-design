// Design-system registry. Scans <projectRoot>/design-systems/* for DESIGN.md
// files. Title comes from the first H1. Category comes from a
// `> Category: <name>` blockquote line beneath the H1. Summary is the first
// paragraph between the H1 and the next heading (Category line stripped).

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export type DesignSystemSurface = 'web' | 'image' | 'video' | 'audio';

export type DesignSystemSummary = {
  id: string;
  title: string;
  category: string;
  summary: string;
  swatches: string[];
  surface: DesignSystemSurface;
  body: string;
};

type ColorToken = { name: string; value: string };

export async function listDesignSystems(root: string): Promise<DesignSystemSummary[]> {
  const out: DesignSystemSummary[] = [];
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const designPath = path.join(root, entry.name, 'DESIGN.md');
    try {
      const stats = await stat(designPath);
      if (!stats.isFile()) continue;
      const raw = await readFile(designPath, 'utf8');
      const titleMatch = /^#\s+(.+?)\s*$/m.exec(raw);
      const title = cleanTitle(titleMatch?.[1] ?? entry.name);
      out.push({
        id: entry.name,
        title,
        category: extractCategory(raw) ?? 'Uncategorized',
        summary: summarize(raw),
        swatches: extractSwatches(raw),
        surface: extractSurface(raw),
        body: raw,
      });
    } catch {
      // Skip.
    }
  }
  return out;
}

export async function readDesignSystem(root: string, id: string): Promise<string | null> {
  const file = path.join(root, id, 'DESIGN.md');
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Structured (compiled) form of a brand's design system. Optional sibling
 * files alongside DESIGN.md that, when present, give agents a
 * machine-readable token contract and a worked fixture instead of having
 * to re-derive both from prose. Both fields are individually optional —
 * the daemon falls back to the DESIGN.md-only path when neither is
 * available, which is the current state for the ~138 brands without
 * hand-authored or derived tokens.
 *
 * - `tokensCss`     — verbatim content of `<brand>/tokens.css`.
 * - `fixtureHtml`   — verbatim content of `<brand>/components.html`.
 */
export type DesignSystemAssets = {
  tokensCss?: string | undefined;
  fixtureHtml?: string | undefined;
};

export async function readDesignSystemAssets(
  root: string,
  id: string,
): Promise<DesignSystemAssets> {
  const [tokensCss, fixtureHtml] = await Promise.all([
    readFileOptional(path.join(root, id, 'tokens.css')),
    readFileOptional(path.join(root, id, 'components.html')),
  ]);
  return { tokensCss, fixtureHtml };
}

/**
 * Returns true when the daemon should inject the structured design-system
 * channel (tokens.css + components.html) into the system prompt for the
 * active brand. Default-on as of PR-D — the only value that disables
 * the channel is the literal string `'0'` on `OD_DESIGN_TOKEN_CHANNEL`,
 * which acts as the kill switch. Unset, `'1'`, `'true'`, empty string,
 * or any other value all keep the new default.
 *
 * Extracted from `server.ts` so the env-flag semantics (the single
 * line PR-D actually flipped) can be unit-tested independently of the
 * full daemon boot path. A regression that, say, restored the old
 * `=== '1'` semantics or read the wrong env name would change the
 * return value here and fail the unit test, even before any
 * downstream prompt-assembly behaviour drifts.
 */
export function isDesignTokenChannelEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.OD_DESIGN_TOKEN_CHANNEL !== '0';
}

/**
 * Resolves the structured design-system assets the daemon will hand to
 * `composeSystemPrompt` for a given brand, applying both the
 * `OD_DESIGN_TOKEN_CHANNEL` kill-switch and the built-in →
 * user-installed root fallback chain.
 *
 * This is the function `server.ts` calls at the prompt-assembly seam.
 * Extracted so the *whole* server-side asset-resolution path —
 * env gate + per-file fallback + result shape — is unit-testable
 * end-to-end from real disk fixtures, not just the boolean predicate.
 *
 * Behaviour (pinned by `tests/design-system-assets.test.ts`):
 *
 * - **`OD_DESIGN_TOKEN_CHANNEL=0`** (kill switch) — returns
 *   `{ tokensCss: undefined, fixtureHtml: undefined }` regardless of
 *   what's on disk. The composer skips both blocks, falling back to
 *   the pre-PR-C DESIGN.md-only prompt.
 * - **Any other env state** (unset, `'1'`, `'true'`, …) — reads
 *   `tokens.css` and `components.html` from `builtInRoot/<id>/`. Any
 *   file missing there falls back to `userInstalledRoot/<id>/`
 *   independently per file, so a brand can ship one half built-in and
 *   the other half from user-installed without losing either.
 *
 * Real fs errors that are not "file not found" still propagate (see
 * `readFileOptional`), so a misconfigured brand surfaces loudly
 * instead of silently degrading to the prose-only prompt.
 */
export async function resolveDesignSystemAssets(
  designSystemId: string,
  builtInRoot: string,
  userInstalledRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DesignSystemAssets> {
  if (!isDesignTokenChannelEnabled(env)) {
    return { tokensCss: undefined, fixtureHtml: undefined };
  }

  const builtIn = await readDesignSystemAssets(builtInRoot, designSystemId);
  if (builtIn.tokensCss !== undefined && builtIn.fixtureHtml !== undefined) {
    return builtIn;
  }

  const userInstalled = await readDesignSystemAssets(userInstalledRoot, designSystemId);
  return {
    tokensCss: builtIn.tokensCss ?? userInstalled.tokensCss,
    fixtureHtml: builtIn.fixtureHtml ?? userInstalled.fixtureHtml,
  };
}

async function readFileOptional(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    // Only swallow "file genuinely does not exist" failures. Today the
    // ~138 brands without hand-authored or derived tokens.css /
    // components.html siblings hit this path on the empty side, which
    // is the legacy fallback we deliberately preserve. Every other
    // failure mode — permission denied (`EACCES`), parent-shadowed by
    // a non-directory (`EPERM`), a directory at the file path
    // (`EISDIR`), a broken packaged-resource symlink, a transient I/O
    // error — means the token channel is misconfigured; the caller
    // (and the smoke-test rollout) needs to see that explicitly
    // instead of silently degrading to the DESIGN.md-only prompt and
    // making the experiment look ineffective for the wrong reason.
    if (isAbsenceError(err)) return undefined;
    throw err;
  }
}

function isAbsenceError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function summarize(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const firstH1 = lines.findIndex((l) => /^#\s+/.test(l));
  if (firstH1 === -1) return '';
  const afterH1 = lines.slice(firstH1 + 1);
  const nextHeading = afterH1.findIndex((l) => /^#{1,6}\s+/.test(l));
  const window = (nextHeading === -1 ? afterH1 : afterH1.slice(0, nextHeading))
    .join('\n')
    // Drop the Category metadata line — it's surfaced separately.
    .replace(/^>\s*Category:.*$/gim, '')
    .replace(/^>\s*/gm, '')
    .trim();
  return window.split(/\n\n/)[0]?.slice(0, 240) ?? '';
}

function extractCategory(raw: string): string | undefined {
  const m = /^>\s*Category:\s*(.+?)\s*$/im.exec(raw);
  return m?.[1];
}

const KNOWN_SURFACES = new Set<DesignSystemSurface>(['web', 'image', 'video', 'audio']);
function extractSurface(raw: string): DesignSystemSurface {
  const m = /^>\s*Surface:\s*(.+?)\s*$/im.exec(raw);
  if (!m) return 'web';
  const v = m[1]?.trim().toLowerCase();
  return isDesignSystemSurface(v) ? v : 'web';
}

function isDesignSystemSurface(value: string | undefined): value is DesignSystemSurface {
  return value !== undefined && KNOWN_SURFACES.has(value as DesignSystemSurface);
}

// Strip boilerplate like "Design System Inspired by Cohere" → "Cohere" so
// the picker dropdown reads cleanly. Hand-authored titles that don't match
// the pattern (e.g. "Neutral Modern") pass through unchanged.
function cleanTitle(raw: string): string {
  return raw
    .replace(/^Design System (Inspired by|for)\s+/i, '')
    .trim();
}

/**
 * Pull 4 representative colors from a DESIGN.md so the picker can render
 * a tiny swatch row next to each system. Order: [bg, support, fg, accent].
 *
 * The shape is deliberately compact — one accent + one background + one
 * fg + one supporting tone — so the row reads like a brand mark even at
 * thumbnail scale. Picked greedily by token-name hints (matches the
 * heuristics in design-system-preview.js so the strip and the showcase
 * agree on which colors the system "is").
 *
 * @param {string} raw  Markdown body of DESIGN.md
 * @returns {string[]}  Up to 4 hex strings; [] if extraction fails.
 */
function extractSwatches(raw: string): string[] {
  const colors: ColorToken[] = [];
  const seen = new Set<string>();
  function push(name: string, value: string): void {
    const cleanName = name.replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const v = normalizeHex(value);
    if (!v || cleanName.length > 60) return;
    const key = `${cleanName}|${v}`;
    if (seen.has(key)) return;
    seen.add(key);
    colors.push({ name: cleanName, value: v });
  }
  // Form A: "- **Background:** `#FAFAFA`" — the colon may sit inside the
  // bold markers (`**Name:**`) or outside them (`**Name**:`). Both variants
  // are common in hand-authored DESIGN.md files, so we allow the colon in
  // either position around the closing `**`.
  const reA = /^[\s>*-]*\**\s*([A-Za-z][A-Za-z0-9 /&()+_-]{1,40}?)\s*[:：]?\s*\**\s*[:：]?\s*`?(#[0-9a-fA-F]{3,8})/gm;
  let m;
  while ((m = reA.exec(raw)) !== null) push(m[1] ?? '', m[2] ?? '');
  // Form B: "**Stripe Purple** (`#533afd`)"
  const reB = /\*\*([A-Za-z][A-Za-z0-9 /&()+_-]{1,40}?)\*\*\s*\(?\s*`?(#[0-9a-fA-F]{3,8})/g;
  while ((m = reB.exec(raw)) !== null) push(m[1] ?? '', m[2] ?? '');
  if (colors.length === 0) return [];

  function pick(hints: string[]): string | null {
    for (const h of hints) {
      const found = colors.find((c) => c.name.includes(h));
      if (found) return found.value;
    }
    return null;
  }
  function isNeutral(hex: string): boolean {
    if (!/^#[0-9a-f]{6}$/.test(hex)) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return Math.max(r, g, b) - Math.min(r, g, b) < 10;
  }

  const bg =
    pick(['page background', 'background', 'canvas', 'paper', 'surface'])
    ?? '#ffffff';
  const fg =
    pick(['heading', 'foreground', 'ink', 'fg', 'text', 'navy', 'graphite'])
    ?? '#111111';
  const accent =
    pick(['primary brand', 'brand primary', 'accent', 'brand', 'primary'])
    ?? colors.find((c) => !isNeutral(c.value))?.value
    ?? colors[0]?.value
    ?? '#888888';
  const support =
    pick(['border', 'divider', 'rule', 'muted', 'secondary', 'subtle'])
    ?? colors.find(
      (c) => isNeutral(c.value) && c.value !== bg && c.value !== fg,
    )?.value
    ?? '#cccccc';

  return [bg, support, fg, accent];
}

function normalizeHex(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(raw.trim());
  if (!m) return null;
  let hex = m[1] ?? '';
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length === 4) hex = hex.split('').map((c) => c + c).join('').slice(0, 8);
  return '#' + hex.toLowerCase();
}
