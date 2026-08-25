// Pricing keeps a static marketing snapshot of the model sets it advertises.
// The workbench no longer duplicates those sets: it reads Vela's authenticated
// Coding Plan model endpoint at runtime. This test therefore validates the
// Pricing snapshot internally without turning it back into a runtime source of
// truth.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const PRICING_PAGE = `${repoRoot}apps/landing-page/app/_components/pricing-individual-plans.astro`;

/** Pricing display name → the AMR model id the workbench receives. */
const MODEL_ID_BY_DISPLAY_NAME: Record<string, string> = {
  'DeepSeek V4 Flash Vision Exp': 'deepseek-v4-flash-vision-exp',
  'DeepSeek V4 Flash': 'deepseek-v4-flash',
  'DeepSeek V4 Pro': 'deepseek-v4-pro',
  'GLM-5.2': 'glm-5.2',
  'GLM-5.1': 'glm-5.1',
  'Kimi K2.7 Code': 'kimi-k2.7-code',
  'Kimi K2.6': 'kimi-k2.6',
  'MiMo V2.5 Pro': 'mimo-v2.5-pro',
  'MiniMax M2.7': 'minimax-m2.7',
};

const TIERS = ['go', 'plus', 'pro', 'max'] as const;
type Tier = (typeof TIERS)[number];

/** Prose in a comment ("Pro's fifth slot…") carries apostrophes that the
 *  quote-scanning below would read as model names, so comments come out first. */
function stripLineComments(source: string): string {
  // The whole LINE goes, newline included: leaving a blank line behind would
  // break the "next entry starts here" lookahead the tier scanner relies on.
  return source.replace(/^[ \t]*\/\/.*\n?/gm, '');
}

/** First capture group, or a failure naming what could not be found. */
function captureOne(source: string, pattern: RegExp, what: string): string {
  const captured = source.match(pattern)?.[1];
  if (captured === undefined) throw new Error(`${what} not found — did it get renamed?`);
  return captured;
}

/** Every first capture group across all matches. */
function captureAll(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

/** The `tier: …` entry inside an object literal body, up to the next entry. */
function tierEntry(body: string, tier: Tier, what: string): string {
  return captureOne(
    body,
    new RegExp(`\\n  ${tier}: ([\\s\\S]*?),(?=\\n  [a-z]+:|$)`),
    `tier ${tier} in ${what}`,
  );
}

/** Every `{ name: '…' }` entry in the page's `popularModels` list, in order. */
async function pricingPopularModelNames(): Promise<string[]> {
  const source = stripLineComments(await readFile(PRICING_PAGE, 'utf8'));
  const block = captureOne(
    source,
    /const popularModels: ModelItem\[\] = \[([\s\S]*?)\n\];/,
    'popularModels on the Pricing page',
  );
  return captureAll(block, /name: '([^']+)'/g);
}

/** The page's per-tier unlimited sets, resolved to AMR model ids. */
async function pricingUnlimitedIdsByTier(): Promise<Record<Tier, string[]>> {
  const source = stripLineComments(await readFile(PRICING_PAGE, 'utf8'));
  const body = captureOne(
    source,
    /const unlimitedByTier: Record<TierId, Set<string>> = \{([\s\S]*?)\n\};/,
    'unlimitedByTier on the Pricing page',
  );
  const popular = await pricingPopularModelNames();

  const out = {} as Record<Tier, string[]>;
  for (const tier of TIERS) {
    const raw = tierEntry(body, tier, 'unlimitedByTier');
    // `max` is written as "every popular model" rather than a literal list.
    const names = raw.includes('popularModels.map') ? popular : captureAll(raw, /'([^']+)'/g);
    out[tier] = names.map((name) => {
      const id = MODEL_ID_BY_DISPLAY_NAME[name];
      expect(id, `no AMR model id mapped for the Pricing name "${name}"`).toBeTruthy();
      return id ?? name;
    });
  }
  return out;
}

describe('Pricing unlimited-model snapshot', () => {
  it('keeps the advertised model counts (4 / 5 / 6 / 9)', async () => {
    const pricing = await pricingUnlimitedIdsByTier();
    expect(pricing.go).toHaveLength(4);
    expect(pricing.plus).toHaveLength(5);
    expect(pricing.pro).toHaveLength(6);
    expect(pricing.max).toHaveLength(9);
  });

  it('puts DeepSeek V4 Flash Vision Exp first in the popular-model list', async () => {
    expect((await pricingPopularModelNames())[0]).toBe('DeepSeek V4 Flash Vision Exp');
  });

  it('maps every popular model the Pricing page lists to an AMR model id', async () => {
    for (const name of await pricingPopularModelNames()) {
      expect(MODEL_ID_BY_DISPLAY_NAME[name], `unmapped Pricing model "${name}"`).toBeTruthy();
    }
  });
});
