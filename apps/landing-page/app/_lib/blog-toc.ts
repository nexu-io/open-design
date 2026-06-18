/*
 * Blog table-of-contents helpers.
 *
 * A blog post renders its body through one of two paths:
 *   1. Astro `<Content />` from the Markdown body (English source + any locale
 *      that has no `i18n.<locale>.bodyHtml`). Astro's Markdown renderer already
 *      stamps `id` attributes on headings and exposes a `headings` array, so we
 *      build the TOC straight from that.
 *   2. A pre-rendered `bodyHtml` string (rich posts, per locale). Raw HTML has
 *      no heading ids, so we inject them and collect the TOC in one pass.
 *
 * Both paths produce the same `TocEntry[]` shape so the shared <BlogToc />
 * component and the scroll-spy script work identically.
 */

export interface TocEntry {
  depth: 2 | 3;
  slug: string;
  text: string;
}

/** Slugify heading text. Keeps Unicode letters/numbers so CJK headings (rich
 * posts are localized) still produce a stable, non-empty anchor. */
export function slugifyHeading(input: string): string {
  return input
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Build a TOC from Astro's Markdown `headings` array (path 1). */
export function tocFromHeadings(
  headings: { depth: number; slug: string; text: string }[],
): TocEntry[] {
  return headings
    .filter((h) => h.depth === 2 || h.depth === 3)
    .map((h) => ({ depth: h.depth as 2 | 3, slug: h.slug, text: h.text }));
}

/**
 * Inject `id` attributes into the `<h2>`/`<h3>` tags of a bodyHtml string and
 * return both the rewritten HTML and the collected TOC (path 2). Existing ids
 * are preserved; duplicate slugs are de-duped with a numeric suffix.
 */
export function injectTocIntoHtml(html: string): { html: string; toc: TocEntry[] } {
  const toc: TocEntry[] = [];
  const seen = new Map<string, number>();

  const out = html.replace(
    /<(h2|h3)((?:\s[^>]*)?)>([\s\S]*?)<\/\1>/gi,
    (_match, tag: string, attrs: string, inner: string) => {
      const depth = tag.toLowerCase() === 'h2' ? 2 : 3;
      const text = inner
        .replace(/<[^>]+>/g, '')
        .replace(/&[a-z0-9#]+;/gi, ' ')
        .trim();

      const existingId = /\sid=["']([^"']+)["']/.exec(attrs);
      let slug = existingId?.[1] ?? slugifyHeading(text) ?? '';
      if (!slug) slug = 'section';
      const count = seen.get(slug) ?? 0;
      seen.set(slug, count + 1);
      if (count > 0 && !existingId) slug = `${slug}-${count}`;

      toc.push({ depth: depth as 2 | 3, slug, text });

      const attrsWithId = existingId ? attrs : `${attrs} id="${slug}"`;
      return `<${tag}${attrsWithId}>${inner}</${tag}>`;
    },
  );

  return { html: out, toc };
}
