const R2_PUBLIC_ORIGIN = 'https://static.open-design.ai';
const IMAGE_RESIZING_ORIGIN = R2_PUBLIC_ORIGIN;
const ASSET_PREFIX = 'landing/assets';

type ImageOptions = {
  width: number;
  quality?: number;
};

export function r2Asset(name: string): string {
  return `${R2_PUBLIC_ORIGIN}/${ASSET_PREFIX}/${name}`;
}

export function imageAsset(name: string, { width, quality = 85 }: ImageOptions): string {
  const options = `width=${width},quality=${quality},format=auto`;
  return `${IMAGE_RESIZING_ORIGIN}/cdn-cgi/image/${options}/${r2Asset(name)}`;
}

/**
 * Build a responsive `srcset` value. Each width gets its own Cloudflare
 * Image Resizing variant; the browser picks the closest match to
 * `sizes × devicePixelRatio`.
 *
 * Why this exists: a single 1024-wide variant was hurting both ends —
 * retina desktops repaint when a higher-DPR copy arrives (LCP P99 long
 * tail), and phones download more bytes than they need.
 */
export function imageAssetSrcset(
  name: string,
  widths: number[],
  quality = 82,
): string {
  return widths
    .map((width) => `${imageAsset(name, { width, quality })} ${width}w`)
    .join(', ');
}

// Homepage hero art, served as local assets straight from the site origin.
//
// `heroImage` is the PNG kept ONLY for `og:image` / `twitter:image`: social
// crawlers (Facebook, Twitter, LinkedIn, …) have spotty WebP support, so the
// share card must stay a PNG.
export const heroImage = '/hero-home.png?v=2';
export const labStageImage = '/lab-stage-bg.webp';

// The visible full-bleed hero backdrop renders from responsive WebP variants
// instead — the source 2880px PNG was a 326KB single file served to every
// device (mobile included); these range 33KB (960w) → 110KB (2880w) at q90, so
// each viewport downloads only what it paints. `heroBgImage` is the default
// `src` fallback for browsers that ignore `srcset`.
export const heroBgImage = '/hero-home-1440.webp?v=3';
export const heroBgSrcset = [
  '/hero-home-960.webp?v=3 960w',
  '/hero-home-1440.webp?v=3 1440w',
  '/hero-home-1920.webp?v=3 1920w',
  '/hero-home-2880.webp?v=3 2880w',
].join(', ');

// Hero product screenshot — responsive WebP so phones don't pull the 2508px
// retina master. Largest variant is the pristine original (no re-encode).
export const heroProductImage = '/hero-product-1280.webp?v=3';
export const heroProductSrcset = [
  '/hero-product-800.webp?v=3 800w',
  '/hero-product-1280.webp?v=3 1280w',
  '/hero-product-1920.webp?v=3 1920w',
  '/hero-product-2508.webp?v=3 2508w',
].join(', ');

/**
 * Default Open Graph card image — the purpose-built 1200×630 brand plate
 * (light paper, lime highlight, "official open-source Claude Design
 * alternative" headline). Used site-wide by every page that doesn't
 * supply its own card. Referenced as the raw R2 object (not via the
 * `cdn-cgi/image` resizer) so social crawlers always receive a real PNG
 * at exactly 1200×630 — `format=auto` would hand some of them WebP.
 *
 * Source of truth for the artwork is the `/og/` route (`pages/og.astro`):
 * render it at viewport 1200×630, screenshot, then upload the PNG to
 * R2 at `landing/assets/og-card.png`.
 */
export const ogDefaultImage = r2Asset('og-card.png');
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/**
 * 1×1 transparent SVG used as the initial `src` for precise-lazyloaded
 * `<img>` elements. Inline data URI (~120 bytes) so it parses zero-RTT
 * regardless of cache state. The real image URL lives in
 * `data-precise-src` and is swapped in by the global IntersectionObserver
 * script (`precise-lazyload.astro`) once the element enters the rootMargin
 * window.
 */
export const PRECISE_LAZY_PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201%201%22%2F%3E';
