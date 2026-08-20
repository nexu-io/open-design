// The 「无限使用」 promise has to say the same thing in two places that cannot
// import each other: the public Pricing page (`apps/landing-page`, display
// names + its own art) and the workbench model switcher (`apps/web`, AMR model
// ids). They drifted once already — Pricing listed MiniMax M2.7 as unlimited on
// Pro and GLM-5.2 as metered, which is the reverse of what Pro actually
// includes — so this guard pins the two tables together across the app
// boundary. Editing one side alone fails here.
//
// The name ↔ id map below is the only translation layer; adding a popular model
// means adding it here too.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const PRICING_PAGE = `${repoRoot}apps/landing-page/app/_components/pricing-individual-plans.astro`;
const RUNTIME_TABLE = `${repoRoot}apps/web/src/state/plan-unlimited-models.ts`;

/** Pricing display name → the AMR model id the workbench receives. */
const MODEL_ID_BY_DISPLAY_NAME: Record<string, string> = {
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

/** Every `{ name: '…' }` entry in the page's `popularModels` list, in order. */
async function pricingPopularModelNames(): Promise<string[]> {
  const source = stripLineComments(await readFile(PRICING_PAGE, 'utf8'));
  const block = source.match(/const popularModels: ModelItem\[\] = \[([\s\S]*?)\n\];/);
  expect(block, 'popularModels list not found on the Pricing page').toBeTruthy();
  return [...block![1].matchAll(/name: '([^']+)'/g)].map((match) => match[1]);
}

/** The page's per-tier unlimited sets, resolved to AMR model ids. */
async function pricingUnlimitedIdsByTier(): Promise<Record<Tier, string[]>> {
  const source = stripLineComments(await readFile(PRICING_PAGE, 'utf8'));
  const block = source.match(
    /const unlimitedByTier: Record<TierId, Set<string>> = \{([\s\S]*?)\n\};/,
  );
  expect(block, 'unlimitedByTier not found on the Pricing page').toBeTruthy();
  const body = block![1];
  const popular = await pricingPopularModelNames();

  const out = {} as Record<Tier, string[]>;
  for (const tier of TIERS) {
    const entry = body.match(new RegExp(`\\n  ${tier}: ([\\s\\S]*?),(?=\\n  [a-z]+:|$)`));
    expect(entry, `tier ${tier} missing from unlimitedByTier`).toBeTruthy();
    const raw = entry![1];
    // `max` is written as "every popular model" rather than a literal list.
    const names = raw.includes('popularModels.map')
      ? popular
      : [...raw.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    out[tier] = names.map((name) => {
      const id = MODEL_ID_BY_DISPLAY_NAME[name];
      expect(id, `no AMR model id mapped for the Pricing name "${name}"`).toBeTruthy();
      return id;
    });
  }
  return out;
}

/** The workbench's own table, read as source so this guard stays dependency-free. */
async function runtimeUnlimitedIdsByTier(): Promise<Record<Tier, string[]>> {
  const source = stripLineComments(await readFile(RUNTIME_TABLE, 'utf8'));
  const popular = [
    ...(source
      .match(/export const POPULAR_MODEL_IDS = \[([\s\S]*?)\] as const;/)?.[1] ?? '')
      .matchAll(/'([^']+)'/g),
  ].map((match) => match[1]);
  const block = source.match(
    /export const PLAN_UNLIMITED_MODEL_IDS[^=]*= \{([\s\S]*?)\n\};/,
  );
  expect(block, 'PLAN_UNLIMITED_MODEL_IDS not found in the runtime table').toBeTruthy();
  const body = block![1];

  const out = {} as Record<Tier, string[]>;
  for (const tier of TIERS) {
    const entry = body.match(new RegExp(`\\n  ${tier}: ([\\s\\S]*?),(?=\\n  [a-z]+:|$)`));
    expect(entry, `tier ${tier} missing from PLAN_UNLIMITED_MODEL_IDS`).toBeTruthy();
    const raw = entry![1];
    out[tier] = raw.includes('POPULAR_MODEL_IDS')
      ? popular
      : [...raw.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  }
  return out;
}

describe('unlimited-model sets stay identical across Pricing and the workbench', () => {
  it.each(TIERS)('matches on %s', async (tier) => {
    const pricing = await pricingUnlimitedIdsByTier();
    const runtime = await runtimeUnlimitedIdsByTier();
    expect([...runtime[tier]].sort()).toEqual([...pricing[tier]].sort());
  });

  it('keeps the advertised model counts (3 / 4 / 5 / 8)', async () => {
    const pricing = await pricingUnlimitedIdsByTier();
    expect(pricing.go).toHaveLength(3);
    expect(pricing.plus).toHaveLength(4);
    expect(pricing.pro).toHaveLength(5);
    expect(pricing.max).toHaveLength(8);
  });

  it('maps every popular model the Pricing page lists to an AMR model id', async () => {
    for (const name of await pricingPopularModelNames()) {
      expect(MODEL_ID_BY_DISPLAY_NAME[name], `unmapped Pricing model "${name}"`).toBeTruthy();
    }
  });
});
