import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SITE } from './types.ts';

interface LiveFinding {
  severity: 'critical' | 'warning' | 'info';
  code: string;
  message: string;
  url?: string;
  detail?: Record<string, unknown>;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, { headers: { accept: 'text/plain, application/xml, text/xml, */*' } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.text();
}

async function head(url: string): Promise<Response> {
  const res = await fetchWithTimeout(url, { method: 'HEAD', redirect: 'follow' });
  if (res.status === 405) return fetchWithTimeout(url, { method: 'GET', redirect: 'follow' });
  return res;
}

async function sitemapUrls(site: string): Promise<string[]> {
  const index = await fetchText(new URL('/sitemap-index.xml', site).toString());
  const children = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!).filter(Boolean);
  const urls = new Set<string>();
  for (const child of children.length > 0 ? children : [new URL('/sitemap-0.xml', site).toString()]) {
    const xml = await fetchText(child);
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      if (match[1]) urls.add(match[1]);
    }
  }
  return [...urls].sort();
}

function writeReport(options: {
  outDir: string;
  site: string;
  urls: string[];
  sample: number;
  findings: LiveFinding[];
}) {
  const report = {
    scannedAt: new Date().toISOString(),
    site: options.site,
    urlsChecked: options.urls.length,
    sample: options.sample,
    totals: {
      critical: options.findings.filter((f) => f.severity === 'critical').length,
      warning: options.findings.filter((f) => f.severity === 'warning').length,
      info: options.findings.filter((f) => f.severity === 'info').length,
    },
    findings: options.findings,
  };

  mkdirSync(options.outDir, { recursive: true });
  writeFileSync(path.join(options.outDir, 'seo-live-report.json'), JSON.stringify(report, null, 2));
  writeFileSync(
    path.join(options.outDir, 'seo-live-report.md'),
    [
      '# Live SEO Probe',
      '',
      `Generated: ${report.scannedAt}`,
      `Site: ${options.site}`,
      `URLs checked: ${report.urlsChecked}`,
      '',
      `Critical: ${report.totals.critical}`,
      `Warning: ${report.totals.warning}`,
      '',
      ...options.findings.map((f) => `- \`${f.severity}/${f.code}\` ${f.url ?? options.site}: ${f.message}`),
      '',
    ].join('\n'),
  );
  return report;
}

async function main() {
  const site = (arg('--site') ?? process.env.OD_LANDING_SITE ?? DEFAULT_SITE).replace(/\/$/, '');
  const sample = Number(arg('--sample') ?? '12');
  const limit = arg('--limit') ? Number(arg('--limit')) : undefined;
  const outDir = path.resolve(process.cwd(), arg('--out') ?? 'out/seo-funnel');
  const findings: LiveFinding[] = [];
  let urls: string[] = [];

  try {
    urls = await sitemapUrls(site);
    if (limit && Number.isFinite(limit) && limit > 0) urls = urls.slice(0, limit);
  } catch (error) {
    findings.push({
      severity: 'critical',
      code: 'live-sitemap-fetch',
      message: `Could not fetch live sitemap: ${error instanceof Error ? error.message : String(error)}`,
      url: new URL('/sitemap-index.xml', site).toString(),
    });
    const report = writeReport({ outDir, site, urls, sample, findings });
    console.log(`Live SEO probe complete: ${report.totals.critical} critical, ${report.totals.warning} warnings.`);
    return;
  }

  for (const url of urls) {
    try {
      const res = await head(url);
      const finalUrl = res.url.replace(/\/$/, '/');
      if (!res.ok) {
        findings.push({ severity: 'critical', code: 'live-url-status', message: `URL returned ${res.status}.`, url });
      }
      if (new URL(finalUrl).origin !== site) {
        findings.push({ severity: 'critical', code: 'live-url-origin', message: 'URL redirects outside canonical origin.', url, detail: { finalUrl } });
      }
      const type = res.headers.get('content-type') ?? '';
      if (!type.includes('text/html')) {
        findings.push({ severity: 'warning', code: 'live-content-type', message: 'Sitemap URL is not served as text/html.', url, detail: { contentType: type } });
      }
      if (res.headers.get('x-robots-tag')?.includes('noindex')) {
        findings.push({ severity: 'critical', code: 'live-x-robots-noindex', message: 'Sitemap URL has x-robots-tag noindex.', url });
      }
    } catch (error) {
      findings.push({ severity: 'critical', code: 'live-url-fetch', message: error instanceof Error ? error.message : String(error), url });
    }
  }

  for (const asset of ['/robots.txt', '/llms.txt', '/blog/rss.xml', '/favicon.png', '/apple-touch-icon.png']) {
    const url = new URL(asset, site).toString();
    try {
      const res = await head(url);
      if (!res.ok) findings.push({ severity: 'critical', code: 'live-asset-status', message: `${asset} returned ${res.status}.`, url });
    } catch (error) {
      findings.push({ severity: 'critical', code: 'live-asset-fetch', message: error instanceof Error ? error.message : String(error), url });
    }
  }

  try {
    const httpRes = await fetchWithTimeout(site.replace(/^https:/, 'http:'), { redirect: 'manual' });
    if (![301, 302, 307, 308].includes(httpRes.status)) {
      findings.push({ severity: 'warning', code: 'http-redirect', message: 'HTTP origin did not return a redirect to HTTPS.', url: site.replace(/^https:/, 'http:') });
    }
  } catch (error) {
    findings.push({ severity: 'warning', code: 'http-redirect-fetch', message: error instanceof Error ? error.message : String(error), url: site.replace(/^https:/, 'http:') });
  }

  for (const url of urls.slice(0, sample)) {
    try {
      const res = await fetchWithTimeout(url);
      const html = await res.text();
      if (!/<link\b[^>]*rel=['"]canonical['"]/i.test(html)) {
        findings.push({ severity: 'critical', code: 'live-missing-canonical', message: 'Sampled live page is missing canonical.', url });
      }
    } catch (error) {
      findings.push({ severity: 'critical', code: 'live-sample-fetch', message: error instanceof Error ? error.message : String(error), url });
    }
  }

  const report = writeReport({ outDir, site, urls, sample, findings });
  console.log(`Live SEO probe complete: ${report.totals.critical} critical, ${report.totals.warning} warnings.`);
}

await main();
