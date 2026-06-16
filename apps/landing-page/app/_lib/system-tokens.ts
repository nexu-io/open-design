// Design-token data layer for design-system detail pages.
//
// Every bundled design system ships a `design-tokens.json` next to its
// DESIGN.md — the structured instantiation of the canonical TOKEN_SCHEMA
// contract (packages/contracts/src/design-systems/token-schema.ts). Each
// token is `{ name, value, type, layer, … }`; the file also carries a
// `summary` with the contract coverage score.
//
// The detail page used to ignore this file and only regex-extract bare hex
// values out of the DESIGN.md prose. This loader reads the real structured
// data at build time (same dual-cwd fs story as catalog.ts previews) and
// groups it into the canonical visual stack — surface → text → border →
// accent → semantic → typography → spacing → radius → elevation → focus →
// motion → layout — so the page can render a proper token spec sheet.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Token value kinds emitted by the token builder. */
export type SystemTokenType =
  | 'color'
  | 'dimension'
  | 'shadow'
  | 'fontFamily'
  | 'number'
  | 'duration'
  | 'cubicBezier';

export interface SystemToken {
  /** CSS custom property name, including the `--` prefix. */
  name: string;
  value: string;
  type: SystemTokenType;
  /** Contract layer (A1-identity / A1-structure / A2 / B-slot). */
  layer: string;
}

/** Canonical group ids, in the TOKEN_SCHEMA visual-stack order. */
export const TOKEN_GROUP_IDS = [
  'surface',
  'text',
  'border',
  'accent',
  'semantic',
  'fonts',
  'type',
  'spacing',
  'radius',
  'elevation',
  'focus',
  'motion',
  'layout',
  'other',
] as const;
export type TokenGroupId = (typeof TOKEN_GROUP_IDS)[number];

export interface SystemTokenGroup {
  id: TokenGroupId;
  tokens: ReadonlyArray<SystemToken>;
}

export interface SystemTokens {
  /** Total declared tokens (== summary.totalTokens when present). */
  total: number;
  /** Contract grade from the summary block, e.g. "excellent" — data, not copy. */
  grade: string | null;
  groups: ReadonlyArray<SystemTokenGroup>;
}

const DESIGN_SYSTEMS_ROOT_CANDIDATES = [
  // Same dual-cwd story as catalog.ts: workspace root vs. package root.
  path.resolve(process.cwd(), 'design-systems'),
  path.resolve(process.cwd(), '../../design-systems'),
  path.resolve(fileURLToPath(new URL('../../../../design-systems', import.meta.url))),
] as const;

function designSystemsRoot(): string | null {
  return DESIGN_SYSTEMS_ROOT_CANDIDATES.find((dir) => existsSync(dir)) ?? null;
}

/**
 * Classify a token into its canonical group by name. Order matters: the
 * first matching rule wins, so more specific prefixes are listed first.
 */
function groupOf(name: string): TokenGroupId {
  const n = name;
  if (n.startsWith('--bg') || n.startsWith('--surface')) return 'surface';
  if (n.startsWith('--fg') || n.startsWith('--muted') || n.startsWith('--meta')) return 'text';
  if (n.startsWith('--border')) return 'border';
  if (n.startsWith('--accent')) return 'accent';
  if (n.startsWith('--success') || n.startsWith('--warn') || n.startsWith('--danger'))
    return 'semantic';
  if (n.startsWith('--font-')) return 'fonts';
  if (n.startsWith('--text-') || n.startsWith('--leading-') || n.startsWith('--tracking-'))
    return 'type';
  if (n.startsWith('--space-') || n.startsWith('--section-y')) return 'spacing';
  if (n.startsWith('--radius')) return 'radius';
  if (n.startsWith('--elev')) return 'elevation';
  if (n.startsWith('--focus')) return 'focus';
  if (n.startsWith('--motion') || n.startsWith('--ease')) return 'motion';
  if (n.startsWith('--container')) return 'layout';
  return 'other';
}

const VALID_TYPES: ReadonlySet<string> = new Set([
  'color',
  'dimension',
  'shadow',
  'fontFamily',
  'number',
  'duration',
  'cubicBezier',
]);

/**
 * Read and group a design system's `design-tokens.json`. Returns null when
 * the file is missing or malformed — the detail page simply omits the panel
 * rather than failing the build (not every future system is guaranteed to
 * ship structured tokens).
 */
export function getSystemTokens(slug: string): SystemTokens | null {
  const root = designSystemsRoot();
  if (!root) return null;
  const file = path.join(root, slug, 'design-tokens.json');
  if (!existsSync(file)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const data = parsed as {
    tokens?: unknown;
    summary?: { totalTokens?: unknown; grade?: unknown };
  };
  if (!Array.isArray(data.tokens)) return null;

  const buckets = new Map<TokenGroupId, SystemToken[]>();
  for (const raw of data.tokens) {
    if (!raw || typeof raw !== 'object') continue;
    const t = raw as Record<string, unknown>;
    const name = t.name;
    const value = t.value;
    const type = t.type;
    if (typeof name !== 'string' || typeof value !== 'string') continue;
    if (typeof type !== 'string' || !VALID_TYPES.has(type)) continue;
    const token: SystemToken = {
      name,
      value,
      type: type as SystemTokenType,
      layer: typeof t.layer === 'string' ? t.layer : '',
    };
    const gid = groupOf(name);
    const list = buckets.get(gid);
    if (list) list.push(token);
    else buckets.set(gid, [token]);
  }

  if (buckets.size === 0) return null;

  // Emit groups in the canonical visual-stack order, skipping empties.
  const groups: SystemTokenGroup[] = [];
  for (const id of TOKEN_GROUP_IDS) {
    const tokens = buckets.get(id);
    if (tokens && tokens.length > 0) groups.push({ id, tokens });
  }

  const total =
    typeof data.summary?.totalTokens === 'number'
      ? data.summary.totalTokens
      : groups.reduce((sum, g) => sum + g.tokens.length, 0);
  const grade = typeof data.summary?.grade === 'string' ? data.summary.grade : null;

  return { total, grade, groups };
}
