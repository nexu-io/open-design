// DesignKit — the normalized model the brand.html-style kit view (`DesignKitView`)
// renders, plus the adapters and hooks that feed it from the two data sources we
// have: a finalized `Brand` (brand.json — richest, used by the Brands surfaces
// and brand-generated design systems) and a parsed DESIGN.md (used by official
// presets and any non-brand design system).
//
// Keeping one model means every surface — the Brands tab, the Design Systems
// list preview, and the in-project Design System tab — renders the identical
// module layout regardless of where the data came from.

import { useEffect, useState } from 'react';
import type {
  Brand,
  BrandSummary,
  BrandVoice,
  DesignSystemPackageInfo,
} from '@open-design/contracts';
import { designSystemStaticUrl, fetchProjectFileText, projectRawUrl } from '../providers/registry';
import { parseDesignMd, type ParsedDesignMd } from './design-md-parse';

// ── shared pure helpers (also re-exported from BrandPreviewCard) ──────────

/** Best-effort hostname for a brand/source URL's domain line + favicon fallback. */
export function hostnameOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || rawUrl;
  }
}

/** Build a CSS font-family stack from a kit font spec, quoting multi-word names. */
export function fontStack(spec: { family: string; fallbacks?: string[] }): string {
  const families = [spec.family, ...(spec.fallbacks ?? [])].filter(Boolean);
  if (families.length === 0) return 'ui-sans-serif, system-ui, sans-serif';
  return families.map((f) => (/\s/.test(f) ? `'${f}'` : f)).join(', ');
}

/** Relative-luminance check so a swatch hex caption stays legible on the chip. */
export function isLightHex(hex: string): boolean {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return true;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150;
}

// ── kit model ─────────────────────────────────────────────────────────────

export interface KitColor {
  role: string;
  name: string;
  hex: string;
  usage: string;
}

export interface KitFont {
  family: string;
  fallbacks: string[];
  weights: number[];
  googleFontsUrl?: string;
  notes?: string;
}

export interface KitImageSample {
  url: string;
  caption?: string;
  kind?: string;
}

export interface KitImagery {
  style: string;
  subjects: string[];
  treatment: string;
  avoid: string[];
  samples: KitImageSample[];
}

export interface KitLayout {
  radius: string;
  borderWeight: string;
  spacing: string;
  postureRules: string[];
}

export interface KitSystem {
  kitUrl: string;
  kitDarkUrl?: string;
  tokensUrl?: string;
  indexUrl?: string;
}

export interface KitAsset {
  kind: string;
  label: string;
  url: string;
}

export interface DesignKit {
  designSystemId?: string;
  /** When set, the logo resolves via `/api/brands/:id/logo` (Brands surfaces). */
  brandId?: string;
  name: string;
  tagline?: string;
  description?: string;
  host?: string;
  sourceUrl?: string;
  projectId?: string;
  editable: boolean;
  /** True when modules can be written back to the backing project. */
  canUpload: boolean;
  logoSrc?: string | null;
  logoAlternates: string[];
  logoNotes?: string;
  colors: KitColor[];
  typography: { display?: KitFont; body?: KitFont; mono?: KitFont };
  fonts: KitFont[];
  voice?: BrandVoice;
  imagery?: KitImagery;
  layout?: KitLayout;
  system?: KitSystem;
  assets?: KitAsset[];
  /** Self-contained showcase HTML used as the cover when there is no live logo. */
  showcaseHtml?: string | null;
}

/** The six brand-system artifact tiles, mirroring BrandPreviewCard. */
const ASSET_TILES: { kind: string; label: string; file: string }[] = [
  { kind: 'landing', label: 'Landing page', file: 'system/artifacts/landing.html' },
  { kind: 'deck', label: 'Pitch deck', file: 'system/artifacts/deck.html' },
  { kind: 'poster', label: 'Poster', file: 'system/artifacts/poster.html' },
  { kind: 'email', label: 'Email', file: 'system/artifacts/email.html' },
  { kind: 'newsletter', label: 'Newsletter', file: 'system/artifacts/newsletter.html' },
  { kind: 'form', label: 'Form page', file: 'system/artifacts/form.html' },
];

function fontList(typography: DesignKit['typography']): KitFont[] {
  return [typography.display, typography.body, typography.mono].filter(
    (f): f is KitFont => Boolean(f),
  );
}

function hasVoice(voice: BrandVoice | undefined): boolean {
  if (!voice) return false;
  return (
    voice.adjectives.length > 0 ||
    voice.tone.trim().length > 0 ||
    voice.messagingPillars.length > 0 ||
    voice.vocabulary.use.length > 0 ||
    voice.vocabulary.avoid.length > 0
  );
}

function hasImagery(imagery: KitImagery | undefined): boolean {
  if (!imagery) return false;
  return (
    imagery.style.trim().length > 0 ||
    imagery.subjects.length > 0 ||
    imagery.treatment.trim().length > 0 ||
    imagery.avoid.length > 0 ||
    imagery.samples.length > 0
  );
}

function hasLayout(layout: KitLayout | undefined): boolean {
  if (!layout) return false;
  return (
    layout.radius.trim().length > 0 ||
    layout.borderWeight.trim().length > 0 ||
    layout.spacing.trim().length > 0 ||
    layout.postureRules.length > 0
  );
}

function withCacheBust(url: string, cacheBustKey: number | string | undefined): string {
  if (cacheBustKey === undefined || cacheBustKey === '') return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(String(cacheBustKey))}`;
}

/**
 * Overlay a DESIGN.md edit onto an extracted kit module-by-module, field-by-field.
 *
 * A DESIGN.md draft is almost always a *partial* override of the richer
 * `brand.json` the extractor produced: the user adds a display font, or tweaks
 * the imagery style, and leaves everything else implicit. These helpers treat a
 * missing/empty overlay slot as "keep what was extracted" so a partial edit can
 * never silently drop the untouched `brand.json` data (body/mono fonts, imagery
 * samples, the other voice/layout fields).
 */
function mergeTypography(
  base: DesignKit['typography'],
  overlay: DesignKit['typography'],
): DesignKit['typography'] {
  return {
    display: overlay.display ?? base.display,
    body: overlay.body ?? base.body,
    mono: overlay.mono ?? base.mono,
  };
}

function mergeVoice(
  base: BrandVoice | undefined,
  overlay: BrandVoice | undefined,
): BrandVoice | undefined {
  if (!overlay) return base;
  if (!base) return overlay;
  return {
    adjectives: overlay.adjectives.length > 0 ? overlay.adjectives : base.adjectives,
    tone: overlay.tone.trim() ? overlay.tone : base.tone,
    messagingPillars:
      overlay.messagingPillars.length > 0 ? overlay.messagingPillars : base.messagingPillars,
    vocabulary: {
      use: overlay.vocabulary.use.length > 0 ? overlay.vocabulary.use : base.vocabulary.use,
      avoid:
        overlay.vocabulary.avoid.length > 0 ? overlay.vocabulary.avoid : base.vocabulary.avoid,
    },
  };
}

function mergeImagery(
  base: KitImagery | undefined,
  overlay: KitImagery | undefined,
): KitImagery | undefined {
  if (!overlay) return base;
  if (!base) return overlay;
  return {
    style: overlay.style.trim() ? overlay.style : base.style,
    subjects: overlay.subjects.length > 0 ? overlay.subjects : base.subjects,
    treatment: overlay.treatment.trim() ? overlay.treatment : base.treatment,
    avoid: overlay.avoid.length > 0 ? overlay.avoid : base.avoid,
    // DESIGN.md never carries harvested image samples; keep the extracted ones.
    samples: base.samples.length > 0 ? base.samples : overlay.samples,
  };
}

function mergeLayout(
  base: KitLayout | undefined,
  overlay: KitLayout | undefined,
): KitLayout | undefined {
  if (!overlay) return base;
  if (!base) return overlay;
  return {
    radius: overlay.radius.trim() ? overlay.radius : base.radius,
    borderWeight: overlay.borderWeight.trim() ? overlay.borderWeight : base.borderWeight,
    spacing: overlay.spacing.trim() ? overlay.spacing : base.spacing,
    postureRules: overlay.postureRules.length > 0 ? overlay.postureRules : base.postureRules,
  };
}

export function mergeBrandKitWithDesignMd(
  kit: DesignKit,
  designMd: string,
  opts: ParsedKitOptions,
): DesignKit {
  if (!designMd.trim()) return kit;
  const parsed = parseDesignMd(designMd);
  const mdKit = parsedToKit(parsed, opts);
  const typography = mergeTypography(kit.typography, mdKit.typography);
  return {
    ...kit,
    name: parsed.name.trim() || kit.name,
    tagline: parsed.tagline.trim() || kit.tagline,
    description: parsed.description.trim() || kit.description,
    colors: mdKit.colors.length > 0 ? mdKit.colors : kit.colors,
    typography,
    fonts: fontList(typography),
    voice: mergeVoice(kit.voice, mdKit.voice),
    imagery: mergeImagery(kit.imagery, mdKit.imagery),
    layout: mergeLayout(kit.layout, mdKit.layout),
  };
}

// ── adapters ───────────────────────────────────────────────────────────────

interface BrandKitOptions {
  designSystemId?: string;
  brandId?: string;
  projectId?: string;
  editable: boolean;
  host?: string;
  showcaseHtml?: string | null;
  reloadKey?: number | string;
  /** The system/ artifacts only exist once a brand is finalized; gate the kit
   *  iframe + asset tiles so an in-flight brand does not point at 404s. */
  ready?: boolean;
}

/** Build a kit from a finalized Brand (brand.json). Assets resolve against the
 *  backing project, mirroring the rendered brand.html. */
export function brandToKit(brand: Brand, opts: BrandKitOptions): DesignKit {
  const { projectId } = opts;
  const ready = opts.ready !== false;
  const showSystem = ready && Boolean(projectId);
  const asset = (rel: string): string | null =>
    projectId ? withCacheBust(projectRawUrl(projectId, rel), opts.reloadKey) : null;
  const host = opts.host || hostnameOf(brand.sourceUrl || '');
  const imagery: KitImagery | undefined = brand.imagery
    ? {
        style: brand.imagery.style,
        subjects: brand.imagery.subjects ?? [],
        treatment: brand.imagery.treatment,
        avoid: brand.imagery.avoid ?? [],
        samples: (brand.imagery.samples ?? [])
          .filter((s) => s && s.file)
          .map((s) => ({ url: asset(s.file) ?? s.file, caption: s.caption, kind: s.kind })),
      }
    : undefined;
  return {
    designSystemId: opts.designSystemId,
    brandId: opts.brandId,
    name: brand.name?.trim() || host || 'Design system',
    tagline: brand.tagline?.trim() || undefined,
    description: brand.description?.trim() || undefined,
    host,
    sourceUrl: brand.sourceUrl || undefined,
    projectId,
    editable: opts.editable,
    canUpload: opts.editable && Boolean(projectId),
    logoSrc: brand.logo?.primary ? asset(brand.logo.primary) : null,
    logoAlternates: (brand.logo?.alternates ?? [])
      .map((a) => asset(a))
      .filter((u): u is string => Boolean(u)),
    logoNotes: brand.logo?.notes || undefined,
    colors: (brand.colors ?? []).map((c) => ({
      role: c.role,
      name: c.name || c.role,
      hex: c.hex,
      usage: c.usage || '',
    })),
    typography: {
      display: brand.typography?.display,
      body: brand.typography?.body,
      mono: brand.typography?.mono,
    },
    fonts: fontList({
      display: brand.typography?.display,
      body: brand.typography?.body,
      mono: brand.typography?.mono,
    }),
    voice: hasVoice(brand.voice) ? brand.voice : undefined,
    imagery: hasImagery(imagery) ? imagery : undefined,
    layout: hasLayout(brand.layout) ? brand.layout : undefined,
    system: showSystem
      ? {
          kitUrl: withCacheBust(projectRawUrl(projectId!, 'system/kit.html'), opts.reloadKey),
          kitDarkUrl: withCacheBust(projectRawUrl(projectId!, 'system/kit.dark.html'), opts.reloadKey),
          tokensUrl: withCacheBust(projectRawUrl(projectId!, 'system/tokens.default.json'), opts.reloadKey),
          indexUrl: withCacheBust(projectRawUrl(projectId!, 'system/index.html'), opts.reloadKey),
        }
      : undefined,
    assets: showSystem
      ? ASSET_TILES.map((a) => ({ kind: a.kind, label: a.label, url: asset(a.file)! }))
      : undefined,
    showcaseHtml: opts.showcaseHtml ?? null,
  };
}

/** Convenience: build a kit straight from a BrandSummary (Brands surfaces). */
export function brandSummaryToKit(summary: BrandSummary): DesignKit {
  const host = hostnameOf(summary.meta.sourceUrl);
  if (!summary.brand) {
    return {
      brandId: summary.meta.id,
      name: host,
      host,
      sourceUrl: summary.meta.sourceUrl,
      projectId: summary.meta.projectId,
      editable: true,
      canUpload: false,
      logoSrc: null,
      logoAlternates: [],
      colors: [],
      typography: {},
      fonts: [],
    };
  }
  return brandToKit(summary.brand, {
    designSystemId: summary.meta.designSystemId,
    brandId: summary.meta.id,
    projectId: summary.meta.projectId,
    editable: true,
    host,
    ready: summary.meta.status === 'ready',
  });
}

interface ParsedKitOptions {
  designSystemId?: string;
  projectId?: string;
  editable: boolean;
  title?: string;
  host?: string;
  swatches?: string[];
  packageInfo?: DesignSystemPackageInfo;
  showcaseHtml?: string | null;
  reloadKey?: number | string;
}

function packageFontsToTypography(
  packageInfo: DesignSystemPackageInfo | undefined,
): DesignKit['typography'] {
  const fonts = packageInfo?.manifest?.fonts ?? [];
  const families: string[] = [];
  for (const f of fonts) {
    const family = (f.family ?? '').trim();
    if (family && !families.includes(family)) families.push(family);
  }
  const out: DesignKit['typography'] = {};
  if (families[0]) out.display = { family: families[0], fallbacks: [], weights: [] };
  if (families[1] ?? families[0]) out.body = { family: families[1] ?? families[0]!, fallbacks: [], weights: [] };
  const mono = families.find((f) => /mono|code/i.test(f));
  if (mono) out.mono = { family: mono, fallbacks: [], weights: [] };
  return out;
}

/** Build a kit from a parsed DESIGN.md (presets + non-brand design systems). */
export function parsedToKit(parsed: ParsedDesignMd, opts: ParsedKitOptions): DesignKit {
  let colors: KitColor[] = parsed.colors.map((c) => ({
    role: c.role,
    name: c.name,
    hex: c.hex,
    usage: c.usage,
  }));
  if (colors.length === 0 && opts.swatches && opts.swatches.length > 0) {
    colors = opts.swatches.map((hex, i) => ({ role: '', name: `Color ${i + 1}`, hex, usage: '' }));
  }

  let typography: DesignKit['typography'] = {
    display: parsed.typography.display
      ? { ...parsed.typography.display }
      : undefined,
    body: parsed.typography.body ? { ...parsed.typography.body } : undefined,
    mono: parsed.typography.mono ? { ...parsed.typography.mono } : undefined,
  };
  if (!typography.display && !typography.body) {
    typography = packageFontsToTypography(opts.packageInfo);
  }

  const layout: KitLayout = {
    radius: parsed.layout.radius,
    borderWeight: parsed.layout.borderWeight,
    spacing: parsed.layout.spacing,
    postureRules: parsed.layout.postureRules,
  };
  const imagery: KitImagery = {
    style: parsed.imagery.style,
    subjects: parsed.imagery.subjects,
    treatment: parsed.imagery.treatment,
    avoid: parsed.imagery.avoid,
    samples: [],
  };
  const staticUrl = !opts.editable && opts.designSystemId && opts.packageInfo?.manifest
    ? (rel: string): string => designSystemStaticUrl(opts.designSystemId!, rel)
    : null;

  return {
    designSystemId: opts.designSystemId,
    name: parsed.name?.trim() || opts.title || 'Design system',
    tagline: parsed.tagline?.trim() || undefined,
    description: parsed.description?.trim() || undefined,
    host: opts.host,
    projectId: opts.projectId,
    editable: opts.editable,
    canUpload: opts.editable && Boolean(opts.projectId),
    logoSrc: null,
    logoAlternates: [],
    colors,
    typography,
    fonts: fontList(typography),
    voice: hasVoice(parsed.voice) ? parsed.voice : undefined,
    imagery: hasImagery(imagery) ? imagery : undefined,
    layout: hasLayout(layout) ? layout : undefined,
    system: staticUrl
      ? {
          kitUrl: staticUrl('system/kit.html'),
          kitDarkUrl: staticUrl('system/kit.dark.html'),
          tokensUrl: staticUrl('system/tokens.default.json'),
          indexUrl: staticUrl('system/index.html'),
        }
      : undefined,
    assets: staticUrl
      ? ASSET_TILES.map((a) => ({ kind: a.kind, label: a.label, url: staticUrl(a.file) }))
      : undefined,
    showcaseHtml: opts.showcaseHtml ?? null,
  };
}

// ── kit loading hook ─────────────────────────────────────────────────────

export interface DesignKitSource {
  designSystemId: string;
  title: string;
  projectId?: string;
  /** DESIGN.md content, when the caller already has it (registry body). */
  body?: string;
  packageInfo?: DesignSystemPackageInfo;
  swatches?: string[];
  showcaseHtml?: string | null;
  editable: boolean;
  host?: string;
  /** Bump to force a brand.json re-read after an upload writes a module. */
  reloadKey?: number;
}

function tryParseBrand(raw: string | null): Brand | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<Brand>;
    if (data && typeof data === 'object' && typeof data.name === 'string' && Array.isArray(data.colors)) {
      return data as Brand;
    }
  } catch {
    // Not a valid brand.json — fall back to DESIGN.md parsing.
  }
  return null;
}

/**
 * Resolve a DesignKit for any design system. When a backing project carries a
 * writable `brand.json` we render the full brand kit (logo / imagery / kit /
 * assets); otherwise we derive the modules from the DESIGN.md body (presets and
 * non-brand systems). Returns null while the first async read is in flight.
 */
export function useDesignKit(source: DesignKitSource): { kit: DesignKit | null; loading: boolean } {
  const {
    designSystemId,
    title,
    projectId,
    body,
    packageInfo,
    swatches,
    showcaseHtml,
    editable,
    host,
    reloadKey,
  } = source;
  const [kit, setKit] = useState<DesignKit | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fromDesignMd = (designMd: string | undefined): DesignKit =>
      parsedToKit(parseDesignMd(designMd ?? ''), {
        designSystemId,
        projectId,
        editable,
        title,
        host,
        swatches,
        packageInfo,
        showcaseHtml,
        reloadKey,
      });

    if (!projectId) {
      setKit(fromDesignMd(body));
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void (async () => {
      // Fetch brand.json (richest) and DESIGN.md (fallback) together so the kit
      // resolves in a single async hop — brand.json wins when it is a valid kit.
      const [rawBrand, rawDesignMd] = await Promise.all([
        fetchProjectFileText(projectId, 'brand.json', { cache: 'no-store', cacheBustKey: reloadKey }),
        body != null
          ? Promise.resolve(body)
          : fetchProjectFileText(projectId, 'DESIGN.md', { cache: 'no-store', cacheBustKey: reloadKey }),
      ]);
      if (cancelled) return;
      const brand = tryParseBrand(rawBrand);
      if (brand) {
        const brandKit = brandToKit(brand, {
          designSystemId,
          projectId,
          editable,
          host,
          showcaseHtml,
          reloadKey,
        });
        setKit(mergeBrandKitWithDesignMd(brandKit, rawDesignMd ?? '', {
          designSystemId,
          projectId,
          editable,
          title,
          host,
          swatches,
          packageInfo,
          showcaseHtml,
        }));
      } else {
        setKit(fromDesignMd(rawDesignMd ?? ''));
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    designSystemId,
    title,
    projectId,
    body,
    packageInfo,
    swatches,
    showcaseHtml,
    editable,
    host,
    reloadKey,
  ]);

  return { kit, loading };
}
