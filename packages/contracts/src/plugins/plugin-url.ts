// Single source of truth for the public marketplace URL scheme of a plugin.
//
// Both surfaces that link to a plugin's public detail page derive their URLs
// here so they can never drift:
//   - the web client's plugin Share menu (`apps/web` PluginShareMenu)
//   - the landing site's statically generated detail routes
//     (`apps/landing-page`)
//
// The detail route is single-segment — `/plugins/<slug>/` — where the slug is
// the slugified LAST segment of the plugin id. Plugin ids are globally unique
// on their last segment across the whole registry (verified), so a single
// segment keeps the route collision-free and lets `open-design/foo` (registry
// catalog id) and `foo` (bundled manifest id) resolve to the same page.
//
// Keep this module pure (no env, no fs, no browser globals): a self-hosted
// daemon that wants a different origin reads its env and passes `origin` in —
// this file never reads env.

// Canonical public site origin for shareable plugin links.
export const OPEN_DESIGN_SITE_ORIGIN = 'https://open-design.ai';

// Slugify one path segment: lower-cased, non-url-safe runs collapsed to `-`,
// leading/trailing `-` trimmed. Must match the landing site byte-for-byte.
export function pluginSlugSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'plugin'
  );
}

// Single-segment detail slug = slugified last `/`-segment of the id, e.g.
// `open-design/Hero Deck` -> `hero-deck`, `live-dashboard` -> `live-dashboard`.
// This is what the `/plugins/[slug]/` route uses.
export function pluginDetailSlug(id: string): string {
  const last = id.split('/').filter(Boolean).at(-1) ?? id;
  return pluginSlugSegment(last);
}

// Multi-segment slug preserving the namespace as a path separator, e.g.
// `open-design/Hero Deck` -> `open-design/hero-deck`. Used for the namespaced
// preview route and any list data attributes that want full provenance.
export function pluginSlug(id: string): string {
  return id
    .split('/')
    .map(pluginSlugSegment)
    .join('/');
}

// Site-relative single-segment detail-page path. Trailing slash matches the
// landing site's emitted route. e.g. `/plugins/hero-deck/`.
export function pluginDetailPath(id: string): string {
  return `/plugins/${pluginDetailSlug(id)}/`;
}

// Site-relative namespaced live-HTML preview path, e.g.
// `/plugins/previews/open-design/hero-deck/`.
export function pluginPreviewPath(id: string): string {
  return `/plugins/previews/${pluginSlug(id)}/`;
}

// Fully-qualified shareable URL for a plugin detail page. `origin` defaults to
// the public site; a self-hosted daemon may pass its own origin (read from env
// on the daemon side, never here). A trailing slash on `origin` is trimmed so
// we never emit `//plugins/...`.
export function pluginShareUrl(
  id: string,
  origin: string = OPEN_DESIGN_SITE_ORIGIN,
): string {
  return `${origin.replace(/\/+$/, '')}${pluginDetailPath(id)}`;
}
