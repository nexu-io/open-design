/** Stable route groups emitted as `sitemap-<group>-<part>.xml`. */
export const SITEMAP_ENTRY_LIMIT = 10_000;

export const SITEMAP_CHUNK_NAMES = [
  'agents',
  'alternatives',
  'blog',
  'community',
  'craft',
  'plugins',
  'solutions',
  'stories',
  'tutorials',
] as const;

export type SitemapChunkName = (typeof SITEMAP_CHUNK_NAMES)[number] | 'pages';

const SITEMAP_CHUNK_NAME_SET = new Set<string>(SITEMAP_CHUNK_NAMES);

/**
 * Classify a locale-free pathname into its public sitemap route group.
 * Standalone pages such as `/about/` deliberately fall back to `pages`.
 */
export function sitemapChunkNameForPath(pathname: string): SitemapChunkName {
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  return firstSegment && SITEMAP_CHUNK_NAME_SET.has(firstSegment)
    ? (firstSegment as SitemapChunkName)
    : 'pages';
}
