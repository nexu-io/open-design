// Brand → memory reflow.
//
// A finalized brand is the cleanest, highest-signal source of "how this user's
// work should look and sound" that the product has: a measured palette, the
// real type stack, the layout posture, and a documented voice. The two-loop
// memory system already injects exactly this kind of context (see
// `composeMemoryBody` in `../memory.ts`): `user` / `reference` facts seed the
// PRE intent-gateway when a request is vague, and `rule` facts become the
// rubric the POST self-verify pass scores the output against.
//
// So when a brand is finalized we sediment it into memory as a small, coherent
// set of entries:
//   - one `user` entry  — the default visual direction (palette + type + layout)
//   - one `reference`   — the brand voice (tone, pillars, vocabulary, imagery)
//   - several `rule`s   — enforceable checks (palette-only, type stack, layout
//                          posture, logo usage) the self-verify pass can read.
//
// This module is intentionally pure (no fs / network) so it is trivially
// testable; `reflowBrandToMemory` is the thin side-effecting wrapper that
// gates on the master memory switch and writes through `upsertMemoryEntry`.

import type { Brand } from '@open-design/contracts';

import { readMemoryConfig, upsertMemoryEntry } from '../memory.js';

/** A memory entry derived from a brand, ready to hand to `upsertMemoryEntry`. */
export interface BrandMemoryEntryInput {
  id: string;
  name: string;
  description: string;
  type: 'user' | 'reference' | 'rule';
  body: string;
}

/** Lowercase alphanumeric slug for use inside a memory id. Mirrors the cleaning
 *  in `deriveMemoryId` so a brand named "The Economist" → "the_economist". */
function brandSlug(name: string): string {
  const cleaned = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return cleaned || 'brand';
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** "Economist Red #e3120b (accent)" for each measured color. */
function describeColors(brand: Brand): string {
  return brand.colors
    .map((c) => `${c.name || c.role} ${c.hex} (${c.role})`)
    .join(', ');
}

/** "Milo TE (fallbacks: Georgia, Times New Roman, serif)". */
function describeFont(spec: { family?: string; fallbacks?: string[] } | undefined): string {
  if (!spec || !nonEmpty(spec.family)) return '';
  const fallbacks = Array.isArray(spec.fallbacks) ? spec.fallbacks.filter(nonEmpty) : [];
  return fallbacks.length > 0
    ? `${spec.family} (fallbacks: ${fallbacks.join(', ')})`
    : spec.family;
}

/**
 * Derive the coherent set of memory entries for a finalized brand. Pure: takes
 * the validated Brand and returns the entries to upsert. Skips any facet the
 * brand does not carry (e.g. no voice → no voice entry).
 */
export function brandToMemoryEntries(brand: Brand): BrandMemoryEntryInput[] {
  const name = brand.name?.trim() || 'Brand';
  const slug = brandSlug(name);
  const entries: BrandMemoryEntryInput[] = [];

  // ── user: the default visual direction ──────────────────────────────────
  const visualLines: string[] = [`- Brand: ${name}`];
  if (brand.colors.length > 0) visualLines.push(`- Palette: ${describeColors(brand)}`);
  const displayFont = describeFont(brand.typography?.display);
  const bodyFont = describeFont(brand.typography?.body);
  const monoFont = describeFont(brand.typography?.mono);
  if (displayFont) visualLines.push(`- Display type: ${displayFont}`);
  if (bodyFont) visualLines.push(`- Body type: ${bodyFont}`);
  if (monoFont) visualLines.push(`- Mono type: ${monoFont}`);
  const layoutBits: string[] = [];
  if (nonEmpty(brand.layout?.radius)) layoutBits.push(`${brand.layout.radius} corner radius`);
  if (nonEmpty(brand.layout?.borderWeight)) layoutBits.push(`${brand.layout.borderWeight} borders`);
  if (nonEmpty(brand.layout?.spacing)) layoutBits.push(brand.layout.spacing);
  if (layoutBits.length > 0) visualLines.push(`- Layout: ${layoutBits.join('; ')}`);
  visualLines.push(
    `- When to apply: design work for ${name} — use these tokens as the default visual language unless the user asks otherwise.`,
  );
  entries.push({
    id: `user_brand_${slug}_visual`,
    name: `${name} visual direction`,
    description: `Default palette, type and layout for ${name}.`,
    type: 'user',
    body: visualLines.join('\n'),
  });

  // ── reference: the brand voice ──────────────────────────────────────────
  const voice = brand.voice;
  const voiceLines: string[] = [];
  if (voice?.adjectives?.length) voiceLines.push(`- Adjectives: ${voice.adjectives.join(', ')}`);
  if (nonEmpty(voice?.tone)) voiceLines.push(`- Tone: ${voice.tone}`);
  if (voice?.messagingPillars?.length) {
    voiceLines.push(`- Pillars: ${voice.messagingPillars.join('; ')}`);
  }
  if (voice?.vocabulary?.use?.length) {
    voiceLines.push(`- Prefer wording: ${voice.vocabulary.use.join(', ')}`);
  }
  if (voice?.vocabulary?.avoid?.length) {
    voiceLines.push(`- Avoid wording: ${voice.vocabulary.avoid.join(', ')}`);
  }
  const imagery = brand.imagery;
  if (nonEmpty(imagery?.style)) voiceLines.push(`- Imagery style: ${imagery.style}`);
  if (imagery?.avoid?.length) voiceLines.push(`- Imagery to avoid: ${imagery.avoid.join(', ')}`);
  if (voiceLines.length > 0) {
    entries.push({
      id: `reference_brand_${slug}_voice`,
      name: `${name} voice`,
      description: `Tone, vocabulary and imagery for ${name}.`,
      type: 'reference',
      body: voiceLines.join('\n'),
    });
  }

  // ── rule: palette-only (enforceable check) ──────────────────────────────
  if (brand.colors.length > 0) {
    const allowed = brand.colors.map((c) => c.hex).join(', ');
    const accent = brand.colors.find((c) => c.role === 'accent');
    const accentNote = accent
      ? ` The accent ${accent.name || accent.hex} (${accent.hex}) is a high-signal color — use it sparingly, not as a large wash.`
      : '';
    entries.push({
      id: `rule_brand_${slug}_palette`,
      name: `${name} palette only`,
      description: `Only ${name}'s registered palette is used for color.`,
      type: 'rule',
      body:
        `Assertion: Only ${name}'s registered brand palette is used for color.\n` +
        `Check: every CSS color literal is one of {${allowed}}.${accentNote}`,
    });
  }

  // ── rule: typography stack ──────────────────────────────────────────────
  if (displayFont || bodyFont) {
    const parts: string[] = [];
    if (displayFont) parts.push(`headlines/display use ${displayFont}`);
    if (bodyFont) parts.push(`body/UI use ${bodyFont}`);
    entries.push({
      id: `rule_brand_${slug}_type`,
      name: `${name} typography`,
      description: `Type uses ${name}'s font families with correct fallbacks.`,
      type: 'rule',
      body:
        `Assertion: Type uses ${name}'s font stack.\n` +
        `Check: ${parts.join('; ')}. Ship the declared fallback stack when a face is not web-loadable.`,
    });
  }

  // ── rule: layout posture ────────────────────────────────────────────────
  const postureRules = Array.isArray(brand.layout?.postureRules)
    ? brand.layout.postureRules.filter(nonEmpty)
    : [];
  if (postureRules.length > 0 || nonEmpty(brand.layout?.radius)) {
    const checkBits: string[] = [];
    if (nonEmpty(brand.layout?.radius)) checkBits.push(`border-radius is ${brand.layout.radius}`);
    for (const rule of postureRules) checkBits.push(rule);
    entries.push({
      id: `rule_brand_${slug}_layout`,
      name: `${name} layout posture`,
      description: `Layout follows ${name}'s posture.`,
      type: 'rule',
      body:
        `Assertion: Layout follows ${name}'s layout posture.\n` +
        `Check: ${checkBits.join('; ')}.`,
    });
  }

  // ── rule: logo usage ────────────────────────────────────────────────────
  if (nonEmpty(brand.logo?.notes)) {
    entries.push({
      id: `rule_brand_${slug}_logo`,
      name: `${name} logo usage`,
      description: `${name} logo usage follows brand guidance.`,
      type: 'rule',
      body:
        `Assertion: ${name} logo usage follows brand guidance.\n` +
        `Check: ${brand.logo.notes}`,
    });
  }

  return entries;
}

export interface ReflowBrandToMemoryResult {
  /** Entry ids written to the memory store. Empty when memory is disabled. */
  written: string[];
  /** Set when nothing was written, explaining why. */
  skipped?: 'memory-disabled';
}

/**
 * Sediment a finalized brand into the filesystem memory store. Gated on the
 * master memory switch (`enabled`) — when memory is off we write nothing, the
 * same contract every other extraction path honors. Best-effort per entry: a
 * single bad entry does not abort the rest. Re-finalizing the same brand
 * overwrites its entries in place (ids are deterministic from the brand name).
 */
export async function reflowBrandToMemory(
  dataDir: string,
  brand: Brand,
): Promise<ReflowBrandToMemoryResult> {
  const cfg = await readMemoryConfig(dataDir);
  if (!cfg.enabled) return { written: [], skipped: 'memory-disabled' };

  const written: string[] = [];
  for (const entry of brandToMemoryEntries(brand)) {
    try {
      const saved = await upsertMemoryEntry(dataDir, entry, { source: 'brand' });
      written.push(saved.id);
    } catch (err) {
      console.warn(`[memory] brand reflow failed for ${entry.id}`, err);
    }
  }
  return { written };
}
