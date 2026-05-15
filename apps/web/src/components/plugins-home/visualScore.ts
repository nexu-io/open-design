// Visual-appeal score for plugin home gallery ordering.
//
// The home grid wants the most striking, browsable plugins in the
// first viewport so users immediately see "wow, this thing has
// real content". Without this score the grid was sorted by raw
// daemon order (alphabetical inside each source bucket), which
// surfaced sleepy text-only scenarios above cinematic decks.
//
// The score is a deterministic linear sum of signals already
// present on the manifest:
//
//   featured flag/rank                     → +1000+ (curator pick wins)
//   has video preview                      →  +700  (motion is rare; lead with it)
//   has image poster                       →  +500
//   has both video + poster                →  +200  (extra polish bonus)
//   surface === image  (image template)    →  +400
//   surface === video  (video template)    →  +400
//   has exampleOutputs[]   (rich html)     →  +320
//   mode === deck                          →  +280
//   mode === design-system                 →  +260
//   mode === prototype-desktop / mobile    →  +180
//   has od.preview.entry                   →   +90
//   ships rich tags (>= 3 non-noise)       →   +30
//   author name set                        →   +20
//   well-curated description (>= 60 chars) →   +15
//   penalty: kind === atom                 →  -200  (atoms never reach the
//                                                    grid, but defensive)
//   penalty: kind === bundle               →   -50  (less interesting hero)
//
// We deliberately avoid scoring trust tier — community plugins
// should be able to bubble up if their preview is great. Trust is
// surfaced as a chip in the card chrome instead.

import type { InstalledPluginRecord } from '@open-design/contracts';

interface PreviewBlock {
  type?: unknown;
  poster?: unknown;
  video?: unknown;
  gif?: unknown;
  entry?: unknown;
}

const NOISE_TAGS = new Set<string>([
  'first-party',
  'third-party',
  'phase-1',
  'phase-7',
  'untitled',
  'plugin',
]);

function readPreview(record: InstalledPluginRecord): PreviewBlock | null {
  const od = record.manifest?.od as { preview?: unknown } | undefined;
  if (!od || typeof od.preview !== 'object' || od.preview === null) return null;
  return od.preview as PreviewBlock;
}

function exampleOutputCount(record: InstalledPluginRecord): number {
  const od = record.manifest?.od as
    | { useCase?: { exampleOutputs?: unknown } }
    | undefined;
  const list = od?.useCase?.exampleOutputs;
  return Array.isArray(list) ? list.length : 0;
}

function modeOf(record: InstalledPluginRecord): string {
  const od = record.manifest?.od as { mode?: unknown } | undefined;
  return typeof od?.mode === 'string' ? od.mode.toLowerCase() : '';
}

function surfaceOf(record: InstalledPluginRecord): string {
  const od = record.manifest?.od as { surface?: unknown } | undefined;
  return typeof od?.surface === 'string' ? od.surface.toLowerCase() : '';
}

function kindOf(record: InstalledPluginRecord): string {
  const od = record.manifest?.od as { kind?: unknown } | undefined;
  return typeof od?.kind === 'string' ? od.kind.toLowerCase() : '';
}

function featuredRank(record: InstalledPluginRecord): number | null {
  const od = (record.manifest?.od ?? {}) as Record<string, unknown>;
  if (od.featured === true) return 0;
  if (typeof od.featured !== 'number' || !Number.isFinite(od.featured)) return null;
  return Math.max(0, od.featured);
}

function richTagCount(record: InstalledPluginRecord): number {
  const tags = record.manifest?.tags ?? [];
  return tags.filter((t) => {
    const slug = String(t).toLowerCase();
    return slug && !NOISE_TAGS.has(slug);
  }).length;
}

export function pluginVisualScore(record: InstalledPluginRecord): number {
  let score = 0;

  const rank = featuredRank(record);
  if (rank !== null) score += 1000 + Math.max(0, 100 - rank);

  const preview = readPreview(record);
  const hasPoster =
    preview && (typeof preview.poster === 'string' || typeof preview.gif === 'string');
  const hasVideo = preview && typeof preview.video === 'string';
  if (hasVideo) score += 700;
  if (hasPoster) score += 500;
  if (hasVideo && hasPoster) score += 200;

  const surface = surfaceOf(record);
  if (surface === 'image') score += 400;
  if (surface === 'video') score += 400;

  const examples = exampleOutputCount(record);
  if (examples > 0) score += 320 + Math.min(examples - 1, 4) * 12;

  const mode = modeOf(record);
  if (mode === 'deck') score += 280;
  else if (mode === 'design-system') score += 260;
  else if (mode === 'prototype-desktop' || mode === 'prototype-mobile') {
    score += 180;
  } else if (mode === 'live') score += 220;

  if (preview && typeof preview.entry === 'string') score += 90;

  const tagCount = richTagCount(record);
  if (tagCount >= 3) score += 30;

  const author = record.manifest?.author?.name;
  if (typeof author === 'string' && author.trim().length > 0) score += 20;

  const description = record.manifest?.description ?? '';
  if (description.length >= 60) score += 15;

  const kind = kindOf(record);
  if (kind === 'atom') score -= 200;
  else if (kind === 'bundle') score -= 50;

  return score;
}

// Stable sort: curated featured rank first, then visual score descending,
// then title ascending so tiles at the same score band still order
// deterministically.
export function sortByVisualAppeal<T extends InstalledPluginRecord>(
  records: readonly T[],
): T[] {
  const annotated = records.map((r, idx) => ({
    record: r,
    rank: featuredRank(r),
    score: pluginVisualScore(r),
    idx,
  }));
  annotated.sort((a, b) => {
    const aFeatured = a.rank !== null;
    const bFeatured = b.rank !== null;
    if (aFeatured || bFeatured) {
      if (aFeatured && !bFeatured) return -1;
      if (!aFeatured && bFeatured) return 1;
      if (a.rank !== b.rank) return (a.rank ?? 0) - (b.rank ?? 0);
    }
    if (b.score !== a.score) return b.score - a.score;
    const aTitle = a.record.title || a.record.id;
    const bTitle = b.record.title || b.record.id;
    const cmp = aTitle.localeCompare(bTitle);
    if (cmp !== 0) return cmp;
    return a.idx - b.idx;
  });
  return annotated.map((a) => a.record);
}
