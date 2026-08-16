/**
 * Shared, browser-API-free resource policy for generated design previews.
 *
 * Generated HTML is untrusted. These profiles grant only the resources needed
 * by each rendering surface while preserving its existing script, origin, and
 * daemon-API containment boundary.
 */

export const PREVIEW_RESOURCE_PROFILES = {
  CONTAINED_PROJECT: 'contained-project',
  INERT_LIVE_ARTIFACT: 'inert-live-artifact',
  EXTENSION_PREVIEW: 'extension-preview',
} as const;

export type PreviewResourceProfile =
  typeof PREVIEW_RESOURCE_PROFILES[keyof typeof PREVIEW_RESOURCE_PROFILES];

export interface PreviewFontProvider {
  id: string;
  stylesheetOrigins: readonly string[];
  fontOrigins: readonly string[];
}

export const PREVIEW_FONT_PROVIDERS: readonly PreviewFontProvider[] = Object.freeze([
  Object.freeze({
    id: 'google-fonts',
    stylesheetOrigins: Object.freeze(['https://fonts.googleapis.com']),
    fontOrigins: Object.freeze(['https://fonts.gstatic.com']),
  }),
  Object.freeze({
    id: 'adobe-typekit',
    stylesheetOrigins: Object.freeze(['https://use.typekit.net']),
    fontOrigins: Object.freeze(['https://use.typekit.net']),
  }),
  Object.freeze({
    id: 'bunny-fonts',
    stylesheetOrigins: Object.freeze(['https://fonts.bunny.net']),
    fontOrigins: Object.freeze(['https://fonts.bunny.net']),
  }),
  Object.freeze({
    id: 'cdnfonts',
    stylesheetOrigins: Object.freeze(['https://fonts.cdnfonts.com']),
    fontOrigins: Object.freeze(['https://fonts.cdnfonts.com']),
  }),
]);

export const PREVIEW_FONT_STYLESHEET_ORIGINS: readonly string[] = Object.freeze(
  Array.from(new Set(PREVIEW_FONT_PROVIDERS.flatMap((provider) => provider.stylesheetOrigins))),
);

export const PREVIEW_FONT_FILE_ORIGINS: readonly string[] = Object.freeze(
  Array.from(new Set(PREVIEW_FONT_PROVIDERS.flatMap((provider) => provider.fontOrigins))),
);

const stylesheetOrigins = new Set(PREVIEW_FONT_STYLESHEET_ORIGINS);
const fontFileOrigins = new Set(PREVIEW_FONT_FILE_ORIGINS);

function isApprovedHttpsUrl(value: string, origins: ReadonlySet<string>): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  return origins.has(url.origin);
}

export function isApprovedPreviewFontStylesheetUrl(value: string): boolean {
  return isApprovedHttpsUrl(value, stylesheetOrigins);
}

export function isApprovedPreviewFontFileUrl(value: string): boolean {
  return isApprovedHttpsUrl(value, fontFileOrigins);
}

function directive(name: string, ...sources: readonly string[]): string {
  return [name, ...sources].join(' ');
}

/** Build the canonical CSP for an HTML preview profile. */
export function buildPreviewResourceCsp(profile: PreviewResourceProfile): string {
  const stylesheetSources = PREVIEW_FONT_STYLESHEET_ORIGINS;
  const fontSources = PREVIEW_FONT_FILE_ORIGINS;

  if (profile === PREVIEW_RESOURCE_PROFILES.CONTAINED_PROJECT) {
    return [
      'sandbox allow-scripts allow-forms',
      "default-src 'self' data: blob:",
      "img-src 'self' data: blob:",
      "media-src 'self' data: blob:",
      directive('font-src', "'self'", 'data:', ...fontSources),
      directive('style-src', "'self'", "'unsafe-inline'", ...stylesheetSources),
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
      "object-src 'none'",
    ].join('; ');
  }

  if (profile === PREVIEW_RESOURCE_PROFILES.INERT_LIVE_ARTIFACT) {
    return [
      "default-src 'none'",
      "base-uri 'none'",
      "script-src 'none'",
      "object-src 'none'",
      "connect-src 'none'",
      "form-action 'none'",
      "frame-ancestors 'self'",
      "img-src 'self' data: blob:",
      directive('font-src', "'self'", 'data:', ...fontSources),
      directive('style-src', "'unsafe-inline'", ...stylesheetSources),
      'sandbox allow-same-origin',
    ].join('; ');
  }

  return [
    "default-src 'none'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'none'",
    "frame-ancestors 'self'",
  ].join('; ');
}
