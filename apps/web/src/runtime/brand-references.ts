// Curated, desensitized reference brands for the "pick a brand to extract
// from" experience. Only public facts ship here: brand display name, the
// website domain extraction targets, and an industry category. Visuals come
// from the public favicon service keyed on the domain, so this module carries
// no dependency on any private ad-library storage.

import data from './brand-references.json';

export interface BrandReference {
  /** Brand display name, e.g. 'Webflow'. */
  name: string;
  /** Website extraction targets, e.g. 'webflow.com'. */
  domain: string;
  /** Industry bucket used by the category filter. */
  category: string;
}

export const BRAND_CATEGORIES: string[] = data.categories;

// Household names lead the wall; the default tier sits in the middle; smaller
// DTC / niche brands close it. Mirrors the reference demo's fame ordering so
// the most recognizable logos greet the user first.
const TIER_1 = new Set([
  'Apple',
  'Nike',
  'Spotify',
  'Samsung',
  'Airbnb',
  'Stripe',
  'Slack',
  'Shopify',
  'Canva',
  'Porsche',
  'Ford',
  'Honda',
  'Range Rover',
  'H&M',
  'Lululemon',
  'New Balance',
  'Nespresso',
  'Hulu',
  'Vogue',
  'The Economist',
  'Philips',
  'MasterClass',
]);

const TIER_3 = new Set([
  'Sweaty Betty',
  'Tracksmith',
  'Outdoor Voices',
  'Sézane',
  'Summer Fridays',
  'Milk Makeup',
  'Graza',
  'Catalina Crunch',
  'Just Salad',
  'Cava',
  'Cadence',
  'Athletic Brewing',
  'Talkiatry',
  'Architectural Digest',
  'Wealthsimple',
]);

const fameTier = (name: string): number => (TIER_1.has(name) ? 1 : TIER_3.has(name) ? 3 : 2);

// Stable sort: famous brands first, curated source order preserved within a
// tier. `data.brands` is the desensitized list (name/domain/category only).
export const BRAND_REFERENCES: BrandReference[] = [...data.brands].sort(
  (a, b) => fameTier(a.name) - fameTier(b.name),
);

// Brands pinned to the front of the quick-pick row, in this order, ahead of
// the fame-tier ordering — same tasteful curation as the reference demo.
const PINNED_QUICK_PICKS = ['The Economist'];

const QUICK_PICK_COUNT = 8;

// A short, best-looking row of brands surfaced above the full gallery. Pins
// the curated leaders first, then fills from the fame-ordered wall, de-duped.
export const QUICK_PICK_BRANDS: BrandReference[] = (() => {
  const seen = new Set<string>();
  const picks: BrandReference[] = [];
  const add = (brand: BrandReference | undefined) => {
    if (!brand || seen.has(brand.name)) return;
    seen.add(brand.name);
    picks.push(brand);
  };
  for (const name of PINNED_QUICK_PICKS) {
    add(BRAND_REFERENCES.find((b) => b.name === name));
  }
  for (const brand of BRAND_REFERENCES) {
    if (picks.length >= QUICK_PICK_COUNT) break;
    add(brand);
  }
  return picks;
})();

// Public favicon for a brand domain, sized for crisp rendering on retina tiles.
export function brandFaviconUrl(domain: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}
