/*
 * post-feishu-digest — send the compact blog traffic digest summary to
 * a Feishu custom bot webhook.
 *
 * Usage:
 *   tsx post-feishu-digest.ts --summary .blog-indexing/blog-traffic-digest-summary.json [--dry-run]
 *
 * Required for real delivery:
 *   FEISHU_BLOG_DIGEST_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/...
 */
import { readFileSync } from 'node:fs';

interface Args {
  summary: string;
  dryRun: boolean;
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
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--summary') args.summary = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  if (!args.summary) throw new Error('--summary is required');
  return { dryRun: false, ...args } as Args;
}

function fmtNumber(n: number | null): string {
  return n === null ? '-' : Math.round(n).toString();
}

function fmtCtr(ctr: number | null): string {
  return ctr === null ? '-' : `${(ctr * 100).toFixed(1)}%`;
}

function fmtPosition(pos: number | null): string {
  return pos === null || pos === 0 ? '-' : pos.toFixed(1);
}

function rowLine(row: DigestSummaryRow, includeIndex = false): string {
  const metrics = [
    `${fmtNumber(row.impressions)} imp`,
    `${fmtNumber(row.clicks)} clk`,
    fmtCtr(row.ctr),
    `pos ${fmtPosition(row.position)}`,
  ];
  if (includeIndex) metrics.push(row.indexed);
  return `- [${row.title}](${row.url}) · ${row.category} · ${metrics.join(' · ')}`;
}

function repoRunUrl(): string | null {
  const server = process.env.GITHUB_SERVER_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!server || !repo || !runId) return null;
  return `${server}/${repo}/actions/runs/${runId}`;
}

function repoFileUrl(summary: DigestSummary): string | null {
  const server = process.env.GITHUB_SERVER_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!server || !repo) return null;
  return `${server}/${repo}/blob/main/${summary.digestPath}`;
}

function buildCard(summary: DigestSummary): Record<string, unknown> {
  const t3 =
    summary.t3.length > 0
      ? summary.t3.map((row) => rowLine(row, true)).join('\n')
      : `No posts published exactly three days ago (${summary.t3PublishedAt}).`;
  const rolling =
    summary.rollingTop.length > 0
      ? summary.rollingTop.map((row) => rowLine(row)).join('\n')
      : 'No posts in the 1-30 day rolling cohort.';
  const runUrl = repoRunUrl();
  const fileUrl = repoFileUrl(summary);
  const links = [
    fileUrl ? `[Digest file](${fileUrl})` : `Digest file: ${summary.digestPath}`,
    runUrl ? `[Workflow run](${runUrl})` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: {
        tag: 'plain_text',
        content: `Open Design blog SEO digest · ${summary.reportDate}`,
      },
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**Rolling 30-day totals:** ${fmtNumber(summary.totals.rollingImpressions)} impressions · ${fmtNumber(summary.totals.rollingClicks)} clicks · ${fmtCtr(summary.totals.rollingCtr)} CTR`,
        },
      },
      { tag: 'hr' },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**T-3 spotlight**\n${t3}`,
        },
      },
      { tag: 'hr' },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**Rolling 30-day Top 5**\n${rolling}`,
        },
      },
      {
        tag: 'note',
        elements: [
          {
            tag: 'lark_md',
            content: `${links}\nGenerated at ${summary.generatedAt}`,
          },
        ],
      },
    ],
  };
}

async function postCard(webhook: string, card: Record<string, unknown>): Promise<void> {
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ msg_type: 'interactive', card }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Feishu webhook failed (${res.status}): ${text}`);
  }
  const parsed = JSON.parse(text) as { code?: number; msg?: string };
  if (parsed.code !== 0) {
    throw new Error(`Feishu webhook returned code=${parsed.code}: ${parsed.msg ?? text}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = JSON.parse(readFileSync(args.summary, 'utf8')) as DigestSummary;
  const card = buildCard(summary);

  if (args.dryRun) {
    process.stdout.write(JSON.stringify({ msg_type: 'interactive', card }, null, 2) + '\n');
    return;
  }

  const webhook = process.env.FEISHU_BLOG_DIGEST_WEBHOOK;
  if (!webhook) {
    console.warn(
      '[post-feishu-digest] FEISHU_BLOG_DIGEST_WEBHOOK is missing; skipping Feishu delivery.',
    );
    return;
  }
  await postCard(webhook, card);
  console.error('[post-feishu-digest] sent Feishu digest card');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
