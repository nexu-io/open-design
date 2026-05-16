import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// Production canonical origin. Used by Astro for `Astro.site`, by
// `@astrojs/sitemap` for every URL it emits, and by `index.astro` to
// build the `<link rel="canonical">` / `og:url` tags.
//
// `open-design.ai` is the live domain bound to the Cloudflare Pages
// project (`open-design-landing`); the env override exists so preview
// builds (Cloudflare Pages preview deployments, local previews on a
// different host) can stamp their own URL without forking the config.
const site = process.env.OD_LANDING_SITE ?? 'https://open-design.ai';

export default defineConfig({
  output: 'static',
  site,
  srcDir: './app',
  outDir: './out',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      // `/og/` is a screenshot surface for the 1200x630 Open Graph
      // image — it already carries `<meta name="robots" content="noindex">`
      // and is `Disallow`-ed from `public/robots.txt`. Filtering it
      // out of the sitemap keeps the index strictly canonical pages.
      filter: (page) => !page.includes('/og/'),
    }),
  ],
});
