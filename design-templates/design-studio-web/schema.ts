/**
 * design-studio-web — input schema.
 *
 * One typed inputs.json + the canonical stylesheet + composer are enough
 * to produce the complete creative-studio homepage.
 *
 * All visible copy and project data live here. Layout, motion, WebGL,
 * cursor physics, horizontal work rail, and responsive behavior are fixed
 * by the template so a new brand can be generated without touching code.
 */

export interface TextSegment {
  text: string;
  /** Italic / editorial emphasis. */
  em?: boolean;
  /** Accent treatment for one short fragment. */
  accent?: boolean;
}
export type MixedText = TextSegment[];

export interface BrandBlock {
  name: string;
  mark: string;
  tagline: string;
  description: string;
  locale?: string;
  location: string;
  coordinates: string;
  year: string;
  founded: string;
  contact_email: string;
  status: string;
  edition: string;
  languages: string[];
  social: { label: string; href: string }[];
}

export interface NavLink {
  label: string;
  href: string;
}

export interface HeroStat {
  value: string;
  label: string;
}

export interface HeroBlock {
  eyebrow: string;
  headline: MixedText;
  lead: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  stats: [HeroStat, HeroStat, HeroStat];
  scroll_label: string;
  art_label: string;
}

export interface ManifestoBlock {
  kicker: string;
  headline: MixedText;
  paragraphs: string[];
  principles: [
    { index: string; title: string; body: string },
    { index: string; title: string; body: string },
    { index: string; title: string; body: string }
  ];
}

export interface Project {
  index: string;
  title: string;
  client: string;
  category: string;
  year: string;
  description: string;
  services: string[];
  metric: string;
  image_slot: string;
  href: string;
  theme?: 'dark' | 'light';
}

export interface WorkBlock {
  kicker: string;
  headline: MixedText;
  lead: string;
  projects: Project[];
  archive_label: string;
  archive_href: string;
}

export interface Capability {
  index: string;
  title: string;
  body: string;
  services: string[];
}

export interface CapabilitiesBlock {
  kicker: string;
  headline: MixedText;
  lead: string;
  items: [Capability, Capability, Capability, Capability];
  lab_label: string;
}

export interface MethodStep {
  index: string;
  title: string;
  body: string;
  note: string;
}

export interface MethodBlock {
  kicker: string;
  headline: MixedText;
  lead: string;
  steps: [MethodStep, MethodStep, MethodStep, MethodStep];
}

export interface StudioBlock {
  kicker: string;
  headline: MixedText;
  body: string;
  image_slot: string;
  disciplines: string[];
  stats: [
    { value: string; label: string },
    { value: string; label: string },
    { value: string; label: string }
  ];
}

export interface ProofBlock {
  kicker: string;
  quote: string;
  quote_author: string;
  quote_role: string;
  clients: string[];
  awards: { year: string; title: string; body: string }[];
}

export interface ContactBlock {
  kicker: string;
  headline: MixedText;
  lead: string;
  email_label: string;
  email: string;
  availability: string;
  timezone: string;
}

export interface FooterBlock {
  closing_word: string;
  note: string;
}

/**
 * Interface chrome that belongs to the template rather than to the brand.
 * Every key is optional: when omitted the composer falls back to its
 * English defaults, so a brief only declares what it needs to translate.
 * Non-Latin briefs (zh-CN, ja, ko…) should translate all of it so the
 * artifact never mixes two languages inside one viewport.
 */
export interface UiStrings {
  /** Loader caption, one line. */
  loading?: string;
  menu?: string;
  close?: string;
  audio?: string;
  lab_title?: string;
  lab_body?: string;
  lab_hint?: string;
  lab_readout?: string;
  lab_sliders?: { noise?: string; flow?: string; distortion?: string; chromatic?: string };
  lab_presets?: { default?: string; subtle?: string; warp?: string; hyper?: string };
  cursor?: { view?: string; top?: string; open?: string; mail?: string };
  /** Accessible name for the primary in-page navigation landmark. */
  nav_aria?: string;
  /** Appended after the project title in the plate's alt text. */
  alt_project?: string;
  alt_studio?: string;
}

export type ImageStrategy = 'placeholder' | 'generate' | 'bring-your-own';
export interface ImageryConfig {
  strategy: ImageStrategy;
  /** Relative URL from generated HTML, normally ./assets/. */
  assets_path: string;
  /** Optional per-slot prompt override. */
  prompts?: Record<string, string>;
}

export interface MotionConfig {
  /** 0..1 visual motion multiplier. */
  intensity: number;
  loader: boolean;
  custom_cursor: boolean;
  audio: boolean;
  /** Disable expensive canvas work on low-power devices when true. */
  adaptive_quality: boolean;
}

export interface DesignStudioWebInputs {
  $schema?: string;
  brand: BrandBlock;
  nav: NavLink[];
  hero: HeroBlock;
  manifesto: ManifestoBlock;
  work: WorkBlock;
  capabilities: CapabilitiesBlock;
  method: MethodBlock;
  studio: StudioBlock;
  proof: ProofBlock;
  contact: ContactBlock;
  footer: FooterBlock;
  imagery: ImageryConfig;
  motion: MotionConfig;
  /** Optional localisation of the template's own interface chrome. */
  ui?: UiStrings;
}
