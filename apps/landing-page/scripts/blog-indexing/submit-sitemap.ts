/*
 * submit-sitemap — one PUT to the GSC Sitemaps API per deploy.
 *
 *   Usage: tsx submit-sitemap.ts [--feed <url>]
 *
 * Default feed: https://open-design.ai/sitemap-index.xml.
 *
 * Rationale (blog-indexing-automation skill, Step 3): for standard blog
 * content prefer sitemap submission over per-URL forced indexing. One
 * call per deploy is enough — Google revisits sitemaps on its own
 * schedule once the property knows about them.
 */
import { SITEMAP_URL, submitSitemap } from './lib.ts';

function parseArgs(argv: string[]): { feed: string } {
  let feed = SITEMAP_URL;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--feed') feed = argv[++i];
  }
  return { feed };
}

async function main() {
  const { feed } = parseArgs(process.argv.slice(2));
  await submitSitemap(feed);
  console.log(`Submitted sitemap: ${feed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
