const FONT_HOSTS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'use.typekit.net',
  'fonts.bunny.net',
  'fonts.cdnfonts.com',
]);

/**
 * Font-CDN stylesheets are reloaded outside the artifact document, so only
 * absolute HTTPS URLs on the exact product allowlist are safe to promote.
 */
export function isApprovedFontStylesheetHref(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && FONT_HOSTS.has(url.hostname.toLowerCase());
}
