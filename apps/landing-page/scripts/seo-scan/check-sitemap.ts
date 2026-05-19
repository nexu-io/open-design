import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Finding, SeoScanContext } from './types.ts';

function readText(outDir: string, file: string): string | null {
  const target = path.join(outDir, file);
  return existsSync(target) ? readFileSync(target, 'utf8') : null;
}

export function checkSitemap(ctx: SeoScanContext): Finding[] {
  const findings: Finding[] = [];

  for (const url of ctx.sitemapUrls) {
    if (!ctx.filesystemUrls.has(url)) {
      findings.push({
        severity: 'critical',
        code: 'sitemap-orphan',
        message: 'Sitemap URL does not resolve to a generated HTML page.',
        url,
      });
    }
  }
  for (const url of ctx.filesystemUrls) {
    if (new URL(url).pathname.startsWith('/og/')) continue;
    if (!ctx.sitemapUrls.has(url)) {
      findings.push({
        severity: 'critical',
        code: 'filesystem-orphan',
        message: 'Generated HTML page is missing from the sitemap.',
        url,
      });
    }
  }

  const robots = readText(ctx.outDir, 'robots.txt');
  if (!robots) {
    findings.push({ severity: 'critical', code: 'robots-missing', message: 'robots.txt is missing.' });
  } else {
    const sitemapLines = [...robots.matchAll(/^Sitemap:\s*(\S+)/gim)].map((m) => m[1]).filter(Boolean);
    if (sitemapLines.length === 0) {
      findings.push({ severity: 'warning', code: 'robots-sitemap-missing', message: 'robots.txt does not declare a sitemap.' });
    }
    for (const line of sitemapLines) {
      if (!line?.startsWith(ctx.site)) {
        findings.push({ severity: 'critical', code: 'robots-sitemap-host', message: 'robots.txt sitemap is outside the canonical site.', detail: { sitemap: line } });
      }
    }
    const disallows = [...robots.matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => m[1]).filter(Boolean);
    for (const disallow of disallows) {
      if (!disallow || disallow === '/') continue;
      for (const url of ctx.sitemapUrls) {
        if (new URL(url).pathname.startsWith(disallow)) {
          findings.push({ severity: 'critical', code: 'robots-blocks-sitemap', message: 'robots.txt disallows a sitemap URL.', url, detail: { disallow } });
        }
      }
    }
  }

  for (const file of ['llms.txt', 'blog/rss.xml', 'favicon.png', 'apple-touch-icon.png']) {
    const target = path.join(ctx.outDir, file);
    if (!existsSync(target)) {
      findings.push({ severity: 'critical', code: 'required-asset-missing', message: `${file} is missing from generated output.` });
    } else if (statSync(target).size === 0) {
      findings.push({ severity: 'critical', code: 'required-asset-empty', message: `${file} is empty.` });
    }
  }

  return findings;
}
