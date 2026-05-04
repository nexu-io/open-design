/**
 * editorial-collage — input schema.
 *
 * This is the contract between users and `scripts/compose.ts`. A valid
 * `inputs.json` matching `EditorialCollageInputs` is enough to produce
 * a complete Atelier Zero landing page, end-to-end, with no further
 * code changes needed.
 *
 * Convention: every field that drives visible copy lives here. The
 * structural CSS, layout grid, motion, and 16 image slots are fixed by
 * the design system (`design-systems/atelier-zero/DESIGN.md`); only
 * brand identity and content text are user-controlled.
 */

/* ---------- text helpers ---------- */

/**
 * A `MixedText` is a sentence whose visual rhythm comes from alternating
 * sans-serif and italic-serif spans. Encode it as an array of segments;
 * the composer concatenates them into HTML, wrapping `em: true` segments
 * in `<em>` tags. The trailing `dot: true` segment renders the coral
 * full-stop accent.
 *
 * Example:
 *   [
 *     { text: 'We treat ' },
 *     { text: 'your agent', em: true },
 *     { text: ' as a creative ' },
 *     { text: 'collaborator,', em: true },
 *     { text: ' not a black box' },
 *     { text: '.', dot: true },
 *   ]
 */
export interface TextSegment {
  text: string;
  /** Wrap in <em> for italic-serif emphasis. */
  em?: boolean;
  /** Render as the coral terminating dot accent (use as the final segment). */
  dot?: boolean;
}
export type MixedText = TextSegment[];

/* ---------- brand block ---------- */

export interface BrandBlock {
  /** Display name (appears in nav, footer, og:title, browser tab). */
  name: string;
  /** Single glyph for the circled brand mark — `Ø`, `▲`, `★`, etc. */
  mark: string;
  /**
   * Two-line meta block in the nav: `<b>{title}</b>{subtitle}` with a
   * dividing rule. e.g. `{ title: 'Studio Nº 01', subtitle: 'Berlin / Open / Earth' }`.
   */
  meta: { title: string; subtitle: string };
  /** Filed-under tagline shown in the topbar. */
  filed_under: string;
  /** Tagline shown in the page <title> alongside the brand. */
  tagline: string;
  /** SEO description; appears in `<meta name='description'>`. */
  description: string;
  /** ISO 639-1 language code; defaults to `en`. */
  locale?: string;
  /** Edition badge — `'Vol. 01 / Issue Nº 26'`. */
  edition: string;
  /** Visible build version — `'v0.4.6'`. */
  version: string;
  /** SPDX license identifier or short label — `'Apache-2.0'`. */
  license: string;
  /** Primary CTA URL (Star on GitHub, etc.). */
  primary_url: string;
  /** Star-button label in the nav. */
  primary_url_label: string;
  /**
   * Optional secondary CTA URL surfaced as a ghost pill in the nav and as
   * a button in the footer brand column. When set, the marketing surface
   * advertises a "Download" entry so users know they can install directly.
   */
  download_url?: string;
  /** Label for the download CTA — defaults to `'Download'` when omitted. */
  download_url_label?: string;
  /** Email address shown in the CTA section. */
  contact_email: string;
  /** Pretty location line — `'Berlin / Open / Earth'`. */
  location: string;
  /** Coordinates string — `'52.5200° N · 13.4050° E'`. */
  coordinates: string;
  /** Year of publication — `'2026'`. */
  year: string;
  /** Roman numeral year for the footer kicker — `'MMXXVI'`. */
  year_roman: string;
  /** Founding tagline — `'Est. MMXXVI'`. */
  founded: string;
  /** Side rails (the rotated text fixed to viewport edges). */
  rails: { right: string; left: string };
  /** Topbar live channel languages — `['EN', 'DE', '中文', '日本語']`. First entry is bolded. */
  languages: string[];
  /** Topbar pulse text — `'Live · v0.4.6'`. */
  status: string;
}

/* ---------- nav ---------- */

export interface NavLink {
  label: string;
  href: string;
  /** Optional superscript count badge — `'31'`, `'72'`, etc. */
  count?: string;
}

/* ---------- hero ---------- */

export interface HeroStat {
  /** Number or short string inside the ring — `'31'`. */
  value: string;
  /** Bold label below the ring — `'skills'`. */
  label: string;
  /** Sub-label — `'shippable'`. */
  sub: string;
  /** Visual treatment: dashed border (default), solid border, or coral accent. */
  variant?: 'dashed' | 'solid' | 'coral';
}

export interface HeroIndexItem {
  /** Two-digit number — `'01'`. */
  num: string;
  /** Step name — `'Detect'`. */
  label: string;
  /** Mark this item as the active one (rendered in solid ink). */
  active?: boolean;
}

export interface HeroBlock {
  /** Eyebrow label (left) — `'Open-source design studio'`. */
  label: string;
  /** Eyebrow index (right of label) — `'· Nº 01'`. */
  ix: string;
  /** The H1 — encoded as MixedText. */
  headline: MixedText;
  /** Lead paragraph; can include `<code>` via raw HTML — keep ASCII-quotes safe. */
  lead: string;
  /** Primary CTA. */
  primary: { label: string; href: string };
  /** Secondary CTA. */
  secondary: { label: string; href: string };
  /** Three stat rings displayed below the CTAs. */
  stats: [HeroStat, HeroStat, HeroStat];
  /** Bottom-left meta line in the hero foot. */
  meta: string;
  /** Four index items rendered over the hero collage. */
  index: [HeroIndexItem, HeroIndexItem, HeroIndexItem, HeroIndexItem];
  /** Image annotations (corner labels). */
  annotations: {
    tl: string;
    tr: string;
    bl: string;
    br: string;
  };
}

/* ---------- about ---------- */

export interface AboutBlock {
  label: string;
  ix: string;
  headline: MixedText;
  lead: string;
  cta_label: string;
  cta_href: string;
  /** Footer row text — `'Research · Design · Engineering · Repeat'`. */
  footer_text: string;
  /** Stamp top line (coral) — `'Studio practice'`. */
  stamp_top: string;
  /** Stamp bottom line (ink) — `'Est. MMXXVI'`. */
  stamp_bottom: string;
  /** Side note (right of the about image). */
  side_note: string;
  /** Caption below the about image. */
  caption: { bold: string; rest: string };
}

/* ---------- capabilities ---------- */

export interface CapabilityCard {
  /** Two-digit accent — `'01'`. */
  num: string;
  /** Tag — `'Skills'`. */
  tag: string;
  /** SVG inner contents (paths/circles/rects only — no <svg> wrapper). */
  icon_svg: string;
  /** Title; use \n for line breaks. */
  title: string;
  /** Body; can include `<code>` raw HTML. */
  body: string;
  href: string;
}

export interface CapabilitiesBlock {
  label: string;
  ix: string;
  headline: MixedText;
  lead: string;
  ribbon: string;
  /** Exactly four cards. */
  cards: [CapabilityCard, CapabilityCard, CapabilityCard, CapabilityCard];
}

/* ---------- labs ---------- */

export interface LabPill {
  label: string;
  count: string;
  active?: boolean;
}

export interface LabCard {
  badge: string;
  num: string;
  year: string;
  title: string;
  body: string;
  href: string;
}

export interface LabsBlock {
  label: string;
  ix: string;
  headline: MixedText;
  pills: LabPill[];
  meta: { ring: string; bold: string; sub: string };
  /** Exactly five lab cards. */
  cards: [LabCard, LabCard, LabCard, LabCard, LabCard];
  /** Progress bar — total segments and how many are filled. */
  progress: { total: number; filled: number };
  foot: string;
}

/* ---------- method ---------- */

export interface MethodStep {
  num: string;
  title: string;
  body: string;
}

export interface MethodBlock {
  label: string;
  ix: string;
  headline: MixedText;
  right: string;
  /** Exactly four steps. */
  steps: [MethodStep, MethodStep, MethodStep, MethodStep];
  foot_left: string;
  foot_right_bold: string;
  foot_right_rest: string;
}

/* ---------- work ---------- */

export interface WorkCard {
  small_label: string;
  index: string;
  title: string;
  body: string;
  year: string;
  tag: string;
}

export interface WorkBlock {
  label: string;
  headline: MixedText;
  link_label: string;
  link_href: string;
  /** Two cards — first regular, second has the .alt tilt. */
  cards: [WorkCard, WorkCard];
}

/* ---------- testimonial / partners ---------- */

export interface Partner {
  /** SVG inner contents (paths/circles/rects only — no <svg> wrapper). */
  glyph_svg: string;
  name: string;
  role: string;
  /** Click target for the partner card. When omitted, falls back to `'#'`. */
  href?: string;
}

export interface TestimonialBlock {
  label: string;
  ix: string;
  /** Quote with em emphasis; the leading `"` and trailing `"` are added by the composer. */
  quote: MixedText;
  author: { initial: string; name: string; title: string };
  partners_text: string;
  /** Up to five partners; the design fits five comfortably. */
  partners: Partner[];
  read_more_label: string;
  read_more_href: string;
}

/* ---------- cta ---------- */

export interface CTABlock {
  label: string;
  ix: string;
  headline: MixedText;
  lead: string;
  primary: { label: string; href: string };
  ribbon: string;
}

/* ---------- wire / global ticker ---------- */

/**
 * A single city pinned to the studio's "from the field" ticker. The
 * marquee renders `{coord}  {name}`, so keep `coord` short — `52.52°N`,
 * `1.29°S`, etc.
 */
export interface WireCity {
  /** Display name — `'Berlin'`, `'São Paulo'`. Title-case is fine; the
   * stylesheet uppercases it visually. */
  name: string;
  /** Latitude only, prettified — `'52.52°N'`. */
  coord: string;
}

/**
 * A named contributor / lineage handle in the ticker's bottom row. The
 * marquee renders `@{handle}  {role}` and the whole pill becomes a link
 * to `href` (typically a GitHub profile or org page).
 */
export interface WireContributor {
  /** GitHub-style handle without the leading `@` — `'tw93'`, `'OpenCoworkAI'`. */
  handle: string;
  /** Short role tag — `'kami'`, `'core'`, `'be next'`. Rendered in coral. */
  role: string;
  /** Click target for the handle pill. */
  href: string;
}

/**
 * Optional editorial ticker rendered between the hero and the about
 * section. Two counter-scrolling marquees: cities (left → right) and
 * contributors (right → left). Designed to signal that the project is
 * global and community-driven without disrupting the roman-numeral
 * section count.
 */
export interface WireBlock {
  /** Bold uppercase headline on the left rail — `'From the field'`. */
  title: string;
  /** Sub-label — `'Open · 23 cities · 6 contributors'`. Optional; computed
   * from the lists when omitted. */
  subtitle?: string;
  cities: WireCity[];
  contributors: WireContributor[];
}

/* ---------- footer ---------- */

export interface FooterColumn {
  title: string;
  links: { label: string; href: string }[];
}

export interface FooterBlock {
  brand_description: string;
  /**
   * Optional CTA rendered under the brand description in the footer
   * (e.g. `{ label: 'Download desktop', href: 'https://.../releases',
   * meta: 'macOS · v0.2.0' }`). When `brand.download_url` is set this is
   * filled in automatically; explicit values take precedence.
   */
  brand_cta?: { label: string; href: string; meta?: string };
  /** Up to five columns; the design fits five at the widest breakpoint. */
  columns: FooterColumn[];
  /** Footer mega kicker — encoded as MixedText so the brand can italicize part of it. */
  mega: MixedText;
}

/* ---------- section rules (the I., II., III. dividers) ---------- */

export interface SectionRule {
  /** Roman numeral string — `'I.'`, `'II.'`, etc. */
  roman: string;
  /** Three middle text spans separated by a coral dot. */
  meta: [string, string, string];
  /** Pagination — `'002 / 008'`. */
  pagination: string;
}

export interface SectionRules {
  about: SectionRule;
  capabilities: SectionRule;
  labs: SectionRule;
  method: SectionRule;
  work: SectionRule;
  testimonial: SectionRule;
  cta: SectionRule;
}

/* ---------- image strategy ---------- */

/**
 * `'generate'` — call gpt-image-2 (via fal.ai or Azure) for every slot
 *    using `assets/imagegen-prompts.md` as the prompt source, brand-keyed
 *    via the `imagery_prompts` field on the inputs.
 * `'placeholder'` — emit SVG paper-textured frames into `out/assets/`
 *    so the layout is fully rendered even with no AI image budget.
 *    Users can swap real PNGs in later without touching markup.
 * `'bring-your-own'` — assume the 16 PNGs are already at the configured
 *    `assets_path`; do nothing.
 */
export type ImageStrategy = 'generate' | 'placeholder' | 'bring-your-own';

export interface ImageryConfig {
  strategy: ImageStrategy;
  /** Relative path (from the output) to the asset folder. Default: `./assets/`. */
  assets_path: string;
  /** Per-slot prompt overrides for `'generate'` strategy. */
  prompts?: Record<string, string>;
  /** When `strategy: 'generate'`, which provider to call. */
  provider?: 'fal' | 'azure';
}

/* ---------- top-level ---------- */

export interface EditorialCollageInputs {
  $schema?: string;
  brand: BrandBlock;
  nav: NavLink[];
  rules: SectionRules;
  hero: HeroBlock;
  about: AboutBlock;
  capabilities: CapabilitiesBlock;
  labs: LabsBlock;
  method: MethodBlock;
  work: WorkBlock;
  testimonial: TestimonialBlock;
  cta: CTABlock;
  footer: FooterBlock;
  /**
   * Optional editorial wire/ticker between hero and about. Omit to hide
   * the strip entirely.
   */
  wire?: WireBlock;
  imagery: ImageryConfig;
}
