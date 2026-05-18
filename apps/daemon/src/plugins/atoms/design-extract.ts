// Phase 6/7 entry slice / spec §10 / §21.3.2 — design-extract atom.
//
// SKILL.md fragment ships at plugins/_official/atoms/design-extract/.
// The runner takes a project cwd that already has
// `<cwd>/code/index.json` (the output of the `code-import` atom) and
// scans every text file under the source repo for design tokens
// (colors, font families, spacing, radii, shadows). It writes the
// canonical bag the SKILL.md fragment promises:
//
//   <cwd>/code/tokens.json
//
// The extractor is a heuristic, deliberately conservative pass —
// false negatives are preferable to false positives, because
// `token-map` then asks the human to confirm the mapping. The
// SKILL.md fragment documents this limitation so the agent doesn't
// claim the bag is exhaustive.

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import type { CodeImportIndex } from './code-import.js';

export type DesignTokenKind = 'color' | 'typography' | 'spacing' | 'radius' | 'shadow';

export interface DesignTokenEntry {
  kind:    DesignTokenKind;
  name?:   string;
  value:   string;
  sources: string[];
  usage:   string[];
}

export interface DesignExtractReport {
  colors:     DesignTokenEntry[];
  typography: DesignTokenEntry[];
  spacing:    DesignTokenEntry[];
  radius:     DesignTokenEntry[];
  shadow:     DesignTokenEntry[];
  // Files we touched. Pinned so `token-map.unmatched.json` can
  // attribute "this token came from <file>" without re-scanning.
  scannedFiles: string[];
  warnings:     string[];
  endedAt:      string;
}

export interface DesignExtractOptions {
  // Project cwd containing code/index.json + the source files.
  cwd: string;
  // Repo root (where the imported source actually lives — typically
  // distinct from cwd; the runner reads file contents via this path).
  repoPath: string;
  // Per-file size cap — files larger than this are skipped because
  // the regex pass becomes O(n) on hundreds of MB of bundled JS.
  // Default 256 KiB.
  largeFileBytes?: number;
}

const DEFAULT_LARGE_FILE = 256 * 1024;

const HEX_COLOR_RE   = /#[0-9a-fA-F]{3,8}\b/g;
const RGBA_COLOR_RE  = /rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)/g;
const HSLA_COLOR_RE  = /hsla?\(\s*[\d.]+(?:deg|rad|turn)?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*[\d.]+)?\s*\)/g;
const VAR_COLOR_RE   = /--([a-z][a-z0-9-]*-(?:color|fg|bg|accent|primary|secondary|surface|border|muted))\s*:\s*([^;\n]+)/g;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;\n]+)/g;
const SPACING_PX_RE  = /\b(?:padding|margin|gap|inset|top|left|right|bottom)\s*:\s*(\d+(?:\.\d+)?(?:px|rem|em))/g;
const RADIUS_RE      = /border-radius\s*:\s*([^;\n]+)/g;
const SHADOW_RE      = /box-shadow\s*:\s*([^;\n]+)/g;
const TAILWIND_HEX_RE = /['"]#[0-9a-fA-F]{3,8}['"]/g;

export async function runDesignExtract(opts: DesignExtractOptions): Promise<DesignExtractReport> {
  const cwd = path.resolve(opts.cwd);
  const repoPath = path.resolve(opts.repoPath);
  const largeFileBytes = opts.largeFileBytes ?? DEFAULT_LARGE_FILE;
  const indexPath = path.join(cwd, 'code', 'index.json');
  const warnings: string[] = [];

  let index: CodeImportIndex;
  try {
    const raw = await fsp.readFile(indexPath, 'utf8');
    index = JSON.parse(raw) as CodeImportIndex;
  } catch (err) {
    throw new Error(`design-extract: missing or unreadable code/index.json (run code-import first): ${(err as Error).message}`);
  }

  // Per-token aggregation: dedupe by canonical value and collect
  // the (path, line) sources + the file basenames usage[].
  const colors:     Map<string, DesignTokenEntry> = new Map();
  const typography: Map<string, DesignTokenEntry> = new Map();
  const spacing:    Map<string, DesignTokenEntry> = new Map();
  const radius:     Map<string, DesignTokenEntry> = new Map();
  const shadow:     Map<string, DesignTokenEntry> = new Map();
  const scannedFiles: string[] = [];

  for (const entry of index.files) {
    if (entry.size > largeFileBytes) continue;
    const lang = entry.language;
    if (lang !== 'css' && lang !== 'scss' && lang !== 'ts' && lang !== 'tsx' &&
        lang !== 'js' && lang !== 'jsx' && lang !== 'html' && lang !== 'json') {
      continue;
    }
    const abs = path.join(repoPath, entry.path);
    let text: string;
    try {
      text = await fsp.readFile(abs, 'utf8');
    } catch {
      warnings.push(`unreadable: ${entry.path}`);
      continue;
    }
    scannedFiles.push(entry.path);
    extractColors(text, entry.path, colors);
    extractCSSVariables(text, entry.path, colors);
    extractTypography(text, entry.path, typography);
    extractSpacing(text, entry.path, spacing);
    extractRadius(text, entry.path, radius);
    extractShadow(text, entry.path, shadow);
    // Tailwind config / theme files are JS/TS — capture quoted hex
    // colours that aren't picked up by HEX_COLOR_RE alone.
    if (lang === 'js' || lang === 'ts') {
      extractTailwindHexes(text, entry.path, colors);
    }
  }

  if (scannedFiles.length === 0) {
    warnings.push('design-extract scanned 0 files; check that code-import populated code/index.json');
  }

  const report: DesignExtractReport = {
    colors:     [...colors.values()].sort(byNameOrValue),
    typography: [...typography.values()].sort(byNameOrValue),
    spacing:    [...spacing.values()].sort(byNameOrValue),
    radius:     [...radius.values()].sort(byNameOrValue),
    shadow:     [...shadow.values()].sort(byNameOrValue),
    scannedFiles,
    warnings,
    endedAt: new Date().toISOString(),
  };

  await fsp.mkdir(path.join(cwd, 'code'), { recursive: true });
  await fsp.writeFile(
    path.join(cwd, 'code', 'tokens.json'),
    JSON.stringify(report, null, 2) + '\n',
    'utf8',
  );
  return report;
}

function byNameOrValue(a: DesignTokenEntry, b: DesignTokenEntry): number {
  if (a.name && b.name && a.name !== b.name) return a.name.localeCompare(b.name);
  return a.value.localeCompare(b.value);
}

function pushSource(map: Map<string, DesignTokenEntry>, key: string, kind: DesignTokenKind, value: string, source: string, name?: string) {
  let entry = map.get(key);
  if (!entry) {
    entry = { kind, value, sources: [], usage: [] };
    if (name) entry.name = name;
    map.set(key, entry);
  }
  if (!entry.sources.includes(source)) entry.sources.push(source);
  const basename = path.basename(source);
  if (!entry.usage.includes(basename)) entry.usage.push(basename);
}

function extractColors(text: string, file: string, out: Map<string, DesignTokenEntry>): void {
  for (const re of [HEX_COLOR_RE, RGBA_COLOR_RE, HSLA_COLOR_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const value = m[0];
      const line = lineNumberAt(text, m.index);
      pushSource(out, `c:${value.toLowerCase()}`, 'color', value, `${file}:${line}`);
    }
  }
}

function extractCSSVariables(text: string, file: string, out: Map<string, DesignTokenEntry>): void {
  VAR_COLOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VAR_COLOR_RE.exec(text)) !== null) {
    const name = `--${m[1]}`;
    const value = (m[2] ?? '').trim();
    if (!value) continue;
    const line = lineNumberAt(text, m.index);
    pushSource(out, `cv:${name}`, 'color', value, `${file}:${line}`, name);
  }
}

function extractTypography(text: string, file: string, out: Map<string, DesignTokenEntry>): void {
  FONT_FAMILY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FONT_FAMILY_RE.exec(text)) !== null) {
    const value = (m[1] ?? '').replace(/['"]/g, '').trim();
    if (!value) continue;
    const line = lineNumberAt(text, m.index);
    pushSource(out, `f:${value.toLowerCase()}`, 'typography', value, `${file}:${line}`);
  }
}

function extractSpacing(text: string, file: string, out: Map<string, DesignTokenEntry>): void {
  SPACING_PX_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SPACING_PX_RE.exec(text)) !== null) {
    const value = m[1] ?? '';
    if (!value) continue;
    const line = lineNumberAt(text, m.index);
    pushSource(out, `s:${value}`, 'spacing', value, `${file}:${line}`);
  }
}

function extractRadius(text: string, file: string, out: Map<string, DesignTokenEntry>): void {
  RADIUS_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RADIUS_RE.exec(text)) !== null) {
    const value = (m[1] ?? '').trim();
    if (!value) continue;
    const line = lineNumberAt(text, m.index);
    pushSource(out, `r:${value}`, 'radius', value, `${file}:${line}`);
  }
}

function extractShadow(text: string, file: string, out: Map<string, DesignTokenEntry>): void {
  SHADOW_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SHADOW_RE.exec(text)) !== null) {
    const value = (m[1] ?? '').trim();
    if (!value) continue;
    const line = lineNumberAt(text, m.index);
    pushSource(out, `sh:${value}`, 'shadow', value, `${file}:${line}`);
  }
}

function extractTailwindHexes(text: string, file: string, out: Map<string, DesignTokenEntry>): void {
  TAILWIND_HEX_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAILWIND_HEX_RE.exec(text)) !== null) {
    const raw = m[0]!;
    const value = raw.slice(1, -1);
    const line = lineNumberAt(text, m.index);
    pushSource(out, `c:${value.toLowerCase()}`, 'color', value, `${file}:${line}`);
  }
}

function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}
