/*
 * escalate-stalls — reads the indexing state file and decides whether
 * a stall issue needs to be opened/updated.
 *
 *   Usage: tsx escalate-stalls.ts [--state file.json] [--out file.json] [--min-age-days 7]
 *
 * A URL counts as "stalled" when ALL of the following hold:
 *   - we have at least one inspection on file
 *   - the latest verdict is NOT `indexed`
 *   - the latest coverage state contains `Discovered - currently not indexed`
 *     OR `Crawled - currently not indexed`
 *   - the post is at least `--min-age-days` old (default 7)
 *
 * Output JSON:
 *
 *   {
 *     "shouldEscalate": boolean,
 *     "stalled": [{ url, slug, coverageState, ageDays, lastInspected }],
 *     "issueTitle": string,
 *     "issueBody": string
 *   }
 *
 * The calling workflow uses `gh issue list` to find an existing open
 * issue with the same title; if found it updates the body, otherwise
 * it opens a new one.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  type BlogIndexingState,
  BLOG_DIR,
  REPO_ROOT,
  slugFromUrl,
} from './lib.ts';

interface Args {
  state: string;
  out?: string;
  minAgeDays: number;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--state') args.state = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--min-age-days') args.minAgeDays = Number(argv[++i]);
  }
  args.state ??= path.join(REPO_ROOT, 'docs/blog-indexing-status.json');
  args.minAgeDays ??= 7;
  return args as Args;
}

function frontmatterDate(slug: string): string | null {
  const file = path.join(BLOG_DIR, `${slug}.md`);
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, 'utf8');
  return raw.match(/^---\n[\s\S]*?\ndate:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\b/m)?.[1] ?? null;
}

function ageDaysFromDate(addedAt: string): number {
  const a = Date.now();
  const b = new Date(addedAt + 'T00:00:00Z').getTime();
  return Math.floor((a - b) / 86_400_000);
}

function ageDaysFromIso(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function postAgeDays(slug: string, record: { url: string; inspectedAt: string }, state: BlogIndexingState): number {
  const publishedAt = frontmatterDate(slug);
  if (publishedAt) return ageDaysFromDate(publishedAt);
  const firstInspectedAt =
    state.firstInspectedAt?.[record.url] ?? state.firstSeenAt?.[record.url];
  if (firstInspectedAt) return ageDaysFromIso(firstInspectedAt);
  return ageDaysFromDate(record.inspectedAt.slice(0, 10));
}

function isStallCoverage(coverageState: string): boolean {
  return /Discovered - currently not indexed|Crawled - currently not indexed/i.test(
    coverageState,
  );
}

function main() {
  const { state: stateFile, out, minAgeDays } = parseArgs(process.argv.slice(2));
  const state: BlogIndexingState = existsSync(stateFile)
    ? JSON.parse(readFileSync(stateFile, 'utf8'))
    : { latest: {} };

  const stalled: Array<{
    url: string;
    slug: string;
    coverageState: string;
    ageDays: number;
    lastInspected: string;
  }> = [];

  for (const record of Object.values(state.latest)) {
    if ('error' in record.result) continue;
    const r = record.result;
    if (r.isIndexed) continue;
    if (!isStallCoverage(r.coverageState)) continue;
    const slug = slugFromUrl(record.url);
    const age = postAgeDays(slug, record, state);
    if (age < minAgeDays) continue;
    stalled.push({
      url: record.url,
      slug,
      coverageState: r.coverageState,
      ageDays: age,
      lastInspected: record.inspectedAt.slice(0, 10),
    });
  }

  const issueTitle = 'Blog indexing — URLs stalled in Search Console';
  const issueBody = stalled.length
    ? [
        'The post-deploy + scheduled indexing monitor has detected blog URLs that Google has discovered but is not indexing past the T+7 window.',
        '',
        '| URL | Coverage state | Age (days) | Last inspected |',
        '|---|---|---|---|',
        ...stalled.map(
          (s) => `| ${s.url} | ${s.coverageState} | ${s.ageDays} | ${s.lastInspected} |`,
        ),
        '',
        'Likely causes (per blog-indexing-automation skill, Step 5):',
        '',
        '- thin or duplicate content (Google decided not to index)',
        '- canonical or hreflang signal Google disagrees with',
        '- low internal linking from indexed pages',
        '- crawl-budget pressure (resolves on its own for healthy sites)',
        '',
        'Resolution path:',
        '',
        '1. Open each URL in [Search Console URL Inspection](https://search.google.com/search-console/inspect?resource_id=sc-domain%3Aopen-design.ai)',
        '2. Confirm the rendered HTML matches what we ship (live test).',
        '3. If the page looks fine, improve the underlying SEO/content signals: title/query fit, internal links, canonical clarity, and content depth.',
        '4. Redeploy the fix, then let the scheduled monitor re-inspect the URL.',
        '',
        'This issue is auto-updated by `.github/workflows/blog-indexing-monitor.yml`. It will close itself once all listed URLs reach `indexed` status.',
      ].join('\n')
    : '';

  const result = {
    shouldEscalate: stalled.length > 0,
    stalled,
    issueTitle,
    issueBody,
  };

  const json = JSON.stringify(result, null, 2);
  if (out) writeFileSync(out, json + '\n');
  else process.stdout.write(json + '\n');
}

main();
