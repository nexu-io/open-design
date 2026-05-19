import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SITE, type HtmlPage } from './types.ts';

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir).sort();
  return entries.flatMap((entry) => {
    const file = path.join(dir, entry);
    const stat = statSync(file);
    return stat.isDirectory() ? walk(file) : [file];
  });
}

function routePathForHtml(outDir: string, file: string): string | null {
  const rel = path.relative(outDir, file).replaceAll(path.sep, '/');
  if (!rel.endsWith('.html')) return null;
  if (rel === '404.html') return null;
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.replace(/\/index\.html$/, '')}/`;
  return `/${rel.replace(/\.html$/, '')}/`;
}

export function loadPages(outDir: string, site = DEFAULT_SITE): HtmlPage[] {
  return walk(outDir)
    .filter((file) => file.endsWith('.html'))
    .map((file) => {
      const routePath = routePathForHtml(outDir, file);
      if (!routePath) return null;
      return {
        file,
        routePath,
        url: new URL(routePath, site).toString(),
        html: readFileSync(file, 'utf8'),
      };
    })
    .filter((page): page is HtmlPage => Boolean(page));
}

export function loadSitemapUrls(outDir: string): Set<string> {
  const urls = new Set<string>();
  for (const file of walk(outDir).filter((f) => /sitemap.*\.xml$/.test(path.basename(f)))) {
    const xml = readFileSync(file, 'utf8');
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const url = match[1]?.trim();
      if (url) urls.add(url);
    }
  }
  return urls;
}

export function filesystemUrlsForPages(pages: HtmlPage[]): Set<string> {
  return new Set(pages.map((page) => page.url));
}

export function assetExists(outDir: string, pathname: string): boolean {
  const clean = decodeURIComponent(pathname).replace(/^\/+/, '');
  return existsSync(path.join(outDir, clean));
}
