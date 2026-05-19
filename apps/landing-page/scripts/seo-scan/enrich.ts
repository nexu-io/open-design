import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inspectUrl } from '../blog-indexing/lib.ts';
import { DEFAULT_SITE } from './types.ts';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function urlsFromSitemap(site: string): Promise<string[]> {
  const index = await fetch(new URL('/sitemap-index.xml', site));
  if (!index.ok) throw new Error(`sitemap-index.xml returned ${index.status}`);
  const indexXml = await index.text();
  const children = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!).filter(Boolean);
  const urls = new Set<string>();
  for (const child of children) {
    const res = await fetch(child);
    if (!res.ok) continue;
    const xml = await res.text();
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      if (match[1]) urls.add(match[1]);
    }
  }
  return [...urls].sort();
}

async function maybeInspect(urls: string[]) {
  const hasOauth = process.env.GSC_OAUTH_CLIENT_ID && process.env.GSC_OAUTH_CLIENT_SECRET && process.env.GSC_OAUTH_REFRESH_TOKEN;
  const hasServiceAccount = process.env.GSC_SERVICE_ACCOUNT_KEY;
  if (!hasOauth && !hasServiceAccount) return { skipped: 'No GSC auth configured.' };
  const records = [];
  for (const url of urls) {
    try {
      records.push({ url, result: await inspectUrl(url) });
    } catch (error) {
      records.push({ url, result: { error: error instanceof Error ? error.message : String(error) } });
    }
  }
  return records;
}

async function pageSpeed(urls: string[]) {
  const records = [];
  for (const url of urls) {
    const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    endpoint.searchParams.set('url', url);
    endpoint.searchParams.set('strategy', 'mobile');
    endpoint.searchParams.set('category', 'performance');
    if (process.env.PAGESPEED_API_KEY) endpoint.searchParams.set('key', process.env.PAGESPEED_API_KEY);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const body = await res.json() as {
        loadingExperience?: { metrics?: Record<string, { percentile?: number }> };
        lighthouseResult?: { audits?: Record<string, { numericValue?: number; displayValue?: string }> };
      };
      records.push({
        url,
        field: body.loadingExperience?.metrics ?? null,
        lab: {
          lcp: body.lighthouseResult?.audits?.['largest-contentful-paint']?.displayValue,
          cls: body.lighthouseResult?.audits?.['cumulative-layout-shift']?.displayValue,
          tbt: body.lighthouseResult?.audits?.['total-blocking-time']?.displayValue,
        },
      });
    } catch (error) {
      records.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return records;
}

function schemaBlocks(reportPath: string) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
    findings?: Array<{ code?: string; severity?: string; url?: string; message?: string }>;
  };
  return {
    localJsonLdFindings: (report.findings ?? []).filter((finding) => finding.code?.startsWith('jsonld-')),
    validatorNote:
      'Local JSON-LD parsing is included here. Run validator.schema.org manually for rich-result semantics when schema changes are large.',
  };
}

const site = (arg('--site') ?? process.env.OD_LANDING_SITE ?? DEFAULT_SITE).replace(/\/$/, '');
const reportDir = path.resolve(process.cwd(), arg('--out') ?? 'out/seo-funnel');
const sample = Number(arg('--sample') ?? '8');
const urls = (await urlsFromSitemap(site)).slice(0, sample);
const reportPath = path.join(reportDir, 'seo-scan-report.json');

const enriched = {
  enrichedAt: new Date().toISOString(),
  site,
  urls,
  gsc: await maybeInspect(urls),
  pageSpeed: await pageSpeed(urls.slice(0, Math.min(5, urls.length))),
  schema: schemaBlocks(reportPath),
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(path.join(reportDir, 'seo-enrichment-report.json'), JSON.stringify(enriched, null, 2));
writeFileSync(
  path.join(reportDir, 'seo-enrichment-report.md'),
  [
    '# SEO Enrichment Report',
    '',
    `Generated: ${enriched.enrichedAt}`,
    `Site: ${site}`,
    `URLs sampled: ${urls.length}`,
    '',
    '## Google Search Console',
    '',
    Array.isArray(enriched.gsc) ? `Records: ${enriched.gsc.length}` : `Skipped: ${enriched.gsc.skipped}`,
    '',
    '## PageSpeed',
    '',
    ...enriched.pageSpeed.map((item) => `- ${item.url}: ${'error' in item ? item.error : `LCP ${item.lab.lcp ?? 'n/a'}, CLS ${item.lab.cls ?? 'n/a'}`}`),
    '',
    '## Schema',
    '',
    `Local JSON-LD findings: ${enriched.schema.localJsonLdFindings.length}`,
    enriched.schema.validatorNote,
    '',
  ].join('\n'),
);

console.log(`SEO enrichment report written to ${path.relative(process.cwd(), reportDir)}.`);
