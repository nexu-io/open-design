// Brand-kit HTML renderer.
//
// Turns a (possibly partial) brand.json into a self-contained `brand.html`
// "aha" page by injecting a JSON payload into the template the brand-extract
// skill ships (`skills/brand-extract/templates/brand-kit.html`). The page is
// deterministic and never agent-authored: the agent only writes brand.json and
// asks the daemon to (re)render, so the user watches a real, on-brand kit fill
// in instead of just a scrolling chat. While `status === 'extracting'` the page
// soft-reloads itself, so each `od brand preview` pass shows up live.

import fs from 'node:fs';
import path from 'node:path';

import type { ProjectMetadata } from '@open-design/contracts';

import { resolveProjectDir, writeProjectFile } from '../projects.js';
import { fontFaceCss, readFontManifest } from './fonts.js';

/** Location of the bundled template relative to the daemon's skills root. */
const BRAND_KIT_TEMPLATE_REL = path.join('brand-extract', 'templates', 'brand-kit.html');

/** The file the rendered kit is written to inside the extraction project. */
export const BRAND_KIT_FILE = 'brand.html';

const PAYLOAD_TOKEN = '__OD_BRAND_PAYLOAD__';
const FONTFACE_TOKEN = '__OD_BRAND_FONTFACE__';

/** Token-engine fields the kit page surfaces as design-system chips. */
interface BrandKitTokenSubset {
  colorPrimary?: string;
  colorPrimaryBg?: string;
  colorPrimaryHover?: string;
  colorPrimaryActive?: string;
  fontSize?: number;
  borderRadius?: number;
}

interface BrandKitSystem {
  indexHref: string | null;
  kitHref: string;
  kitDarkHref: string | null;
  themes: string[];
  tokens: BrandKitTokenSubset | null;
}

/** The six brand assets the deterministic system builder emits, in the order
 *  the kit page lists them. `href` is relative to `brand.html` at the project
 *  root so links resolve under the FileViewer's raw URL load. */
export const BRAND_KIT_ASSET_DEFS: ReadonlyArray<{
  kind: string;
  label: string;
  desc: string;
  href: string;
}> = [
  { kind: 'landing', label: 'Landing page', desc: 'Hero, features, CTA — the brand’s web face', href: 'system/artifacts/landing.html' },
  { kind: 'deck', label: 'Pitch deck', desc: '16:9 slides with keyboard navigation', href: 'system/artifacts/deck.html' },
  { kind: 'poster', label: 'Poster', desc: 'Print-style key-art poster', href: 'system/artifacts/poster.html' },
  { kind: 'email', label: 'Email', desc: 'Bulletproof table-layout HTML email', href: 'system/artifacts/email.html' },
  { kind: 'newsletter', label: 'Newsletter', desc: 'Multi-story email digest', href: 'system/artifacts/newsletter.html' },
  { kind: 'form', label: 'Form page', desc: 'Signup / contact form, brand-styled', href: 'system/artifacts/form.html' },
];

let cachedTemplate: { root: string; html: string } | null = null;

/** Read (and cache) the bundled brand-kit template from the skills root. */
export function loadBrandKitTemplate(skillsRoot: string): string {
  if (cachedTemplate && cachedTemplate.root === skillsRoot) return cachedTemplate.html;
  const file = path.join(skillsRoot, BRAND_KIT_TEMPLATE_REL);
  const html = fs.readFileSync(file, 'utf8');
  cachedTemplate = { root: skillsRoot, html };
  return html;
}

export interface BrandKitPayload {
  status: 'extracting' | 'ready';
  host: string;
  brand: Record<string, unknown>;
  assets: Array<{ kind: string; label: string; desc: string; href: string; available: boolean }>;
  system: BrandKitSystem | null;
  brandMd: { href: string } | null;
}

/** Embed the payload (and optional self-hosted @font-face CSS) into the
 *  template, neutralizing any `</script>` in the JSON so the inline data block
 *  cannot break out of its own tag. */
export function renderBrandKitHtml(
  template: string,
  payload: BrandKitPayload,
  fontFace = '',
): string {
  // Escape `</` (script-tag breakout) and the U+2028/U+2029 line separators
  // that are valid JSON but illegal in JS string literals / inline scripts.
  const json = JSON.stringify(payload)
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  // Replace every occurrence so a stray token in markup can never leave the
  // real data block un-substituted.
  return template
    .split(PAYLOAD_TOKEN)
    .join(json)
    .split(FONTFACE_TOKEN)
    .join(fontFace);
}

/** Read the six engine tokens the kit chips show from a tokens.default.json. */
function readTokenSubset(absPath: string): BrandKitTokenSubset | null {
  try {
    const raw = JSON.parse(fs.readFileSync(absPath, 'utf8')) as Record<string, unknown>;
    const out: BrandKitTokenSubset = {};
    if (typeof raw.colorPrimary === 'string') out.colorPrimary = raw.colorPrimary;
    if (typeof raw.colorPrimaryBg === 'string') out.colorPrimaryBg = raw.colorPrimaryBg;
    if (typeof raw.colorPrimaryHover === 'string') out.colorPrimaryHover = raw.colorPrimaryHover;
    if (typeof raw.colorPrimaryActive === 'string') out.colorPrimaryActive = raw.colorPrimaryActive;
    if (typeof raw.fontSize === 'number') out.fontSize = raw.fontSize;
    if (typeof raw.borderRadius === 'number') out.borderRadius = raw.borderRadius;
    return out.colorPrimary ? out : null;
  } catch {
    return null;
  }
}

/** Build the design-system payload from the project's `system/` output. Returns
 *  null until the deterministic builder has run (i.e. before finalize). */
function readSystem(projectDir: string): BrandKitSystem | null {
  if (!fileExists(path.join(projectDir, 'system', 'kit.html'))) return null;
  return {
    indexHref: fileExists(path.join(projectDir, 'system', 'index.html')) ? 'system/index.html' : null,
    kitHref: 'system/kit.html',
    kitDarkHref: fileExists(path.join(projectDir, 'system', 'kit.dark.html')) ? 'system/kit.dark.html' : null,
    themes: ['default', 'dark', 'compact'],
    tokens: readTokenSubset(path.join(projectDir, 'system', 'tokens.default.json')),
  };
}

function hostOf(brand: Record<string, unknown>, fallback: string): string {
  const url = typeof brand.sourceUrl === 'string' ? brand.sourceUrl : '';
  try {
    return url ? new URL(url).hostname.replace(/^www\./i, '') : fallback;
  } catch {
    return fallback;
  }
}

/** True when a built artifact already exists in the project (so the kit can
 *  show a live preview tile instead of a pending placeholder). */
function fileExists(absPath: string): boolean {
  try {
    return fs.statSync(absPath).isFile();
  } catch {
    return false;
  }
}

export interface WriteBrandKitOptions {
  skillsRoot: string;
  projectsRoot: string;
  projectId: string;
  brand: Record<string, unknown>;
  status: 'extracting' | 'ready';
  /** Fallback host label before brand.sourceUrl is known. */
  host?: string;
  metadata?: ProjectMetadata;
}

/**
 * Render `brand.html` from the given (partial) brand and write it into the
 * extraction project. Asset tiles light up automatically once the matching
 * `system/artifacts/<kind>.html` exists in the project (i.e. after finalize).
 * Best-effort: returns false (without throwing) when the template or project
 * dir cannot be resolved, so seeding/preview never blocks the main flow.
 */
export async function writeBrandKitPreview(opts: WriteBrandKitOptions): Promise<boolean> {
  let template: string;
  try {
    template = loadBrandKitTemplate(opts.skillsRoot);
  } catch {
    return false;
  }
  let projectDir: string;
  try {
    projectDir = resolveProjectDir(opts.projectsRoot, opts.projectId, opts.metadata);
  } catch {
    return false;
  }
  const host = hostOf(opts.brand, opts.host ?? 'Brand');
  const brandMdAvailable = fileExists(path.join(projectDir, 'BRAND.md'));
  const assets = BRAND_KIT_ASSET_DEFS.map((def) => ({
    kind: def.kind,
    label: def.label,
    desc: def.desc,
    href: def.href,
    available: fileExists(path.join(projectDir, ...def.href.split('/'))),
  }));
  const payload: BrandKitPayload = {
    status: opts.status,
    host,
    brand: opts.brand,
    assets,
    system: readSystem(projectDir),
    brandMd: brandMdAvailable ? { href: 'BRAND.md' } : null,
  };
  // Self-host the harvested webfonts (if any) so specimens + the kit render in
  // the brand's real typefaces; urls are relative to the project's fonts/.
  let fontFace = '';
  try {
    const fonts = readFontManifest(projectDir);
    if (fonts.length) fontFace = fontFaceCss(fonts, 'fonts/');
  } catch {
    fontFace = '';
  }
  const html = renderBrandKitHtml(template, payload, fontFace);
  try {
    await writeProjectFile(
      opts.projectsRoot,
      opts.projectId,
      BRAND_KIT_FILE,
      html,
      { overwrite: true },
      opts.metadata,
    );
  } catch {
    return false;
  }
  return true;
}
