/*
 * scheduled-window — emits the URLs that fall into the T+1, T+3, T+7,
 * or T+14 inspection window today.
 *
 *   Usage: tsx scheduled-window.ts [--out file.json] [--max-age-days 14]
 *
 * For each blog post .md file, the post's publish date is the
 * frontmatter `date`. A URL is emitted when `today - publishDate` is
 * exactly 1, 3, 7, or 14 days.
 *
 * Output JSON shape:
 *
 *   {
 *     "today": "2026-05-15",
 *     "windows": { "1": [...], "3": [...], "7": [...], "14": [...] },
 *     "urls": ["https://open-design.ai/blog/foo/", ...]   // dedupe of all 4 buckets
 *   }
 *
 * If no URLs match, exits 0 with `urls: []` so the calling workflow
 * can branch on `length`.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BLOG_DIR, REPO_ROOT, blogSlugToUrl, fileToSlug } from './lib.ts';

const WINDOWS = [1, 3, 7, 14] as const;
type Window = (typeof WINDOWS)[number];

interface Args {
  out?: string;
  maxAgeDays: number;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--max-age-days') args.maxAgeDays = Number(argv[++i]);
  }
  return { maxAgeDays: 14, ...args } as Args;
}

function frontmatterDate(file: string): string | null {
  const raw = readFileSync(path.join(REPO_ROOT, file), 'utf8');
  const match = raw.match(/^---\n[\s\S]*?\ndate:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\b/m);
  return match?.[1] ?? null;
}

function diffDays(today: string, addedAt: string): number {
  const a = new Date(today + 'T00:00:00Z').getTime();
  const b = new Date(addedAt + 'T00:00:00Z').getTime();
  return Math.round((a - b) / 86_400_000);
}

function main() {
  const { out, maxAgeDays } = parseArgs(process.argv.slice(2));
  const today = new Date().toISOString().slice(0, 10);

  const files = readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => path.join('apps/landing-page/app/content/blog', f));

  const buckets: Record<Window, string[]> = { 1: [], 3: [], 7: [], 14: [] };
  for (const file of files) {
    const publishedAt = frontmatterDate(file);
    if (!publishedAt) continue;
    const age = diffDays(today, publishedAt);
    if (age < 0 || age > maxAgeDays) continue;
    if (!WINDOWS.includes(age as Window)) continue;
    const url = blogSlugToUrl(fileToSlug(file));
    buckets[age as Window].push(url);
  }

  const urls = [...new Set(Object.values(buckets).flat())];
  const result = { today, windows: buckets, urls };
  const json = JSON.stringify(result, null, 2);
  if (out) writeFileSync(out, json + '\n');
  else process.stdout.write(json + '\n');
}

main();
