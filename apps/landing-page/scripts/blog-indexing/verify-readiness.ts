/*
 * verify-readiness — checks that each URL in the input is *operationally*
 * ready for indexing. Per blog-indexing-automation skill Step 2:
 *
 *   - URL returns 200
 *   - page is not noindex
 *   - canonical points to the intended URL
 *   - page is present in sitemap output
 *
 * Polls each URL with a short backoff so the script can be invoked
 * immediately after `landing-page-deploy` completes (Cloudflare Pages
 * propagation usually < 60 s but not guaranteed).
 *
 *   Usage: tsx verify-readiness.ts --urls <file.json> [--out file.json] [--timeout-ms 180000]
 *
 * Input JSON: { addedUrls: string[], modifiedUrls?: string[] }.
 * Output JSON: array of ReadinessResult — exits non-zero if any URL is not ready.
 */
import { writeFileSync } from 'node:fs';
import {
  type ReadinessResult,
  SITE,
  SITEMAP_CHILD_URL,
  fetchWithRetry,
  readJsonFile,
  sleep,
} from './lib.ts';

interface Args {
  urls: string;
  out?: string;
  timeoutMs: number;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--urls') args.urls = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--timeout-ms') args.timeoutMs = Number(argv[++i]);
  }
  if (!args.urls) throw new Error('--urls is required');
  return { timeoutMs: 180_000, ...args } as Args;
}

async function fetchOnce(url: string): Promise<{ status: number; body: string }> {
  const res = await fetchWithRetry(url, {
    redirect: 'manual',
    headers: { 'user-agent': 'OpenDesignBlogIndexingBot/1.0' },
  });
  return { status: res.status, body: await res.text() };
}

async function fetchSitemapUrls(): Promise<Set<string>> {
  const res = await fetchWithRetry(SITEMAP_CHILD_URL);
  if (!res.ok) {
    throw new Error(`Sitemap fetch failed (${res.status}) at ${SITEMAP_CHILD_URL}`);
  }
  const xml = await res.text();
  // Sitemap entries are emitted as <url><loc>https://...</loc></url>.
  // A regex is safer than a full XML parser for this CI surface.
  return new Set(
    Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1].trim()),
  );
}

async function waitForSitemapUrls(urls: string[], timeoutMs: number): Promise<Set<string>> {
  const deadline = Date.now() + timeoutMs;
  let sitemap = new Set<string>();
  let delay = 5_000;
  while (Date.now() < deadline) {
    sitemap = await fetchSitemapUrls();
    if (urls.every((url) => sitemap.has(url))) return sitemap;
    await sleep(delay);
    delay = Math.min(delay * 2, 30_000);
  }
  return sitemap;
}

function findCanonical(html: string): string | undefined {
  const m = html.match(
    /<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["']/i,
  );
  return m?.[1];
}

function hasNoindex(html: string): boolean {
  return /<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["'][^"']*\bnoindex\b[^"']*["']/i.test(
    html,
  );
}

async function checkUrl(
  url: string,
  sitemap: Set<string>,
  timeoutMs: number,
): Promise<ReadinessResult> {
  const failures: string[] = [];
  let status: number | undefined;
  let canonical: string | undefined;

  // Poll up to `timeoutMs` waiting for a 200.
  const deadline = Date.now() + timeoutMs;
  let body = '';
  let delay = 5_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetchOnce(url);
      status = r.status;
      body = r.body;
      if (r.status === 200) break;
    } catch (err) {
      failures.push(`fetch error: ${(err as Error).message}`);
    }
    await sleep(delay);
    delay = Math.min(delay * 2, 30_000);
  }
  if (status !== 200) {
    failures.push(`expected 200, got ${status ?? 'no response'}`);
    return { url, ok: false, failures, status };
  }

  if (hasNoindex(body)) failures.push('page is noindex');
  canonical = findCanonical(body);
  if (!canonical) failures.push('no canonical link');
  else if (canonical !== url) {
    failures.push(`canonical "${canonical}" != expected "${url}"`);
  }
  if (!sitemap.has(url)) failures.push(`url not in ${SITEMAP_CHILD_URL}`);

  return { url, ok: failures.length === 0, failures, status, canonical };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = readJsonFile<{ addedUrls: string[]; modifiedUrls?: string[] }>(
    args.urls,
  );
  const urls = [...new Set([...(input.addedUrls ?? []), ...(input.modifiedUrls ?? [])])];
  if (urls.length === 0) {
    const empty: ReadinessResult[] = [];
    if (args.out) writeFileSync(args.out, JSON.stringify(empty, null, 2) + '\n');
    else process.stdout.write('[]\n');
    return;
  }

  for (const url of urls) {
    if (!url.startsWith(SITE + '/')) {
      throw new Error(`Refusing to verify off-site URL: ${url}`);
    }
  }

  const sitemap = await waitForSitemapUrls(urls, args.timeoutMs);
  const results: ReadinessResult[] = [];
  for (const url of urls) {
    results.push(await checkUrl(url, sitemap, args.timeoutMs));
  }

  const json = JSON.stringify(results, null, 2);
  if (args.out) writeFileSync(args.out, json + '\n');
  else process.stdout.write(json + '\n');

  const bad = results.filter((r) => !r.ok);
  if (bad.length > 0) {
    console.error(`Readiness failed for ${bad.length}/${results.length} URL(s).`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
