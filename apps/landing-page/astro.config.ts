import sitemap, { type SitemapItem } from '@astrojs/sitemap';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AstroUserConfig } from 'astro';
import { defineConfig } from 'astro/config';

// Pull the Shiki theme shape off Astro's own config typing rather than
// importing from `shiki` directly — Shiki is a transitive dependency of
// Astro and not declared in this app's `package.json`. Indexing through
// `markdown.shikiConfig.theme` keeps the type in lockstep with whichever
// Shiki major Astro 6 currently bundles.
type ShikiThemeObject = Exclude<
  NonNullable<NonNullable<AstroUserConfig['markdown']>['shikiConfig']>['theme'],
  string | undefined
>;

// Custom Shiki theme tuned to the Atelier Zero palette in `globals.css`.
// Without this, Shiki injects inline `background-color:#24292e` (the
// default `github-dark` theme) on every `<pre>` and overrides our blog
// CSS, leaving a slate-dark slab in the middle of the cream paper layout.
// The theme below paints code blocks on `--bone` with `--ink` text, and
// reuses `--coral`, `--olive`, and `--ink-*` tokens for syntax accents so
// fenced blocks read as part of the editorial body, not a foreign widget.
const editorialPaperTheme: ShikiThemeObject = {
  name: 'open-design-editorial',
  type: 'light',
  colors: {
    'editor.background': '#f7f1de', // --bone
    'editor.foreground': '#15140f', // --ink
  },
  tokenColors: [
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: '#8b8676', fontStyle: 'italic' }, // --ink-faint
    },
    {
      scope: ['string', 'string.template', 'meta.string', 'string.quoted'],
      settings: { foreground: '#6e7448' }, // --olive
    },
    {
      scope: [
        'constant.numeric',
        'constant.language',
        'constant.character',
        'constant.other.symbol',
      ],
      settings: { foreground: '#ed6f5c' }, // --coral
    },
    {
      scope: [
        'keyword',
        'keyword.control',
        'keyword.operator.new',
        'keyword.operator.expression',
        'storage.type',
        'storage.modifier',
      ],
      settings: { foreground: '#ed6f5c' }, // --coral
    },
    {
      scope: ['entity.name.function', 'support.function', 'meta.function-call'],
      settings: { foreground: '#15140f', fontStyle: 'bold' }, // --ink
    },
    {
      scope: [
        'entity.name.class',
        'entity.name.type',
        'support.class',
        'support.type',
      ],
      settings: { foreground: '#15140f' }, // --ink
    },
    {
      scope: ['variable', 'variable.parameter', 'support.variable'],
      settings: { foreground: '#2a2620' }, // --ink-soft
    },
    {
      scope: ['punctuation', 'meta.brace', 'meta.delimiter'],
      settings: { foreground: '#5a5448' }, // --ink-mute
    },
    {
      scope: ['markup.heading', 'entity.name.section'],
      settings: { foreground: '#15140f', fontStyle: 'bold' },
    },
    { scope: 'markup.bold', settings: { fontStyle: 'bold' } },
    { scope: 'markup.italic', settings: { fontStyle: 'italic' } },
    {
      scope: ['markup.inline.raw', 'markup.fenced_code'],
      settings: { foreground: '#2a2620' },
    },
    {
      scope: ['variable.other.env', 'meta.environment-variable'],
      settings: { foreground: '#6e7448' }, // --olive
    },
  ],
};

// Production canonical origin. Used by Astro for `Astro.site`, by
// `@astrojs/sitemap` for every URL it emits, and by `index.astro` to
// build the `<link rel="canonical">` / `og:url` tags.
//
// `open-design.ai` is the live domain bound to the Cloudflare Pages
// project (`open-design-landing`); the env override exists so preview
// builds (Cloudflare Pages preview deployments, local previews on a
// different host) can stamp their own URL without forking the config.
const site = process.env.OD_LANDING_SITE ?? 'https://open-design.ai';
const changefreq = {
  daily: 'daily' as SitemapItem['changefreq'],
  weekly: 'weekly' as SitemapItem['changefreq'],
  monthly: 'monthly' as SitemapItem['changefreq'],
};

// Read blog post dates at config time so the sitemap can include lastmod.
const blogDir = join(import.meta.dirname, 'app/content/blog');
const blogDates = new Map<string, string>();
for (const file of readdirSync(blogDir)) {
  if (!file.endsWith('.md') || file.startsWith('_')) continue;
  const raw = readFileSync(join(blogDir, file), 'utf-8');
  const match = raw.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m);
  if (match) {
    const slug = file.replace(/\.md$/, '');
    blogDates.set(`/blog/${slug}/`, match[1]!);
  }
}

export default defineConfig({
  output: 'static',
  site,
  srcDir: './app',
  outDir: './out',
  trailingSlash: 'always',
  markdown: {
    // Use our paper-toned theme for fenced code blocks. Astro ships
    // Shiki under the hood and the default theme (`github-dark`)
    // inlines `background-color:#24292e` on every `<pre>`, which
    // overrides the cream `--bone` background defined in
    // `blog/[slug].astro` and produces a dark slab inside the
    // otherwise warm editorial layout — see the GitHub-dark output
    // in the prior live build for context.
    shikiConfig: {
      theme: editorialPaperTheme,
      wrap: false,
    },
  },
  integrations: [
    sitemap({
      // `/og/` is a screenshot surface for the 1200x630 Open Graph
      // image — it already carries `<meta name="robots" content="noindex">`
      // and is `Disallow`-ed from `public/robots.txt`. Filtering it
      // out of the sitemap keeps the index strictly canonical pages.
      filter: (page) => !page.includes('/og/'),
      serialize(item: SitemapItem) {
        const path = new URL(item.url).pathname;
        if (path === '/') {
          item.priority = 1.0;
          item.changefreq = changefreq.daily;
        } else if (path === '/blog/') {
          item.priority = 0.9;
          item.changefreq = changefreq.daily;
        } else if (path.startsWith('/blog/')) {
          item.priority = 0.8;
          item.changefreq = changefreq.weekly;
          const date = blogDates.get(path);
          if (date) item.lastmod = date;
        } else if (
          path === '/skills/' ||
          path === '/systems/' ||
          path === '/craft/'
        ) {
          item.priority = 0.7;
          item.changefreq = changefreq.weekly;
        } else {
          item.priority = 0.5;
          item.changefreq = changefreq.monthly;
        }
        return item;
      },
    }),
  ],
});
