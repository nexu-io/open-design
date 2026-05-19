import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHead } from './check-head.ts';
import { checkJsonLd } from './check-jsonld.ts';
import { checkLinks } from './check-links.ts';
import { checkSitemap } from './check-sitemap.ts';
import { filesystemUrlsForPages, loadPages, loadSitemapUrls } from './crawl-out.ts';
import { makeReport, writeReports } from './report.ts';
import { DEFAULT_SITE, type SeoScanContext } from './types.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LANDING_ROOT = path.resolve(HERE, '../..');

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const outDir = path.resolve(LANDING_ROOT, arg('--out') ?? 'out');
const site = (arg('--site') ?? process.env.OD_LANDING_SITE ?? DEFAULT_SITE).replace(/\/$/, '');
const reportDir = path.resolve(outDir, 'seo-funnel');

if (!existsSync(outDir)) {
  throw new Error(`Rendered output does not exist: ${outDir}. Run astro build first.`);
}

const pages = loadPages(outDir, site);
const ctx: SeoScanContext = {
  outDir,
  reportDir,
  site,
  pages,
  sitemapUrls: loadSitemapUrls(outDir),
  filesystemUrls: filesystemUrlsForPages(pages),
};

const findings = [
  ...checkHead(ctx),
  ...checkJsonLd(ctx),
  ...checkLinks(ctx),
  ...checkSitemap(ctx),
].sort((a, b) => {
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  return severityOrder[a.severity] - severityOrder[b.severity] || a.code.localeCompare(b.code);
});

const report = makeReport(ctx, findings);
writeReports(ctx, report);

console.log(`SEO scan complete: ${pages.length} pages, ${report.totals.critical} critical, ${report.totals.warning} warnings.`);
console.log(`Report: ${path.relative(process.cwd(), path.join(reportDir, 'seo-scan-report.md'))}`);

if (process.argv.includes('--strict') && report.totals.critical > 0) {
  process.exitCode = 1;
}
