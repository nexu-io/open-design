/*
 * seo-daily-report — posts a daily Search Console summary to a Feishu group.
 *
 * Reports T-2 Search Analytics data and compares it with T-9, the same
 * weekday one week earlier. GSC backfills recent data, so T-2 is the stable
 * daily reporting window.
 */
import { createHmac } from 'node:crypto';
import {
  GSC_SITE_URL,
  type SearchAnalyticsRow,
  querySearchAnalyticsRows,
} from './blog-indexing/lib.ts';

interface Args {
  today?: string;
  delayDays: number;
  dryRun: boolean;
}

interface Metrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface MetricDelta {
  clicks: number;
  impressions: number;
  ctrPoints: number;
  position: number;
}

interface Mover {
  key: string;
  clicks: number;
  previousClicks: number;
  clickDelta: number;
  impressions: number;
  previousImpressions: number;
  impressionDelta: number;
  ctr: number;
  previousCtr: number;
}

interface DailyReport {
  reportDate: string;
  comparisonDate: string;
  metrics: Metrics;
  delta: MetricDelta;
  pageRisers: Mover[];
  pageFallers: Mover[];
  queryRisers: Mover[];
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--today') args.today = argv[++i];
    else if (argv[i] === '--delay-days') args.delayDays = Number(argv[++i]);
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return {
    today: args.today,
    delayDays: args.delayDays ?? Number(process.env.REPORT_DELAY_DAYS ?? 2),
    dryRun: args.dryRun ?? false,
  };
}

function todayInShanghai(): string {
  const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
  return new Date(Date.now() + shanghaiOffsetMs).toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function buildReport(args: Args): Promise<DailyReport> {
  const today = args.today ?? todayInShanghai();
  const reportDate = addDays(today, -args.delayDays);
  const comparisonDate = addDays(reportDate, -7);
  const dataState = 'all';

  const [currentTotals, previousTotals, currentPages, previousPages, currentQueries, previousQueries] =
    await Promise.all([
      querySearchAnalyticsRows({
        startDate: reportDate,
        endDate: reportDate,
        dimensions: [],
        dataState,
      }),
      querySearchAnalyticsRows({
        startDate: comparisonDate,
        endDate: comparisonDate,
        dimensions: [],
        dataState,
      }),
      querySearchAnalyticsRows({
        startDate: reportDate,
        endDate: reportDate,
        dimensions: ['page'],
        dataState,
      }),
      querySearchAnalyticsRows({
        startDate: comparisonDate,
        endDate: comparisonDate,
        dimensions: ['page'],
        dataState,
      }),
      querySearchAnalyticsRows({
        startDate: reportDate,
        endDate: reportDate,
        dimensions: ['query'],
        dataState,
      }),
      querySearchAnalyticsRows({
        startDate: comparisonDate,
        endDate: comparisonDate,
        dimensions: ['query'],
        dataState,
      }),
    ]);
  const rowCounts = {
    currentTotals: currentTotals.length,
    previousTotals: previousTotals.length,
    currentPages: currentPages.length,
    previousPages: previousPages.length,
    currentQueries: currentQueries.length,
    previousQueries: previousQueries.length,
  };
  console.log(
    `GSC rows for ${reportDate} vs ${comparisonDate} (${dataState}): ${JSON.stringify(rowCounts)}`,
  );
  if (Object.values(rowCounts).every((count) => count === 0)) {
    throw new Error(
      `GSC returned zero rows for ${reportDate} and ${comparisonDate}; refusing to post an all-zero SEO report.`,
    );
  }

  const metrics = rowToMetrics(currentTotals[0]);
  const previousMetrics = rowToMetrics(previousTotals[0]);
  const pageMovers = buildMovers(currentPages, previousPages);
  const queryMovers = buildMovers(currentQueries, previousQueries);

  return {
    reportDate,
    comparisonDate,
    metrics,
    delta: {
      clicks: percentDelta(metrics.clicks, previousMetrics.clicks),
      impressions: percentDelta(metrics.impressions, previousMetrics.impressions),
      ctrPoints: (metrics.ctr - previousMetrics.ctr) * 100,
      position: metrics.position - previousMetrics.position,
    },
    pageRisers: [...pageMovers]
      .sort((a, b) => b.clickDelta - a.clickDelta)
      .slice(0, 5),
    pageFallers: [...pageMovers].sort((a, b) => a.clickDelta - b.clickDelta).slice(0, 5),
    queryRisers: [...queryMovers]
      .sort((a, b) => b.clickDelta - a.clickDelta)
      .slice(0, 5),
  };
}

function rowToMetrics(row?: SearchAnalyticsRow): Metrics {
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0,
  };
}

function buildMovers(currentRows: SearchAnalyticsRow[], previousRows: SearchAnalyticsRow[]): Mover[] {
  const current = rowsByFirstKey(currentRows);
  const previous = rowsByFirstKey(previousRows);
  const keys = new Set([...current.keys(), ...previous.keys()]);
  return [...keys].sort().map((key) => {
    const currentMetrics = current.get(key) ?? rowToMetrics();
    const previousMetrics = previous.get(key) ?? rowToMetrics();
    return {
      key,
      clicks: currentMetrics.clicks,
      previousClicks: previousMetrics.clicks,
      clickDelta: currentMetrics.clicks - previousMetrics.clicks,
      impressions: currentMetrics.impressions,
      previousImpressions: previousMetrics.impressions,
      impressionDelta: currentMetrics.impressions - previousMetrics.impressions,
      ctr: currentMetrics.ctr,
      previousCtr: previousMetrics.ctr,
    };
  });
}

function rowsByFirstKey(rows: SearchAnalyticsRow[]): Map<string, Metrics> {
  const map = new Map<string, Metrics>();
  for (const row of rows) {
    const key = row.keys[0];
    if (!key) continue;
    map.set(key, rowToMetrics(row));
  }
  return map;
}

function buildFeishuCard(report: DailyReport) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: {
        tag: 'plain_text',
        content: `SEO 日报 · ${report.reportDate}`,
      },
    },
    elements: [
      markdown(summaryMarkdown(report)),
      { tag: 'hr' },
      markdown(moversMarkdown('Top 5 页面增长', report.pageRisers)),
      markdown(moversMarkdown('Top 5 页面下滑', report.pageFallers)),
      markdown(moversMarkdown('Top 5 查询增长', report.queryRisers)),
      { tag: 'hr' },
      markdown(
        `数据口径: ${report.reportDate} vs ${report.comparisonDate} · ${GSC_SITE_URL} · GSC API`,
      ),
    ],
  };
}

function summaryMarkdown(report: DailyReport): string {
  return [
    `**站点**: \`${GSC_SITE_URL}\``,
    '',
    `- 点击 Clicks: **${number(report.metrics.clicks)}** ${percentDeltaText(report.delta.clicks)}`,
    `- 曝光 Impressions: **${number(report.metrics.impressions)}** ${percentDeltaText(report.delta.impressions)}`,
    `- CTR: **${percent(report.metrics.ctr)}** ${pointsDeltaText(report.delta.ctrPoints)}`,
    `- 平均排名: **${report.metrics.position.toFixed(1)}** ${positionDeltaText(report.delta.position)}`,
  ].join('\n');
}

function moversMarkdown(title: string, movers: Mover[]): string {
  if (movers.length === 0) return `**${title}**\n\n暂无数据`;
  return [
    `**${title}**`,
    '',
    '| 项目 | 当日点击 | Δ vs 上周 | 当日曝光 |',
    '| --- | ---: | ---: | ---: |',
    ...movers.map(
      (mover) =>
        `| ${formatKey(mover.key)} | ${number(mover.clicks)} | ${signedNumber(mover.clickDelta)} | ${number(mover.impressions)} |`,
    ),
  ].join('\n');
}

function markdown(content: string) {
  return {
    tag: 'div',
    text: {
      tag: 'lark_md',
      content,
    },
  };
}

async function postToFeishu(card: unknown): Promise<void> {
  const webhookUrl = process.env.FEISHU_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('FEISHU_WEBHOOK_URL is required.');

  const payload: Record<string, unknown> = {
    msg_type: 'interactive',
    card,
  };
  const secret = process.env.FEISHU_WEBHOOK_SECRET;
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    payload.timestamp = timestamp;
    payload.sign = createFeishuSign(timestamp, secret);
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Feishu webhook failed (${res.status}): ${text}`);
  }
  if (text) {
    const body = JSON.parse(text) as { code?: number; StatusCode?: number; msg?: string; StatusMessage?: string };
    const code = body.code ?? body.StatusCode ?? 0;
    if (code !== 0) {
      throw new Error(`Feishu webhook returned ${code}: ${body.msg ?? body.StatusMessage ?? text}`);
    }
  }
}

function createFeishuSign(timestamp: string, secret: string): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return createHmac('sha256', stringToSign).update('').digest('base64');
}

function percentDelta(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function percentDeltaText(value: number): string {
  if (value === 0) return '→ 0.0%';
  return `${value > 0 ? '▲' : '▼'} ${signedNumber(value, 1)}%`;
}

function pointsDeltaText(value: number): string {
  if (value === 0) return '→ 0.00pp';
  return `${value > 0 ? '▲' : '▼'} ${signedNumber(value, 2)}pp`;
}

function positionDeltaText(value: number): string {
  if (value === 0) return '→ 0.0';
  return `${value < 0 ? '▲' : '▼'} ${signedNumber(value, 1)}`;
}

function number(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function signedNumber(value: number, digits = 0): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: 'always',
  }).format(value);
  return formatted;
}

function formatKey(key: string): string {
  const escaped = escapeTableText(key);
  try {
    const url = new URL(key);
    const display = truncate(escapeTableText(`${url.pathname}${url.search}` || '/'), 64);
    return `[${display}](${escaped})`;
  } catch {
    return truncate(escaped, 64);
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function escapeTableText(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildReport(args);
  const card = buildFeishuCard(report);
  if (args.dryRun) {
    console.log(JSON.stringify({ msg_type: 'interactive', card }, null, 2));
    return;
  }
  await postToFeishu(card);
  console.log(`Posted SEO daily report for ${GSC_SITE_URL} / ${report.reportDate}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
