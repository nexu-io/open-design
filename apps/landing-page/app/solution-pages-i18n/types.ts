/*
 * Shared types for the Solution → Use case and Role landing page copy.
 *
 * Split out of `solution-pages-i18n.ts` so each per-locale module can import
 * the shape without pulling in the full 18-locale data set (and so the index
 * module stays under the repo's changed-file size guard). The public type API
 * (`SolutionPageCopy`, `SolutionPageKey`, …) is unchanged and continues to be
 * re-exported from `solution-pages-i18n.ts`.
 */
export type SolutionStep = {
  /** Step heading, e.g. "Describe the screen". */
  title: string;
  /** One or two sentences explaining the step. */
  body: string;
  /** Alt text for the step's illustration. */
  imageAlt: string;
  /**
   * Optional thumbnail id for the alternating image+text row — basename of a
   * real PNG under `public/previews/plugins/` (no extension). When set, the
   * step renders as a left/right image+text band; when omitted it stays a
   * plain numbered row.
   */
  thumb?: string;
};

export type SolutionFeature = {
  /** Short feature title. */
  title: string;
  /** One sentence describing the feature. */
  body: string;
  /**
   * Thumbnail id — basename of a real PNG under `public/previews/plugins/`
   * (no extension). Drives the feature-grid card image.
   */
  thumb: string;
};

export type SolutionTableRow = {
  /** Row label — the capability or task. */
  capability: string;
  /** What Open Design does. */
  withOd: string;
  /** The old / manual / tool-bound way. */
  without: string;
};

export type SolutionFaq = {
  q: string;
  a: string;
};

export type SolutionGalleryItem = {
  /**
   * Thumbnail id — the basename of a real preview PNG under
   * `public/previews/plugins/`, WITHOUT the `.png` extension. The page
   * renders it from `/previews/plugins/<thumb>.png`, so every value here
   * must point at a file that actually ships in the repo.
   */
  thumb: string;
  /** Short caption naming the real template / output this thumbnail is. */
  caption: string;
};

export type SolutionPageCopy = {
  // ---- meta / SEO ----
  title: string;
  description: string;
  breadcrumb: string;
  /** Uppercase kicker above the H1, e.g. "Use case · Prototype". */
  label: string;
  // ---- hero ----
  heading: string;
  lead: string;
  heroImageAlt: string;
  // ---- tl;dr ----
  tldrTitle: string;
  tldrBody: string;
  // ---- how to use (image + text steps) ----
  stepsTitle: string;
  steps: SolutionStep[];
  // ---- capability table ----
  tableTitle: string;
  tableColCapability: string;
  tableColWithOd: string;
  tableColWithout: string;
  tableRows: SolutionTableRow[];
  // ---- feature grid (what you can do, each with a thumbnail) ----
  featuresTitle: string;
  features: SolutionFeature[];
  // ---- template gallery (real in-repo example thumbnails) ----
  galleryTitle: string;
  galleryLead: string;
  gallery: SolutionGalleryItem[];
  /** Relative href to the matching templates/plugins surface. */
  exampleHref: string;
  exampleLinkLabel: string;
  // ---- faq ----
  faqTitle: string;
  faq: SolutionFaq[];
  // ---- cta ----
  ctaTitle: string;
  ctaBody: string;
  // ---- related tools (optional; tool/generator pages only) ----
  relatedTitle?: string;
  related?: { href: string; label: string }[];
};

export type SolutionPageKey =
  // Solution → Tools (`/solutions/ai-<x>-generator/`)
  | 'aiWireframeGenerator'
  | 'aiUiGenerator'
  | 'designToCode'
  | 'aiLandingPageGenerator'
  | 'figmaToCode'
  | 'screenshotToCode'
  | 'aiPrototypeGenerator'
  | 'prototype'
  | 'dashboard'
  | 'slides'
  | 'image'
  | 'video'
  | 'designSystem'
  // Solution → Roles (`/solutions/<slug>/`)
  | 'roleSoloBuilder'
  | 'roleDesigner'
  | 'roleEngineering'
  | 'roleProductManagers'
  | 'roleMarketing';

export type SolutionLocaleCopy = Partial<Record<SolutionPageKey, SolutionPageCopy>>;
