/*
 * report-3day — daily digest of Search Console traffic for recent
 * blog posts. Produces two sections per run:
 *
 *   1. T-3 spotlight     — posts published exactly three days ago, with
 *                          their 3-day GSC window plus current index
 *                          status from URL Inspection.
 *   2. Rolling 30-day    — every post that is 1–30 days old, with its
 *      cohort              latest 3-day Search Analytics window.
 *
 * The script reads blog markdown files for publish dates and titles,
 * calls `querySearchAnalytics(url, 3)` (and `inspectUrl(url)` for the
 * T-3 cohort), then upserts a dated section at the top of
 * `docs/blog-traffic-digest.md`. The digest keeps the most recent 30
 * dated sections so the file stays browseable.
 *
 * Usage:
 *   tsx report-3day.ts [--out docs/blog-traffic-digest.md]
 *                      [--summary-out .blog-indexing/blog-traffic-digest-summary.json]
 *                      [--today YYYY-MM-DD]
 *                      [--no-inspect]
 *                      [--dry-run]
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  BLOG_DIR,
  type InspectionVerdict,
  REPO_ROOT,
  type SearchAnalyticsRecord,
  blogSlugToUrl,
  fileExists,
  fileToSlug,
  inspectUrl,
  querySearchAnalytics,
} from './lib.ts';

const DEFAULT_OUT = path.join(REPO_ROOT, 'docs/blog-traffic-digest.md');
const MAX_SECTIONS = 30;
const ROLLING_MAX_AGE_DAYS = 30;
const T3_AGE_DAYS = 3;

interface Args {
  out: string;
  summaryOut?: string;
  today: string;
  inspect: boolean;
  dryRun: boolean;
}

interface PostMeta {
  slug: string;
  url: string;
  title: string;
  category: string;
  publishedAt: string;
  ageDays: number;
}

interface PostRow extends PostMeta {
  analytics?: SearchAnalyticsRecord;
  inspection?: InspectionVerdict;
  error?: string;
}

interface DigestSummaryRow {
  title: string;
  category: string;
  url: string;
  publishedAt: string;
  ageDays: number;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  position: number | null;
  indexed: string;
  error?: string;
}

interface DigestSummary {
  generatedAt: string;
  reportDate: string;
  digestPath: string;
  t3PublishedAt: string;
  totals: {
    rollingImpressions: number;
    rollingClicks: number;
    rollingCtr: number | null;
  };
  t3: DigestSummaryRow[];
  rollingTop: DigestSummaryRow[];
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out.out = argv[++i];
    else if (argv[i] === '--summary-out') out.summaryOut = argv[++i];
    else if (argv[i] === '--today') out.today = argv[++i];
    else if (argv[i] === '--no-inspect') out.inspect = false;
    else if (argv[i] === '--dry-run') out.dryRun = true;
  }
  return {
    out: out.out ?? DEFAULT_OUT,
    summaryOut: out.summaryOut,
    today: out.today ?? new Date().toISOString().slice(0, 10),
    inspect: out.inspect ?? true,
    dryRun: out.dryRun ?? false,
  };
}

function nullableNumber(n: number | undefined): number | null {
  return n !== undefined && Number.isFinite(n) ? n : null;
}

function diffDays(today: string, publishedAt: string): number {
  const a = new Date(`${today}T00:00:00Z`).getTime();
  const b = new Date(`${publishedAt}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86_400_000);
}

function parseFrontmatter(raw: string): Record<string, string> {
  const fm: Record<string, string> = {};
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return fm;
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const value = kv[2].trim().replace(/^['"]|['"]$/g, '');
    fm[kv[1]] = value;
  }
  return fm;
}

function loadPosts(today: string): PostMeta[] {
  const files = readdirSync(BLOG_DIR).filter(
    (f) => f.endsWith('.md') && !f.startsWith('_'),
  );
  const posts: PostMeta[] = [];
  for (const file of files) {
    const raw = readFileSync(path.join(BLOG_DIR, file), 'utf8');
    const fm = parseFrontmatter(raw);
    const publishedAt = fm.date;
    const title = fm.title;
    const category = fm.category;
    if (!publishedAt || !title || !category) continue;
    const ageDays = diffDays(today, publishedAt);
    if (ageDays < 0) continue;
    const slug = fileToSlug(file);
    posts.push({
      slug,
      url: blogSlugToUrl(slug),
      title,
      category,
      publishedAt,
      ageDays,
    });
  }
  return posts.sort((a, b) => a.ageDays - b.ageDays);
}

async function gatherAnalytics(
  posts: PostMeta[],
  options: { inspect: boolean },
): Promise<PostRow[]> {
  const rows: PostRow[] = [];
  for (const post of posts) {
    const row: PostRow = { ...post };
    try {
      row.analytics = await querySearchAnalytics(post.url, 3);
    } catch (err) {
      row.error = `analytics: ${(err as Error).message}`;
    }
    if (options.inspect) {
      try {
        row.inspection = await inspectUrl(post.url);
      } catch (err) {
        row.error = `${row.error ? `${row.error}; ` : ''}inspection: ${(err as Error).message}`;
      }
    }
    rows.push(row);
  }
  return rows;
}

function fmtNumber(n: number | undefined): string {
  if (n === undefined) return '—';
  return Number.isFinite(n) ? Math.round(n).toString() : '—';
}

function fmtCtr(ctr: number | undefined): string {
  if (ctr === undefined || !Number.isFinite(ctr)) return '—';
  return `${(ctr * 100).toFixed(1)}%`;
}

function fmtPosition(pos: number | undefined): string {
  if (pos === undefined || !Number.isFinite(pos) || pos === 0) return '—';
  return pos.toFixed(1);
}

function indexLabel(row: PostRow): string {
  if (row.inspection?.coverageState === 'Submitted and indexed') return '✓ indexed';
  if (row.inspection?.coverageState) return row.inspection.coverageState;
  if (row.error?.includes('inspection')) return '_inspection failed_';
  return '—';
}

function renderT3Table(rows: PostRow[]): string {
  if (rows.length === 0) {
    return '_No posts shipped exactly three days ago._\n';
  }
  const header =
    '| Post | Category | Impressions | Clicks | CTR | Position | Indexed |\n' +
    '|---|---|---:|---:|---:|---:|---|';
  const body = rows.map((row) => {
    const a = row.analytics;
    return `| [${row.title}](${row.url}) | ${row.category} | ${fmtNumber(a?.impressions)} | ${fmtNumber(a?.clicks)} | ${fmtCtr(a?.ctr)} | ${fmtPosition(a?.position)} | ${indexLabel(row)} |`;
  });
  return [header, ...body].join('\n') + '\n';
}

function renderRollingTable(rows: PostRow[]): string {
  if (rows.length === 0) {
    return '_No posts in the 1–30 day window._\n';
  }
  const header =
    '| Post | Age | Category | Impressions | Clicks | CTR | Position |\n' +
    '|---|---:|---|---:|---:|---:|---:|';
  const body = rows
    .slice()
    .sort((a, b) => (b.analytics?.impressions ?? 0) - (a.analytics?.impressions ?? 0))
    .map((row) => {
      const a = row.analytics;
      return `| [${row.title}](${row.url}) | ${row.ageDays}d | ${row.category} | ${fmtNumber(a?.impressions)} | ${fmtNumber(a?.clicks)} | ${fmtCtr(a?.ctr)} | ${fmtPosition(a?.position)} |`;
    });
  return [header, ...body].join('\n') + '\n';
}

function renderSection(today: string, t3: PostRow[], rolling: PostRow[]): string {
  const t3PublishedAt = t3[0]?.publishedAt;
  const window = t3[0]?.analytics
    ? `${t3[0].analytics.startDate} → ${t3[0].analytics.endDate}`
    : 'unavailable';
  const totals = rolling.reduce(
    (acc, r) => {
      acc.impressions += r.analytics?.impressions ?? 0;
      acc.clicks += r.analytics?.clicks ?? 0;
      return acc;
    },
    { impressions: 0, clicks: 0 },
  );
  const totalCtr =
    totals.impressions > 0
      ? `${((totals.clicks / totals.impressions) * 100).toFixed(1)}%`
      : '—';

  const errorRows = [...t3, ...rolling].filter((r) => r.error);
  const errors = errorRows.length
    ? '\n> ⚠ Errors encountered:\n' +
      errorRows
        .map((r) => `> - \`${r.slug}\`: ${r.error}`)
        .join('\n') +
      '\n'
    : '';

  return [
    `## ${today} — Daily blog traffic digest`,
    '',
    `### T-3 spotlight`,
    '',
    t3PublishedAt
      ? `> Posts published exactly three days ago (${t3PublishedAt}). 3-day GSC window: \`${window}\`.`
      : `> No posts published exactly three days ago (looking for \`${plusDaysIso(today, -T3_AGE_DAYS)}\`).`,
    '',
    renderT3Table(t3),
    `### Rolling 30-day cohort`,
    '',
    `> Every post 1–30 days old, with its latest 3-day Search Analytics window. Totals: ${fmtNumber(totals.impressions)} impressions · ${fmtNumber(totals.clicks)} clicks · ${totalCtr} CTR.`,
    '',
    renderRollingTable(rolling),
    errors,
  ].join('\n');
}

function toSummaryRow(row: PostRow): DigestSummaryRow {
  return {
    title: row.title,
    category: row.category,
    url: row.url,
    publishedAt: row.publishedAt,
    ageDays: row.ageDays,
    impressions: nullableNumber(row.analytics?.impressions),
    clicks: nullableNumber(row.analytics?.clicks),
    ctr: nullableNumber(row.analytics?.ctr),
    position: nullableNumber(row.analytics?.position),
    indexed: indexLabel(row),
    ...(row.error ? { error: row.error } : {}),
  };
}

function buildSummary(
  today: string,
  digestPath: string,
  t3: PostRow[],
  rolling: PostRow[],
): DigestSummary {
  const totals = rolling.reduce(
    (acc, r) => {
      acc.rollingImpressions += r.analytics?.impressions ?? 0;
      acc.rollingClicks += r.analytics?.clicks ?? 0;
      return acc;
    },
    { rollingImpressions: 0, rollingClicks: 0 },
  );
  const rollingCtr =
    totals.rollingImpressions > 0
      ? totals.rollingClicks / totals.rollingImpressions
      : null;
  const rollingTop = rolling
    .slice()
    .sort((a, b) => (b.analytics?.impressions ?? 0) - (a.analytics?.impressions ?? 0))
    .slice(0, 5)
    .map(toSummaryRow);

  return {
    generatedAt: new Date().toISOString(),
    reportDate: today,
    digestPath: path.relative(REPO_ROOT, digestPath),
    t3PublishedAt: plusDaysIso(today, -T3_AGE_DAYS),
    totals: { ...totals, rollingCtr },
    t3: t3.map(toSummaryRow),
    rollingTop,
  };
}

function writeSummary(summaryOut: string | undefined, summary: DigestSummary): void {
  if (!summaryOut) return;
  writeFileSync(summaryOut, JSON.stringify(summary, null, 2) + '\n');
  console.error(`[report-3day] wrote ${summaryOut}`);
}

function plusDaysIso(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

const HEADER = `# Blog traffic digest

Daily Search Console snapshot for posts on https://open-design.ai/blog/.
Refreshed by [\`.github/workflows/blog-3day-report.yml\`](../.github/workflows/blog-3day-report.yml)
once per day at 10:00 Asia/Shanghai.

How to read this file:

- **T-3 spotlight** lists posts published exactly three days ago. At
  T-3 the question we care about is "did Google pick it up at all" —
  so the table also shows the current URL Inspection coverage state.
- **Rolling 30-day cohort** lists every post 1–30 days old with its
  latest 3-day Search Analytics window. Sort order is impressions
  descending. This is where you spot the long-tail winners.
- GSC Search Analytics lags by ~2 days; the script clamps each
  window to end at \`today − 2\` so figures are stable across runs.

The file keeps the most recent ${MAX_SECTIONS} dated sections; older
entries are pruned automatically. Use \`git log\` on this file for
deeper history.

---

`;

function upsertDigest(filePath: string, today: string, newSection: string): string {
  const existing = fileExists(filePath) ? readFileSync(filePath, 'utf8') : '';
  const withoutHeader = existing.replace(/^# Blog traffic digest[\s\S]*?\n---\n+/, '');

  const sectionRegex = /(^## (\d{4}-\d{2}-\d{2}) [\s\S]*?)(?=^## \d{4}-\d{2}-\d{2}|\Z)/gm;
  const sections: Array<{ date: string; body: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = sectionRegex.exec(withoutHeader)) !== null) {
    sections.push({ date: match[2], body: match[1] });
  }

  const filtered = sections.filter((s) => s.date !== today);
  filtered.unshift({ date: today, body: newSection.endsWith('\n') ? newSection : `${newSection}\n` });
  const kept = filtered.slice(0, MAX_SECTIONS);

  return HEADER + kept.map((s) => s.body.trimEnd()).join('\n\n') + '\n';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const today = args.today;

  const posts = loadPosts(today);
  const t3Cohort = posts.filter((p) => p.ageDays === T3_AGE_DAYS);
  const rollingCohort = posts.filter(
    (p) => p.ageDays >= 1 && p.ageDays <= ROLLING_MAX_AGE_DAYS,
  );

  console.error(
    `[report-3day] today=${today} posts=${posts.length} t3=${t3Cohort.length} rolling=${rollingCohort.length}`,
  );

  if (args.dryRun) {
    console.error('[report-3day] --dry-run: skipping network calls');
    const t3Rows: PostRow[] = t3Cohort.map((p) => ({ ...p }));
    const rollingRows: PostRow[] = rollingCohort.map((p) => ({ ...p }));
    const section = renderSection(today, t3Rows, rollingRows);
    writeSummary(args.summaryOut, buildSummary(today, args.out, t3Rows, rollingRows));
    const next = upsertDigest(args.out, today, section);
    process.stdout.write(next);
    return;
  }

  const t3Rows = await gatherAnalytics(t3Cohort, { inspect: args.inspect });
  const rollingMinusT3 = rollingCohort.filter(
    (p) => !t3Cohort.some((q) => q.slug === p.slug),
  );
  const rollingExtraRows = await gatherAnalytics(rollingMinusT3, { inspect: false });
  const rollingRows = [...t3Rows.map(({ inspection, ...rest }) => rest), ...rollingExtraRows];

  const section = renderSection(today, t3Rows, rollingRows);
  const next = upsertDigest(args.out, today, section);
  writeSummary(args.summaryOut, buildSummary(today, args.out, t3Rows, rollingRows));

  writeFileSync(args.out, next);
  console.error(`[report-3day] wrote ${args.out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
