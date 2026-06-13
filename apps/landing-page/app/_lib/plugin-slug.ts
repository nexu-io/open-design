// Local slug/path helpers for the static plugin pages.
//
// The marketing site must NOT import `@open-design/contracts` (see
// `apps/landing-page/AGENTS.md` boundary — contracts is the web/daemon
// product-runtime contract layer, and the static site stays build-only and
// isolated from it). The web client's Share links derive the SAME scheme from
// `packages/contracts/src/plugins/plugin-url.ts`; the two are intentionally
// kept byte-for-byte identical and verified in lockstep by the e2e route
// check (a shared plugin link must resolve to the page these helpers emit).
// If you change a rule here, mirror it there.

export function pluginSlugSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'plugin'
  );
}

// Single-segment detail slug = slugified last `/`-segment of the id, e.g.
// `open-design/Hero Deck` -> `hero-deck`. This is what `/plugins/[slug]/` uses.
export function pluginDetailSlug(id: string): string {
  const last = id.split('/').filter(Boolean).at(-1) ?? id;
  return pluginSlugSegment(last);
}

// Multi-segment slug preserving the namespace as a path separator, e.g.
// `open-design/Hero Deck` -> `open-design/hero-deck`.
export function pluginSlug(id: string): string {
  return id
    .split('/')
    .map(pluginSlugSegment)
    .join('/');
}

// Site-relative single-segment detail path, e.g. `/plugins/hero-deck/`.
export function pluginDetailPath(id: string): string {
  return `/plugins/${pluginDetailSlug(id)}/`;
}

// Site-relative namespaced preview path, e.g.
// `/plugins/previews/open-design/hero-deck/`.
export function pluginPreviewPath(id: string): string {
  return `/plugins/previews/${pluginSlug(id)}/`;
}
