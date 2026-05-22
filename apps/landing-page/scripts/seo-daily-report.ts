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

interface DimensionRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface Opportunity {
  label: string;
  item: string;
  evidence: string;
  action: string;
}

interface OpportunityBuckets {
  doorwayQueries: Opportunity[];
  lowCtrQueries: Opportunity[];
  lowCtrPages: Opportunity[];
  deviceCtrGaps: Opportunity[];
}

interface OpportunityThresholds {
  minImpressions: number;
  lowCtr: number;
  mobileDesktopCtrGap: number;
}

interface DailyReport {
  reportDate: string;
  comparisonDate: string;
  rollingStartDate: string;
  rollingEndDate: string;
  metrics: Metrics;
  delta: MetricDelta;
  devices: DimensionRow[];
  countries: DimensionRow[];
  searchAppearances: DimensionRow[];
  pageRisers: Mover[];
  pageFallers: Mover[];
  queryRisers: Mover[];
  opportunities: OpportunityBuckets;
  thresholds: OpportunityThresholds;
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
  const rollingStartDate = addDays(reportDate, -6);
  const rollingEndDate = reportDate;
  const dataState = 'all';
  const thresholds = readOpportunityThresholds();

  const [
    currentTotals,
    previousTotals,
    currentPages,
    previousPages,
    currentQueries,
    previousQueries,
    deviceRows,
    countryRows,
    searchAppearanceRows,
    rollingQueries,
    rollingPages,
  ] =
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
      querySearchAnalyticsRows({
        startDate: rollingStartDate,
        endDate: rollingEndDate,
        dimensions: ['device'],
        dataState,
      }),
      querySearchAnalyticsRows({
        startDate: rollingStartDate,
        endDate: rollingEndDate,
        dimensions: ['country'],
        dataState,
      }),
      querySearchAnalyticsRows({
        startDate: rollingStartDate,
        endDate: rollingEndDate,
        dimensions: ['searchAppearance'],
        dataState,
      }),
      querySearchAnalyticsRows({
        startDate: rollingStartDate,
        endDate: rollingEndDate,
        dimensions: ['query'],
        rowLimit: 25_000,
        dataState,
      }),
      querySearchAnalyticsRows({
        startDate: rollingStartDate,
        endDate: rollingEndDate,
        dimensions: ['page'],
        rowLimit: 25_000,
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
    devices: deviceRows.length,
    countries: countryRows.length,
    searchAppearances: searchAppearanceRows.length,
    rollingQueries: rollingQueries.length,
    rollingPages: rollingPages.length,
  };
  console.log(
    `GSC rows for ${reportDate} vs ${comparisonDate}; rolling ${rollingStartDate}..${rollingEndDate} (${dataState}): ${JSON.stringify(rowCounts)}`,
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
    rollingStartDate,
    rollingEndDate,
    metrics,
    delta: {
      clicks: percentDelta(metrics.clicks, previousMetrics.clicks),
      impressions: percentDelta(metrics.impressions, previousMetrics.impressions),
      ctrPoints: (metrics.ctr - previousMetrics.ctr) * 100,
      position: metrics.position - previousMetrics.position,
    },
    devices: dimensionRows(deviceRows),
    countries: dimensionRows(countryRows).slice(0, 5),
    searchAppearances: dimensionRows(searchAppearanceRows),
    pageRisers: [...pageMovers]
      .sort((a, b) => b.clickDelta - a.clickDelta)
      .slice(0, 5),
    pageFallers: [...pageMovers].sort((a, b) => a.clickDelta - b.clickDelta).slice(0, 5),
    queryRisers: [...queryMovers]
      .sort((a, b) => b.clickDelta - a.clickDelta)
      .slice(0, 5),
    opportunities: buildOpportunities({
      queries: rollingQueries,
      pages: rollingPages,
      devices: deviceRows,
      thresholds,
    }),
    thresholds,
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

function dimensionRows(rows: SearchAnalyticsRow[]): DimensionRow[] {
  return rows
    .map((row) => ({
      key: row.keys[0] ?? 'unknown',
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

function readOpportunityThresholds(): OpportunityThresholds {
  return {
    minImpressions: readNumberEnv('OPP_MIN_IMPRESSIONS', 30),
    lowCtr: readNumberEnv('OPP_LOW_CTR', 0.01),
    mobileDesktopCtrGap: readNumberEnv('OPP_MOBILE_DESKTOP_CTR_GAP', 0.3),
  };
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

function buildOpportunities(input: {
  queries: SearchAnalyticsRow[];
  pages: SearchAnalyticsRow[];
  devices: SearchAnalyticsRow[];
  thresholds: OpportunityThresholds;
}): OpportunityBuckets {
  const { queries, pages, devices, thresholds } = input;
  const minImpressions = thresholds.minImpressions;
  const lowCtr = thresholds.lowCtr;

  const doorwayQueries = queries
    .filter(
      (row) =>
        row.impressions >= minImpressions &&
        row.position >= 11 &&
        row.position <= 20 &&
        Boolean(row.keys[0]),
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 3)
    .map((row) =>
      opportunity(
        '门口页 query',
        row.keys[0] ?? '',
        `曝光 ${number(row.impressions)} · 平均排名 ${row.position.toFixed(1)} · CTR ${percent(row.ctr)}`,
        '补强匹配页面的标题、H1、FAQ 和内部链接，把 page 2 query 推进前 10。',
      ),
    );

  const lowCtrQueries = queries
    .filter(
      (row) =>
        row.impressions >= minImpressions &&
        row.position <= 10 &&
        row.ctr < lowCtr &&
        Boolean(row.keys[0]),
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 3)
    .map((row) =>
      opportunity(
        '高曝光低 CTR query',
        row.keys[0] ?? '',
        `曝光 ${number(row.impressions)} · 排名 ${row.position.toFixed(1)} · CTR ${percent(row.ctr)}`,
        '重写目标页 title/meta description，让 snippet 更贴近搜索意图和差异化卖点。',
      ),
    );

  const lowCtrPages = pages
    .filter(
      (row) =>
        row.impressions >= minImpressions &&
        row.position <= 10 &&
        row.ctr < lowCtr &&
        Boolean(row.keys[0]),
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 3)
    .map((row) =>
      opportunity(
        '高排名低 CTR page',
        row.keys[0] ?? '',
        `曝光 ${number(row.impressions)} · 排名 ${row.position.toFixed(1)} · CTR ${percent(row.ctr)}`,
        '优先检查 SERP 标题、描述和首屏承诺，避免排名有了但点击损失。',
      ),
    );

  return {
    doorwayQueries,
    lowCtrQueries,
    lowCtrPages,
    deviceCtrGaps: deviceCtrGapOpportunities(devices, thresholds),
  };
}

function deviceCtrGapOpportunities(
  rows: SearchAnalyticsRow[],
  thresholds: OpportunityThresholds,
): Opportunity[] {
  const byDevice = rowsByFirstKey(rows);
  const mobile = byDevice.get('MOBILE') ?? byDevice.get('mobile');
  const desktop = byDevice.get('DESKTOP') ?? byDevice.get('desktop');
  if (!mobile || !desktop) return [];
  if (
    mobile.impressions < thresholds.minImpressions ||
    desktop.impressions < thresholds.minImpressions
  ) {
    return [];
  }

  const betterCtr = Math.max(mobile.ctr, desktop.ctr);
  if (betterCtr === 0) return [];
  const relativeGap = Math.abs(mobile.ctr - desktop.ctr) / betterCtr;
  if (relativeGap <= thresholds.mobileDesktopCtrGap) return [];

  const worse = mobile.ctr < desktop.ctr ? 'mobile' : 'desktop';
  return [
    opportunity(
      '设备 CTR 差距',
      `${worse} CTR 落后`,
      `mobile ${percent(mobile.ctr)} / desktop ${percent(desktop.ctr)} · 差距 ${(relativeGap * 100).toFixed(0)}%`,
      `优先检查 ${worse} 搜索结果承诺与落地页体验，确认首屏、速度和 CTA 是否拖累点击。`,
    ),
  ];
}

function opportunity(
  label: string,
  item: string,
  evidence: string,
  action: string,
): Opportunity {
  return { label, item, evidence, action };
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
      markdown(dimensionMarkdown('设备分布（近 7 天）', report.devices)),
      markdown(dimensionMarkdown('国家/地区 Top 5（近 7 天）', report.countries)),
      ...(report.searchAppearances.length > 0
        ? [markdown(dimensionMarkdown('Search appearance（近 7 天）', report.searchAppearances))]
        : []),
      { tag: 'hr' },
      markdown(moversMarkdown('Top 5 页面增长', report.pageRisers)),
      markdown(moversMarkdown('Top 5 页面下滑', report.pageFallers)),
      markdown(moversMarkdown('Top 5 查询增长', report.queryRisers)),
      { tag: 'hr' },
      markdown(opportunitiesMarkdown(report)),
      { tag: 'hr' },
      markdown(
        `数据口径: 单日 ${report.reportDate} vs ${report.comparisonDate}；维度/机会 ${report.rollingStartDate}..${report.rollingEndDate} · ${GSC_SITE_URL} · GSC API`,
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

function dimensionMarkdown(title: string, rows: DimensionRow[]): string {
  if (rows.length === 0) return `**${title}**\n\n暂无数据`;
  return [
    `**${title}**`,
    '',
    '| 维度 | 点击 | 曝光 | CTR |',
    '| --- | ---: | ---: | ---: |',
    ...rows.map(
      (row) =>
        `| ${formatDimensionKey(row.key)} | ${number(row.clicks)} | ${number(row.impressions)} | ${percent(row.ctr)} |`,
    ),
  ].join('\n');
}

function opportunitiesMarkdown(report: DailyReport): string {
  const sections = [
    opportunitySection('门口页 query', report.opportunities.doorwayQueries),
    opportunitySection('高曝光低 CTR query', report.opportunities.lowCtrQueries),
    opportunitySection('高排名低 CTR page', report.opportunities.lowCtrPages),
    opportunitySection('设备 CTR 差距', report.opportunities.deviceCtrGaps),
  ].filter(Boolean);

  const thresholdLine = `阈值: 曝光 ≥ ${number(report.thresholds.minImpressions)} · 低 CTR < ${percent(report.thresholds.lowCtr)} · 设备 CTR 相对差距 > ${(report.thresholds.mobileDesktopCtrGap * 100).toFixed(0)}%`;

  if (sections.length === 0) {
    return `**优化机会（近 7 天）**\n\n近 7 天暂无明显优化候选。\n\n${thresholdLine}`;
  }

  return ['**优化机会（近 7 天）**', '', thresholdLine, '', ...sections].join('\n');
}

function opportunitySection(title: string, opportunities: Opportunity[]): string {
  if (opportunities.length === 0) return '';
  return [
    `**${title}**`,
    ...opportunities.map(
      (item) =>
        `- ${formatKey(item.item)} — ${item.evidence}；建议：${item.action}`,
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

function formatDimensionKey(key: string): string {
  return truncate(escapeTableText(key.toLowerCase()), 48);
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
