/**
 * open-design-landing-deck — input schema.
 *
 * Sister skill to `open-design-landing`. Produces a single-file slide
 * deck (horizontal swipe pagination, magazine-style) in the Atelier
 * Zero visual language, reusing the same `styles.css` + the same
 * 16-slot image library.
 *
 * The schema is intentionally smaller than the landing page schema:
 * a deck is an ordered array of typed slides, each driving one
 * viewport-height/width frame. Brand identity is shared across slides.
 */

import type { MixedText, BrandBlock, ImageryConfig } from '../open-design-landing/schema';

export type { MixedText, BrandBlock, ImageryConfig };

/* ---------- slide variants ---------- */

/** Cover slide — title plate at the start of the deck. */
export interface CoverSlide {
  kind: 'cover';
  /** Eyebrow above the title — `'Open Design · Vol. 01'`. */
  eyebrow: string;
  /** Display title; encoded as `MixedText` for italic-serif rhythm. */
  title: MixedText;
  /** Optional sub-title under the title. */
  subtitle?: string;
  /** Lead paragraph below the title. */
  lead: string;
  /** Optional image slot id (`hero` | `cta` | …) from `image-manifest.json`. */
  image_slot?: string;
  /** Bottom-left meta line — date / location / coords. */
  meta?: string;
}

/** Section divider — Roman numeral plate between chapters. */
export interface SectionSlide {
  kind: 'section';
  roman: string;
  /** Section title; rendered huge with italic-serif emphasis. */
  title: MixedText;
  /** Optional one-line description under the title. */
  lead?: string;
}

/** Content slide — eyebrow + title + body (+ optional bullets + image). */
export interface ContentSlide {
  kind: 'content';
  eyebrow?: string;
  title: MixedText;
  /** Body paragraph; can include `<code>` raw HTML. */
  body?: string;
  /** Optional bullet list. */
  bullets?: string[];
  /** Optional image slot id from `image-manifest.json`. */
  image_slot?: string;
  /** Layout: `left` puts copy left of art, `right` flips it, `full` centers. */
  layout?: 'left' | 'right' | 'full';
}

/** Stats slide — eyebrow + title + 3-4 large stat rings. */
export interface StatsSlide {
  kind: 'stats';
  eyebrow?: string;
  title: MixedText;
  stats: { value: string; label: string; sub?: string }[];
  /** Caption under the stat row. */
  caption?: string;
}

/** Quote slide — full-bleed pull quote. */
export interface QuoteSlide {
  kind: 'quote';
  quote: MixedText;
  author: { initial: string; name: string; title: string };
  /** Optional image slot for the right-side portrait. */
  image_slot?: string;
}

/** CTA slide — closing pitch with primary action. */
export interface CTASlide {
  kind: 'cta';
  eyebrow?: string;
  title: MixedText;
  body?: string;
  primary: { label: string; href: string };
  /** Optional secondary action. */
  secondary?: { label: string; href: string };
}

/** End slide — huge italic kicker word and footer signature. */
export interface EndSlide {
  kind: 'end';
  /** The huge kicker — `'Open Design.'`. */
  mega: MixedText;
  /** Footer text under the kicker — `'Apache-2.0 · MMXXVI · Berlin'`. */
  footer?: string;
}

export type Slide =
  | CoverSlide
  | SectionSlide
  | ContentSlide
  | StatsSlide
  | QuoteSlide
  | CTASlide
  | EndSlide;

/* ---------- top-level ---------- */

export interface OpenDesignLandingDeckInputs {
  $schema?: string;
  brand: BrandBlock;
  /** Deck-wide title shown in the HUD — `'Open Design · Vol. 01'`. */
  deck_title: string;
  slides: Slide[];
  imagery: ImageryConfig;
}

/**
 * @deprecated Use `OpenDesignLandingDeckInputs`.
 *
 * Backwards-compat alias kept for the v0.3.x line and removed in the next
 * minor (v0.4.0). Migration steps live in `README.md` under
 * "Migrating from `editorial-collage-deck`".
 */
export type EditorialCollageDeckInputs = OpenDesignLandingDeckInputs;
