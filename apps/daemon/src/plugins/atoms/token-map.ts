// Phase 6/7 entry slice / spec §10 / §21.3.1 — token-map atom.
//
// SKILL.md fragment ships at plugins/_official/atoms/token-map/.
// The runner crosswalks an extracted token bag (output of
// `design-extract` for code-migration, or `figma-extract` for
// figma-migration) onto the active OD design system's token
// vocabulary and writes the canonical mapping the SKILL.md fragment
// promises:
//
//   <cwd>/token-map/colors.json
//   <cwd>/token-map/typography.json
//   <cwd>/token-map/spacing.json
//   <cwd>/token-map/radius.json
//   <cwd>/token-map/shadow.json
//   <cwd>/token-map/unmatched.json     — { source, reason }[]
//   <cwd>/token-map/meta.json          — { sourceKind, generatedAt,
//                                           atomDigest, designSystemId? }
//
// Match strategy (deterministic, in this order):
//   1. Exact value match (#abc === #abc).
//   2. Normalised hex (#abc → #aabbcc, ignore case).
//   3. Named source token AND a target with a matching name (e.g.
//      --primary-500 → ds-primary-500). Fuzzy match strips '--' /
//      'ds-' prefixes and lower-cases.
//
// Anything else lands in unmatched[] with one of the reasons:
//   'no-target-equivalent'   — no target with the same value/name.
//   'target-collision'       — multiple sources map to the same target
//                               (kept for the first source; subsequent
//                                are listed unmatched with a hint).
//   'invalid-source'         — source token value is malformed.
//
// The atom is intentionally conservative: it never invents targets,
// never relies on perceptual proximity (the SKILL.md fragment routes
// that to the visual-diff evaluator). False negatives are preferable
// to false positives — `unmatched.json` is the audit list the user
// reviews.

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { createHash } from 'node:crypto';
import type { DesignExtractReport, DesignTokenEntry, DesignTokenKind } from './design-extract.js';

export interface DesignSystemToken {
  // Canonical token name (e.g. 'ds-primary-500', '--ds-color-fg').
  name: string;
  // Token kind. Loose because design systems vary (e.g. some collapse
  // 'spacing' + 'radius' into one scale); we mirror the same five
  // kinds design-extract emits.
  kind: DesignTokenKind;
  value: string;
  // Optional human description — surfaced in unmatched.json hints.
  description?: string;
}

export interface DesignSystemTokenBag {
  // Daemon-side caller fills this from the active design system's
  // DESIGN.md / tokens.json.
  id?: string;
  tokens: DesignSystemToken[];
}

export interface TokenMapMatch {
  source:    string;            // raw input value (or token name when present)
  sourceName?: string;
  target:    string;            // matched target token name
  targetValue: string;
  via:       'exact' | 'normalised-hex' | 'name';
  kind:      DesignTokenKind;
  // The source token's audit trail (file:line entries) so a reviewer
  // can audit "which target was chosen for which call site".
  sources:   string[];
}

export interface TokenMapUnmatched {
  source:      string;
  sourceName?: string;
  kind:        DesignTokenKind;
  reason:      'no-target-equivalent' | 'target-collision' | 'invalid-source';
  hint?:       string;
}

export interface TokenMapReport {
  colors:     TokenMapMatch[];
  typography: TokenMapMatch[];
  spacing:    TokenMapMatch[];
  radius:     TokenMapMatch[];
  shadow:     TokenMapMatch[];
  unmatched:  TokenMapUnmatched[];
  meta: {
    sourceKind:        'figma' | 'code';
    generatedAt:       string;
    atomDigest:        string;
    designSystemId?:   string;
    targetTokenCount:  number;
    sourceTokenCount:  number;
    matchedTokenCount: number;
  };
}

export interface TokenMapOptions {
  cwd: string;
  // Source bag. When omitted, the runner reads <cwd>/code/tokens.json
  // (preferred for code-migration) or falls back to
  // <cwd>/figma/tokens.json (figma-migration).
  source?: { kind: 'figma' | 'code'; report: DesignExtractReport };
  // The active design system's tokens. Caller supplies this; the atom
  // never reads filesystem directly so it stays unit-testable.
  designSystem: DesignSystemTokenBag;
  // Strict mode aborts when ANY source token can't be mapped.
  // Default 'soft' — populates unmatched[] and continues.
  strict?: boolean;
}

const HEX_RE = /^#([0-9a-fA-F]{3,8})$/;

export async function runTokenMap(opts: TokenMapOptions): Promise<TokenMapReport> {
  const cwd = path.resolve(opts.cwd);

  // Resolve source.
  let sourceKind: 'figma' | 'code';
  let source: DesignExtractReport;
  if (opts.source) {
    sourceKind = opts.source.kind;
    source = opts.source.report;
  } else {
    const codePath = path.join(cwd, 'code', 'tokens.json');
    const figmaPath = path.join(cwd, 'figma', 'tokens.json');
    if (await pathExists(codePath)) {
      sourceKind = 'code';
      source = JSON.parse(await fsp.readFile(codePath, 'utf8')) as DesignExtractReport;
    } else if (await pathExists(figmaPath)) {
      sourceKind = 'figma';
      source = JSON.parse(await fsp.readFile(figmaPath, 'utf8')) as DesignExtractReport;
    } else {
      throw new Error(`token-map: missing both code/tokens.json and figma/tokens.json (run design-extract or figma-extract first)`);
    }
  }

  const targets = indexDesignSystem(opts.designSystem.tokens);
  const unmatched: TokenMapUnmatched[] = [];
  const claimed: Map<string, TokenMapMatch> = new Map();
  const buckets = {
    colors:     [] as TokenMapMatch[],
    typography: [] as TokenMapMatch[],
    spacing:    [] as TokenMapMatch[],
    radius:     [] as TokenMapMatch[],
    shadow:     [] as TokenMapMatch[],
  };

  let sourceTokenCount = 0;
  let matchedTokenCount = 0;

  for (const kind of ['colors', 'typography', 'spacing', 'radius', 'shadow'] as const) {
    for (const entry of source[kind]) {
      sourceTokenCount++;
      const result = matchOne(kind, entry, targets);
      if (!result.match) {
        unmatched.push(result.unmatched);
        continue;
      }
      const claimKey = result.match.target;
      if (claimed.has(claimKey)) {
        // Spec §21.3.1 target-collision: the second source claiming
        // the same target lands unmatched with a hint pointing at
        // the first claimant.
        const first = claimed.get(claimKey)!;
        unmatched.push({
          source:     result.match.source,
          ...(result.match.sourceName ? { sourceName: result.match.sourceName } : {}),
          kind:       result.match.kind,
          reason:     'target-collision',
          hint:       `target ${claimKey} already mapped from ${first.source}`,
        });
        continue;
      }
      claimed.set(claimKey, result.match);
      buckets[kind as keyof typeof buckets].push(result.match);
      matchedTokenCount++;
    }
  }

  if (opts.strict && unmatched.length > 0) {
    throw new Error(`token-map (strict): ${unmatched.length} source tokens unmatched`);
  }

  // Stable sort each bucket: by source value first, then by target.
  for (const k of Object.keys(buckets) as (keyof typeof buckets)[]) {
    buckets[k].sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
  }
  unmatched.sort((a, b) => a.kind.localeCompare(b.kind) || a.source.localeCompare(b.source));

  const meta: TokenMapReport['meta'] = {
    sourceKind,
    generatedAt:       new Date().toISOString(),
    atomDigest:        digestObject({ buckets, unmatched }),
    targetTokenCount:  opts.designSystem.tokens.length,
    sourceTokenCount,
    matchedTokenCount,
  };
  if (opts.designSystem.id) meta.designSystemId = opts.designSystem.id;

  const report: TokenMapReport = { ...buckets, unmatched, meta };

  await fsp.mkdir(path.join(cwd, 'token-map'), { recursive: true });
  for (const k of Object.keys(buckets) as (keyof typeof buckets)[]) {
    await fsp.writeFile(
      path.join(cwd, 'token-map', `${k}.json`),
      JSON.stringify(buckets[k], null, 2) + '\n',
      'utf8',
    );
  }
  await fsp.writeFile(path.join(cwd, 'token-map', 'unmatched.json'), JSON.stringify(unmatched, null, 2) + '\n', 'utf8');
  await fsp.writeFile(path.join(cwd, 'token-map', 'meta.json'),      JSON.stringify(meta,      null, 2) + '\n', 'utf8');

  return report;
}

// --- DESIGN.md token extraction (heuristic, used by daemon callers) ---

// Parse a DESIGN.md body for token declarations. Lifts:
//   - CSS custom property declarations (`--ds-color-fg: #111`)
//   - Markdown table rows of shape `| name | value | …`
// The result is best-effort; daemon callers may pass a hand-curated
// token list instead.
export function parseDesignSystemTokens(body: string): DesignSystemToken[] {
  const out: DesignSystemToken[] = [];
  const seen = new Set<string>();

  // CSS custom properties.
  const cssRe = /--([a-z][a-z0-9-]*)\s*:\s*([^;\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = cssRe.exec(body)) !== null) {
    const name = `--${m[1]}`;
    const value = (m[2] ?? '').trim();
    if (!value) continue;
    const key = `${name}=${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, value, kind: classifyKind(name, value) });
  }

  // Markdown table rows. We require at least three pipes per line and
  // a value cell that looks like a hex / px / rem / shadow.
  for (const line of body.split('\n')) {
    if (!/\|/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length < 2) continue;
    const [name, value] = cells;
    if (!name || !value) continue;
    if (/[A-Z]/.test(name) || /\s/.test(name)) continue; // skip header rows / human-prose
    const key = `${name}=${value}`;
    if (seen.has(key)) continue;
    if (!/^[#0-9.a-z(),%\s\-]+$/i.test(value)) continue;
    seen.add(key);
    out.push({ name, value, kind: classifyKind(name, value) });
  }

  return out;
}

function classifyKind(name: string, value: string): DesignTokenKind {
  if (HEX_RE.test(value) || /^rgb|^hsl/.test(value)) return 'color';
  if (/font/i.test(name)) return 'typography';
  if (/(radius|rounded)/i.test(name)) return 'radius';
  if (/(shadow|elevation)/i.test(name)) return 'shadow';
  if (/(space|gap|padding|margin)/i.test(name) || /^(\d+(?:\.\d+)?)(?:px|rem|em)$/.test(value)) return 'spacing';
  return 'color';
}

// --- internals -----------------------------------------------------

interface IndexedDesignSystem {
  byValue: Map<string, DesignSystemToken[]>;     // exact value (case-preserving)
  byNormalisedHex: Map<string, DesignSystemToken[]>; // #aabbcc lowercase
  byFuzzyName: Map<string, DesignSystemToken[]>; // strip prefix + lowercase
}

function indexDesignSystem(tokens: DesignSystemToken[]): IndexedDesignSystem {
  const byValue = new Map<string, DesignSystemToken[]>();
  const byNormalisedHex = new Map<string, DesignSystemToken[]>();
  const byFuzzyName = new Map<string, DesignSystemToken[]>();
  for (const t of tokens) {
    push(byValue, t.value, t);
    const norm = normaliseHex(t.value);
    if (norm) push(byNormalisedHex, norm, t);
    push(byFuzzyName, fuzzyName(t.name), t);
  }
  return { byValue, byNormalisedHex, byFuzzyName };
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) arr.push(value); else map.set(key, [value]);
}

function fuzzyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^-+/, '')
    .replace(/^(?:ds-|odds-|theme-)/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normaliseHex(value: string): string | null {
  const m = HEX_RE.exec(value.trim());
  if (!m) return null;
  let hex = m[1]!.toLowerCase();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length === 4) hex = hex.split('').map((c) => c + c).join('');
  return `#${hex}`;
}

interface MatchOutcome {
  match?: TokenMapMatch;
  unmatched: TokenMapUnmatched;
}

function matchOne(
  kind: keyof Pick<DesignExtractReport, 'colors' | 'typography' | 'spacing' | 'radius' | 'shadow'>,
  entry: DesignTokenEntry,
  index: IndexedDesignSystem,
): MatchOutcome {
  const tokenKind: DesignTokenKind = kindOf(kind);
  const sourceValue = entry.value;
  const sourceName = entry.name;

  // 1. Exact value match.
  const exact = index.byValue.get(sourceValue);
  if (exact && exact.length > 0) {
    const target = pickKindMatch(exact, tokenKind);
    if (target) return wrapMatch(target, sourceValue, sourceName, 'exact', tokenKind, entry.sources);
  }

  // 2. Normalised hex.
  if (tokenKind === 'color') {
    const norm = normaliseHex(sourceValue);
    if (norm) {
      const hits = index.byNormalisedHex.get(norm);
      if (hits && hits.length > 0) {
        const target = pickKindMatch(hits, tokenKind);
        if (target) return wrapMatch(target, sourceValue, sourceName, 'normalised-hex', tokenKind, entry.sources);
      }
    }
  }

  // 3. Fuzzy name match (only when source token has a name).
  if (sourceName) {
    const hits = index.byFuzzyName.get(fuzzyName(sourceName));
    if (hits && hits.length > 0) {
      const target = pickKindMatch(hits, tokenKind);
      if (target) return wrapMatch(target, sourceValue, sourceName, 'name', tokenKind, entry.sources);
    }
  }

  return {
    unmatched: {
      source:    sourceValue,
      ...(sourceName ? { sourceName } : {}),
      kind:      tokenKind,
      reason:    'no-target-equivalent',
    },
  };
}

function kindOf(bucket: keyof Pick<DesignExtractReport, 'colors' | 'typography' | 'spacing' | 'radius' | 'shadow'>): DesignTokenKind {
  switch (bucket) {
    case 'colors':     return 'color';
    case 'typography': return 'typography';
    case 'spacing':    return 'spacing';
    case 'radius':     return 'radius';
    case 'shadow':     return 'shadow';
  }
}

function pickKindMatch(candidates: DesignSystemToken[], kind: DesignTokenKind): DesignSystemToken | undefined {
  const sameKind = candidates.find((c) => c.kind === kind);
  if (sameKind) return sameKind;
  return candidates[0];
}

function wrapMatch(
  target: DesignSystemToken,
  sourceValue: string,
  sourceName: string | undefined,
  via: TokenMapMatch['via'],
  kind: DesignTokenKind,
  sources: string[],
): MatchOutcome {
  const match: TokenMapMatch = {
    source:      sourceValue,
    target:      target.name,
    targetValue: target.value,
    via,
    kind,
    sources:     sources.slice(),
  } as TokenMapMatch;
  if (sourceName) match.sourceName = sourceName;
  return {
    match,
    unmatched: { source: sourceValue, kind, reason: 'no-target-equivalent' },
  };
}

async function pathExists(p: string): Promise<boolean> {
  try { await fsp.access(p); return true; } catch { return false; }
}

function digestObject(obj: unknown): string {
  return createHash('sha1').update(JSON.stringify(obj)).digest('hex');
}
