// Design Signature — a compact, deterministic fingerprint of a design,
// computed from the tokens it actually uses (palette, type rhythm, spacing
// cadence, structural density) rather than from a screenshot.
//
// The point: an artifact's *look* is opaque, but its design DNA is not. Two
// artifacts that render similarly can have very different signatures (a tight
// type scale vs. a chaotic one; a 3-color palette vs. 11). The signature makes
// that structure legible and comparable — same design across versions shows
// exactly which strand changed.
//
// Pure and dependency-free: it consumes the DesignExtractReport produced by
// `createDesignTokenEvidenceCollector` (see design-token-evidence.ts) and the
// raw artifact text. No I/O, no daemon round-trip, so it is trivially testable
// and can run client-side for a live readout.

import {
  createDesignTokenEvidenceCollector,
  type DesignExtractReport,
} from './design-token-evidence.js';

/** A single measurable trait of a design. Score is 0..100 (higher = healthier). */
export interface SignatureStrand {
  /** Stable id: 'palette' | 'rhythm' | 'cadence' | 'density'. */
  key: SignatureStrandKey;
  /** Human label, e.g. "Palette". */
  label: string;
  /** 0..100 health/quality score for this strand. */
  score: number;
  /** One-line, plain-language summary of what was measured. */
  detail: string;
}

export type SignatureStrandKey = 'palette' | 'rhythm' | 'cadence' | 'density';

export interface DesignSignature {
  /** Per-trait strands, always in a stable order. */
  strands: SignatureStrand[];
  /** Composite 0..100 across strands (mean). */
  vitality: number;
  /** Short stable hash of the structural inputs; equal designs share it. */
  fingerprint: string;
  /** Raw counts, surfaced for tooling / the UI. */
  counts: {
    colors: number;
    fontFamilies: number;
    spacing: number;
    radius: number;
    shadow: number;
  };
  /**
   * The normalized, sorted token sets the signature was computed from. Carried
   * so a diff can name *what* changed (which color, which radius), not just
   * that something did. Deterministic and JSON-safe.
   */
  tokens: {
    colors: string[];
    fontFamilies: string[];
    spacing: string[];
    radius: string[];
  };
}

const STRAND_ORDER: SignatureStrandKey[] = ['palette', 'rhythm', 'cadence', 'density'];

/**
 * Compute a {@link DesignSignature} from raw artifact text (HTML/CSS/JSX).
 * Convenience wrapper that runs the token collector first.
 */
export function computeDesignSignatureFromText(text: string): DesignSignature {
  const collector = createDesignTokenEvidenceCollector();
  collector.scanText({ text: String(text ?? ''), file: 'artifact' });
  const report = collector.toReport({ warnings: [], endedAt: '' });
  return computeDesignSignature(report);
}

/** Compute a {@link DesignSignature} from an already-extracted token report. */
export function computeDesignSignature(report: DesignExtractReport): DesignSignature {
  const colors = uniqueNormalizedColors(report.colors.map((c) => c.value));
  const fontFamilies = uniqueFontFamilies(report.typography.map((t) => t.value));
  const spacing = uniqueLengths(report.spacing.map((s) => s.value));
  const radius = uniqueLengths(report.radius.map((r) => r.value));
  const shadowCount = report.shadow.length;

  const palette = scorePalette(colors);
  const rhythm = scoreRhythm(fontFamilies.length);
  const cadence = scoreCadence(spacing);
  const density = scoreDensity({
    colors: colors.length,
    fonts: fontFamilies.length,
    spacing: spacing.length,
    radius: radius.length,
    shadow: shadowCount,
  });

  const strands: SignatureStrand[] = [palette, rhythm, cadence, density];
  // Keep strands in the canonical order regardless of construction order.
  strands.sort((a, b) => STRAND_ORDER.indexOf(a.key) - STRAND_ORDER.indexOf(b.key));

  const vitality = roundTo(
    strands.reduce((sum, s) => sum + s.score, 0) / strands.length,
    0,
  );

  return {
    strands,
    vitality,
    fingerprint: fingerprintOf(colors, spacing, radius, fontFamilies),
    counts: {
      colors: colors.length,
      fontFamilies: fontFamilies.length,
      spacing: spacing.length,
      radius: radius.length,
      shadow: shadowCount,
    },
    tokens: { colors, fontFamilies, spacing, radius },
  };
}

// ---------------------------------------------------------------------------
// Strand scoring. Each returns 0..100 where higher = a more coherent, healthy
// design. The heuristics are intentionally simple and explainable.
// ---------------------------------------------------------------------------

// A focused palette reads as intentional; a sprawling one reads as noise. We
// reward 1..6 distinct colors and taper off past that (a 20-color artifact is
// almost always accidental). Zero colors is unscored-but-not-penalized at 0.
function scorePalette(colors: string[]): SignatureStrand {
  const n = colors.length;
  let score: number;
  if (n === 0) score = 0;
  else if (n <= 6) score = 100;
  else score = Math.max(40, 100 - (n - 6) * 6);
  return {
    key: 'palette',
    label: 'Palette',
    score: clamp(roundTo(score, 0)),
    detail:
      n === 0
        ? 'No colors detected.'
        : `${n} distinct color${n === 1 ? '' : 's'}` +
          (n > 6 ? ' — broad palette, likely unintentional.' : '.'),
  };
}

// Type rhythm: a design wants a small, deliberate set of font families
// (typically 1–2). More than that fragments the voice.
function scoreRhythm(fontFamilies: number): SignatureStrand {
  let score: number;
  if (fontFamilies === 0) score = 0;
  else if (fontFamilies <= 2) score = 100;
  else score = Math.max(40, 100 - (fontFamilies - 2) * 15);
  return {
    key: 'rhythm',
    label: 'Rhythm',
    score: clamp(roundTo(score, 0)),
    detail:
      fontFamilies === 0
        ? 'No font families detected.'
        : `${fontFamilies} font famil${fontFamilies === 1 ? 'y' : 'ies'}` +
          (fontFamilies > 2 ? ' — type voice is fragmented.' : '.'),
  };
}

// Spacing cadence: healthy spacing sits on a consistent step (e.g. multiples
// of 4 or 8 px). We measure how many distinct spacing values align to a common
// base unit. Values in rem/em are treated as already-systematic.
function scoreCadence(spacing: string[]): SignatureStrand {
  if (spacing.length === 0) {
    return { key: 'cadence', label: 'Cadence', score: 0, detail: 'No spacing values detected.' };
  }
  const pxValues = spacing
    .map(parsePx)
    .filter((v): v is number => v !== null && v > 0);
  const nonPx = spacing.length - pxValues.length;

  if (pxValues.length === 0) {
    // All rem/em/other — assume a systematic scale.
    return {
      key: 'cadence',
      label: 'Cadence',
      score: 90,
      detail: `${spacing.length} spacing values on a relative scale.`,
    };
  }

  const base = dominantBaseUnit(pxValues);
  const onScale = pxValues.filter((v) => v % base === 0).length;
  const ratio = onScale / pxValues.length;
  const score = clamp(roundTo(40 + ratio * 60, 0));
  return {
    key: 'cadence',
    label: 'Cadence',
    score,
    detail:
      `${onScale}/${pxValues.length} spacing values align to a ${base}px step` +
      (nonPx > 0 ? ` (+${nonPx} relative).` : '.'),
  };
}

// Structural density: how much design vocabulary the artifact uses. A real
// design uses several token kinds; an empty or near-empty artifact uses almost
// none. This is a coverage signal, not a quality one, so it saturates quickly.
function scoreDensity(counts: {
  colors: number;
  fonts: number;
  spacing: number;
  radius: number;
  shadow: number;
}): SignatureStrand {
  const kinds = [counts.colors, counts.fonts, counts.spacing, counts.radius, counts.shadow];
  const kindsPresent = kinds.filter((c) => c > 0).length;
  const total = kinds.reduce((a, b) => a + b, 0);
  // Reward breadth (distinct kinds) over raw volume.
  const score = clamp(roundTo(kindsPresent * 18 + Math.min(total, 10), 0));
  return {
    key: 'density',
    label: 'Density',
    score,
    detail: `${kindsPresent}/5 token kinds present (${total} tokens total).`,
  };
}

// ---------------------------------------------------------------------------
// Normalization helpers — deterministic, dependency-free.
// ---------------------------------------------------------------------------

/** Lowercase + expand shorthand hex so `#FFF` and `#ffffff` dedupe together. */
export function normalizeColor(value: string): string | null {
  const v = String(value ?? '').trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(v);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    else if (h.length === 4) h = h.split('').map((c) => c + c).join('');
    return '#' + h;
  }
  // rgb()/hsl() — collapse internal whitespace so equivalent strings dedupe.
  if (/^(rgb|hsl)a?\(/.test(v)) return v.replace(/\s+/g, '');
  return null;
}

function uniqueNormalizedColors(values: string[]): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const norm = normalizeColor(value);
    if (norm) set.add(norm);
  }
  return [...set].sort();
}

function uniqueFontFamilies(values: string[]): string[] {
  const set = new Set<string>();
  for (const value of values) {
    // A font-family token is a comma list; the first family is the identity.
    const primary = String(value ?? '')
      .split(',')[0]
      ?.replace(/['"]/g, '')
      .trim()
      .toLowerCase();
    if (primary) set.add(primary);
  }
  return [...set].sort();
}

function uniqueLengths(values: string[]): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const v = String(value ?? '').trim().toLowerCase();
    if (v) set.add(v);
  }
  return [...set].sort();
}

function parsePx(value: string): number | null {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(String(value ?? '').trim().toLowerCase());
  return m ? Number(m[1]) : null;
}

// Pick the spacing base unit. Prefer 8 then 4 (the common design steps) when
// most values divide evenly; otherwise fall back to the smallest value.
function dominantBaseUnit(pxValues: number[]): number {
  for (const base of [8, 4]) {
    const aligned = pxValues.filter((v) => v % base === 0).length;
    if (aligned / pxValues.length >= 0.6) return base;
  }
  return Math.max(1, Math.min(...pxValues));
}

// A short, stable hash of the structural inputs. Equal designs (same tokens)
// produce the same fingerprint; a single token change flips it. Deterministic
// FNV-1a over the sorted, normalized token set — no crypto dependency needed.
function fingerprintOf(
  colors: string[],
  spacing: string[],
  radius: string[],
  fontFamilies: string[],
): string {
  const basis = [
    'c:' + colors.join(','),
    's:' + spacing.join(','),
    'r:' + radius.join(','),
    'f:' + fontFamilies.join(','),
  ].join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// Terminal rendering. Kept here (pure, string-in/string-out) so the CLI
// handler stays a thin wrapper and the formatting is unit-testable.
// ---------------------------------------------------------------------------

/** Render a signature as a compact, human-readable block for `od signature`. */
export function renderSignatureForTerminal(sig: DesignSignature): string {
  const lines: string[] = [];
  lines.push(`Design Signature  ·  vitality ${sig.vitality}/100  ·  ${sig.fingerprint}`);
  lines.push('');
  for (const s of sig.strands) {
    lines.push(`  ${s.label.padEnd(8)} ${bar(s.score)} ${String(s.score).padStart(3)}  ${s.detail}`);
  }
  return lines.join('\n');
}

// A 10-cell unicode meter. Deterministic, no color codes (keeps output stable
// for tests and pipes); the web panel renders the same scores graphically.
function bar(score: number): string {
  const filled = Math.round(clamp(score) / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

// ---------------------------------------------------------------------------
// Diff — what changed between two signatures (the previous version vs. now).
// Pure and deterministic: it compares the token sets and strand scores and
// translates them into plain-language change lines a designer can read at a
// glance ("Heading scale increased", "Button radius increased").
// ---------------------------------------------------------------------------

export type ChangeDirection = 'increased' | 'decreased' | 'changed';

export interface SignatureChange {
  /** Which strand/category this change belongs to. */
  area: SignatureStrandKey | 'shadow';
  /** Plain-language summary, e.g. "Heading scale increased". */
  summary: string;
  /** Directional hint for UI affordances (arrow/color). */
  direction: ChangeDirection;
}

export interface DesignSignatureDiff {
  /** True when the two signatures are identical (same fingerprint). */
  unchanged: boolean;
  /** Net vitality delta (next - prev), e.g. -8. */
  vitalityDelta: number;
  /** Ordered, human-readable changes. Empty when unchanged. */
  changes: SignatureChange[];
}

/**
 * Diff two signatures (previous → next) into a list of plain-language changes.
 * Token-set deltas name the category and what moved; strand-score deltas pick
 * the direction word. Deterministic; order is stable (palette, rhythm, cadence,
 * radius, contrast/density).
 */
export function diffDesignSignatures(
  prev: DesignSignature,
  next: DesignSignature,
): DesignSignatureDiff {
  if (prev.fingerprint === next.fingerprint) {
    return { unchanged: true, vitalityDelta: 0, changes: [] };
  }

  const changes: SignatureChange[] = [];

  // Palette: which colors were added/removed.
  const color = setDelta(prev.tokens.colors, next.tokens.colors);
  if (color.added.length || color.removed.length) {
    changes.push({
      area: 'palette',
      direction: 'changed',
      summary: describeSetChange('color', 'colors', color),
    });
  }

  // Rhythm: type voice (font families). Score up = tighter (fewer families).
  if (!sameSet(prev.tokens.fontFamilies, next.tokens.fontFamilies)) {
    const d = directionFromScore('rhythm', prev, next);
    changes.push({
      area: 'rhythm',
      direction: d === 'changed' ? 'changed' : d,
      summary:
        d === 'increased'
          ? 'Type scale tightened'
          : d === 'decreased'
            ? 'Type voice fragmented'
            : 'Typography changed',
    });
  }

  // Cadence: spacing scale. Score up = more on-grid.
  if (!sameSet(prev.tokens.spacing, next.tokens.spacing)) {
    const d = directionFromScore('cadence', prev, next);
    changes.push({
      area: 'cadence',
      direction: d === 'changed' ? 'changed' : d,
      summary:
        d === 'increased'
          ? 'Spacing rhythm tightened'
          : d === 'decreased'
            ? 'Spacing rhythm loosened'
            : 'Spacing changed',
    });
  }

  // Radius: corner rounding. Report direction from the numeric values when
  // both sides are px-comparable, else just "changed".
  if (!sameSet(prev.tokens.radius, next.tokens.radius)) {
    changes.push({
      area: 'density',
      direction: radiusDirection(prev.tokens.radius, next.tokens.radius),
      summary: radiusSummary(prev.tokens.radius, next.tokens.radius),
    });
  }

  // Density / overall vitality movement, only when nothing more specific fired
  // but the fingerprint still differs (e.g. shadows changed).
  if (changes.length === 0) {
    changes.push({
      area: 'density',
      direction: 'changed',
      summary: 'Design tokens changed',
    });
  }

  return {
    unchanged: false,
    vitalityDelta: roundTo(next.vitality - prev.vitality, 0),
    changes,
  };
}

/** Render a diff for `od signature --against`. */
export function renderDiffForTerminal(
  next: DesignSignature,
  diff: DesignSignatureDiff,
): string {
  const lines: string[] = [];
  lines.push(`Signature: ${next.fingerprint}`);
  lines.push('');
  if (diff.unchanged) {
    lines.push('No design changes since the previous version.');
    return lines.join('\n');
  }
  lines.push('Changes since last version:');
  for (const c of diff.changes) {
    lines.push(`  ${arrow(c.direction)} ${c.summary}`);
  }
  const sign = diff.vitalityDelta > 0 ? '+' : '';
  lines.push('');
  lines.push(`Vitality ${sign}${diff.vitalityDelta} (now ${next.vitality}/100).`);
  return lines.join('\n');
}

function arrow(d: ChangeDirection): string {
  return d === 'increased' ? '↑' : d === 'decreased' ? '↓' : '•';
}

// --- diff helpers ----------------------------------------------------------

function setDelta(prev: string[], next: string[]): { added: string[]; removed: string[] } {
  const a = new Set(prev);
  const b = new Set(next);
  return {
    added: next.filter((x) => !a.has(x)),
    removed: prev.filter((x) => !b.has(x)),
  };
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

function describeSetChange(
  singular: string,
  plural: string,
  delta: { added: string[]; removed: string[] },
): string {
  const { added, removed } = delta;
  // A 1-for-1 swap reads as a replacement ("Accent color changed" territory).
  if (added.length === 1 && removed.length === 1) {
    return `Color changed (${removed[0]} → ${added[0]})`;
  }
  const parts: string[] = [];
  if (added.length) parts.push(`+${added.length}`);
  if (removed.length) parts.push(`-${removed.length}`);
  const word = added.length + removed.length === 1 ? singular : plural;
  return `Palette ${word} changed (${parts.join(' ')})`;
}

function directionFromScore(
  key: SignatureStrandKey,
  prev: DesignSignature,
  next: DesignSignature,
): ChangeDirection {
  const p = prev.strands.find((s) => s.key === key)?.score ?? 0;
  const n = next.strands.find((s) => s.key === key)?.score ?? 0;
  if (n > p) return 'increased';
  if (n < p) return 'decreased';
  return 'changed';
}

// Compare the largest px radius on each side to give a real up/down read; if
// neither side is px-comparable, fall back to "changed".
function radiusDirection(prev: string[], next: string[]): ChangeDirection {
  const p = maxPx(prev);
  const n = maxPx(next);
  if (p === null || n === null) return 'changed';
  if (n > p) return 'increased';
  if (n < p) return 'decreased';
  return 'changed';
}

function radiusSummary(prev: string[], next: string[]): string {
  const d = radiusDirection(prev, next);
  if (d === 'increased') return 'Corner radius increased';
  if (d === 'decreased') return 'Corner radius decreased';
  return 'Corner radius changed';
}

function maxPx(values: string[]): number | null {
  // The token extractor captures to end of line, so values can carry trailing
  // junk (e.g. "8px}"). Match the first <number>px anywhere in the string
  // rather than requiring a clean full-string match.
  const pxs = values
    .map((v) => {
      const m = /(\d+(?:\.\d+)?)px/.exec(v);
      return m ? Number(m[1]) : null;
    })
    .filter((v): v is number => v !== null);
  return pxs.length ? Math.max(...pxs) : null;
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function roundTo(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
