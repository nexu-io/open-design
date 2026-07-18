// Brand DTOs — the shared web/daemon contract for the Brands surface.
//
// A "brand" is a design system enriched with the parts that make styling into
// *branding*: an identity (name, tagline, logo), a measured design language
// (colors, typography), and a voice. Brands are extracted from a live URL by
// the daemon (deterministic prefetch → provisional preview → registered design
// system) and rendered by the web Brands library + detail pages.
//
// Pure TypeScript: no Node, browser, or daemon imports (contracts purity).

/** The seven semantic color roles every brand palette resolves to. */
export const BRAND_COLOR_ROLES = [
  'background',
  'surface',
  'foreground',
  'muted',
  'border',
  'accent',
  'accent-secondary',
] as const;
export type BrandColorRole = (typeof BRAND_COLOR_ROLES)[number];

export interface BrandColor {
  role: BrandColorRole;
  /** Lowercase #rrggbb. */
  hex: string;
  /** Optional oklch() string (filled by enrichment; empty in the provisional). */
  oklch: string;
  name: string;
  usage: string;
}

export interface BrandFontSpec {
  family: string;
  fallbacks: string[];
  weights: number[];
  /** Full Google Fonts stylesheet URL when the face is freely loadable. */
  googleFontsUrl?: string;
  notes?: string;
}

export interface BrandVoice {
  adjectives: string[];
  tone: string;
  messagingPillars: string[];
  vocabulary: { use: string[]; avoid: string[] };
}

/** A representative brand image harvested from the site (hero, product
 *  screenshot, illustration/photography sample, og:image). `file` is a path
 *  relative to the brand/project dir, e.g. "imagery/hero.png". */
export interface BrandImagerySample {
  file: string;
  /** Short category label, e.g. "hero", "product", "illustration". */
  kind?: string;
  /** One-line description shown under the thumbnail. */
  caption?: string;
}

export interface BrandImagery {
  style: string;
  subjects: string[];
  treatment: string;
  avoid: string[];
  /** Representative image samples saved under `imagery/`. Optional and
   *  backward-compatible: brands extracted before this field stay valid. */
  samples?: BrandImagerySample[];
}

export interface BrandLayout {
  radius: string;
  borderWeight: string;
  spacing: string;
  postureRules: string[];
}

/** Authored overrides for the deterministic design-system seed. Omitted
 *  fields continue to use the engine defaults. */
export interface BrandSeedOverrides {
  colorPrimary?: string;
  colorSuccess?: string;
  colorWarning?: string;
  colorError?: string;
  colorInfo?: string;
  colorLink?: string;
  colorTextBase?: string;
  colorBgBase?: string;
  fontFamily?: string;
  fontFamilyCode?: string;
  fontSize?: number;
  borderRadius?: number;
  sizeUnit?: number;
  sizeStep?: number;
  controlHeight?: number;
  lineWidth?: number;
  motionUnit?: number;
  motionBase?: number;
  wireframe?: boolean;
  motion?: boolean;
}

/** The canonical brand kit — the single source of truth for every brand surface. */
export interface Brand {
  name: string;
  tagline: string;
  description: string;
  sourceUrl: string;
  logo: {
    /** Path relative to the brand dir, e.g. "logos/header-inline.svg". */
    primary: string | null;
    alternates: string[];
    notes: string;
  };
  colors: BrandColor[];
  typography: {
    display: BrandFontSpec;
    body: BrandFontSpec;
    mono?: BrandFontSpec;
  };
  voice: BrandVoice;
  imagery: BrandImagery;
  layout: BrandLayout;
  /** Optional authored inputs retained across finalize and exposed by the API. */
  seed?: BrandSeedOverrides;
}

/**
 * Brand lifecycle as surfaced to every brand UI.
 *   - `extracting`  : the backing extraction run is actively working.
 *   - `needs_input` : the backing run paused for the user (a question form /
 *     anti-bot wall). Reversible — flips back to `extracting` once the user
 *     answers, so it is derived on read and never persisted.
 *   - `ready`       : a brand kit was finalized + a design system registered.
 *   - `failed`      : the backing run failed or was canceled/stopped by the user.
 */
export type BrandStatus = 'extracting' | 'needs_input' | 'ready' | 'failed';

/** Server-written lifecycle record stored next to brand.json. */
export interface BrandMeta {
  id: string;
  sourceUrl: string;
  createdAt: number;
  updatedAt: number;
  status: BrandStatus;
  /** Human-readable failure reason when status === "failed". */
  error?: string;
  /** Backing extraction run that last drove this brand into a terminal failure. */
  extractionTerminalRunId?: string;
  /** Original terminal failure reason for that extraction run, preserved across daemon restarts. */
  extractionTerminalError?: string;
  /** The `user:<id>` design-system id this brand registered, so selecting the
   *  brand in the composer applies it through the existing design-system flow. */
  designSystemId?: string;
  /** UI locale used when generating static brand.html preview copy. */
  locale?: string;
  /** Backing brand-generation project where extracted assets can be iterated. */
  projectId?: string;
  /** Conversation that owns the original extraction run for this brand. */
  extractionConversationId?: string;
  /** Run that owns the original extraction for this brand, once observed. */
  extractionRunId?: string;
  /** Files generated by the deterministic brand system builder. */
  systemFiles?: string[];
  /** True when the programmatic prefetch hit an anti-bot wall (Cloudflare,
   *  DataDome, …) and could not harvest the page. The web surfaces this to
   *  prompt the user to solve the challenge in the in-app browser tab and then
   *  re-extract from the rendered DOM. Persisted so a poll/restart still sees
   *  it; cleared on a successful extract-from-html or finalize. */
  blocked?: boolean;
  /** Human-readable label for the wall that blocked extraction (e.g.
   *  "Cloudflare"). Set alongside `blocked`. */
  blockedReason?: string;
  /** Seeded conversation that carries the programmatic-extraction transcript.
   *  Persisted so any completion point (finalize success, soft-fail/blocked,
   *  user stop, timeout) can reconcile the synthetic assistant message's run
   *  status to a terminal state regardless of the racy background timer. */
  conversationId?: string;
  /** The seeded assistant message id whose run status the lifecycle reconciles
   *  out of the perpetual `running` state once extraction terminates. */
  extractionTranscriptMessageId?: string;
  /** The seeded user message id paired with the assistant message above. */
  extractionTranscriptUserMessageId?: string;
  /** When the programmatic pass started (ms epoch), so a terminal reconcile can
   *  stamp an accurate elapsed window on the synthetic message. */
  extractionStartedAt?: number;
  /** Current programmatic extraction generation. Background passes must match
   *  this before committing terminal writes, so stale retries cannot overwrite a
   *  newer Browser/manual retry. */
  extractionAttemptId?: string;
}

/** A brand as surfaced to the library list + detail page. */
export interface BrandSummary {
  meta: BrandMeta;
  brand: Brand | null;
}

export interface BrandListResponse {
  brands: BrandSummary[];
}

export interface BrandDetailResponse {
  meta: BrandMeta;
  brand: Brand | null;
  /** Prose brand guide markdown, when present. */
  guide: string | null;
}

/** POST /api/brands request — start an agent-driven brand extraction. */
export interface BrandCreateRequest {
  /** Website/source URL. Optional when `designMd` is supplied directly. */
  url?: string;
  /** Short brand/product context, used as voice + intro copy in the fast pass. */
  description?: string;
  /** Pasted DESIGN.md content. Parsed locally before the AI enrichment pass. */
  designMd?: string;
  /** UI locale used to generate the static brand.html preview copy. */
  locale?: string;
}

/**
 * POST /api/brands response. Extraction is two-phase:
 *   1. START: the daemon reserves the brand/project/conversation, persists the
 *      extracting `brand.html` skeleton, seeds real programmatic user/assistant
 *      messages, and returns immediately so the caller can navigate in.
 *   2. BACKGROUND PROGRAMMATIC EXTRACTION: the daemon harvests the site or
 *      pasted DESIGN.md without an LLM, registers `user:<id>` when successful,
 *      and updates the same assistant message with completion + produced files.
 * A fully blocked / unreachable origin stays `extracting` for the agent/browser
 * fallback — with a human in the loop for anti-bot walls.
 */
export interface BrandExtractStartResponse {
  /** The reserved brand id (status starts as `extracting`). */
  id: string;
  /** Backing `brand` project the agent runs the extraction inside. */
  projectId: string;
  /** Seeded conversation the first extraction prompt auto-sends into. */
  conversationId: string;
  /** The normalized source URL the browser tab was opened to. */
  sourceUrl: string;
  /** Current lifecycle at project creation time; normally `extracting`. */
  status: BrandStatus;
  /** Draft/ready `user:<id>` design system reserved for this brand when available. */
  designSystemId?: string;
  /** Display name when already available. */
  brandName?: string;
}

/**
 * POST /api/brands/:id/continue-extraction response. Reuses the existing
 * brand/project/design-system, appends a fresh programmatic transcript turn,
 * and restarts the deterministic extraction pass in the background.
 */
export interface BrandContinueExtractionResponse extends BrandExtractStartResponse {}

/**
 * POST /api/brands/:id/finalize request. The extraction agent calls this (or
 * `od brand finalize`) once it has written `brand.json` (+ `BRAND.md`, logos,
 * fonts) into the backing project: the daemon validates the kit, derives the
 * design tokens + brand-system artifacts, and registers the `user:<id>` design
 * system so the brand becomes selectable everywhere.
 */
export interface BrandFinalizeRequest {
  /** Backing project whose `brand.json` holds the agent output. Defaults to
   *  the brand's recorded `projectId`. */
  projectId?: string;
}

export interface BrandFinalizeResponse {
  id: string;
  brand: Brand;
  designSystemId: string;
  projectId: string;
  /** Files emitted by the deterministic brand-system builder. */
  files: string[];
}

/**
 * POST /api/brands/:id/extract-from-html request. When the programmatic
 * prefetch is blocked by an anti-bot wall, the user solves the challenge in the
 * in-app browser tab; the web then reads the already-rendered DOM out of the
 * browser webview and posts it here so the daemon can run the same
 * harvest → synthesize → finalize pipeline against the unblocked HTML (no fresh
 * fetch). Reuses `BrandFinalizeResponse` on success.
 */
export interface BrandExtractFromHtmlRequest {
  /** `document.documentElement.outerHTML` of the user-unblocked page. */
  html: string;
  /** Concatenated stylesheet text + computed-style harvest collected from the
   *  rendered page. Optional — inline `<style>` in `html` is used regardless. */
  css?: string;
  /** Page URL, used as the asset base for logo/font resolution. Defaults to the
   *  brand's recorded `sourceUrl`. */
  baseUrl?: string;
}

// ─── legacy extraction SSE events ────────────────────────────────────
//
// Retained for backwards compatibility with any external consumer that still
// reduces the old 3-stage SSE stream. The current extraction flow is
// agent-driven (see `BrandExtractStartResponse`) and does not emit these.

export type BrandExtractEvent =
  | { event: 'created'; id: string; projectId?: string }
  | { event: 'phase'; phase: 'prefetch' | 'preview' | 'system' | 'done' }
  | { event: 'prefetch'; step: string; detail?: string }
  | { event: 'prefetch-done'; colors: number; fonts: number; logos: number; thin: boolean }
  | { event: 'preview'; brand: Brand }
  | { event: 'system'; ok: boolean; designSystemId?: string; projectId?: string; files?: string[]; error?: string }
  | { event: 'brand'; id: string; brand: Brand; projectId?: string; designSystemId?: string; files?: string[] }
  | { event: 'error'; message: string };
