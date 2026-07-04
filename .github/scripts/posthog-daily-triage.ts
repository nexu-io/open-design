#!/usr/bin/env node

// Daily PostHog reliability-triage digest → Feishu (Lark) interactive card.
//
// Pipeline (deterministic-first, LLM-second):
//   1. Query PostHog project 420348 over the last 24h vs the prior 7-day baseline
//      (HogQL). ALL numbers are computed here — counts, rates, deltas, canaries.
//   2. Feed ONLY the compressed aggregates to an LLM reliability analyst, which
//      ranks the urgent items, writes a one-line root-cause hypothesis, and
//      suggests an owner area. The model never invents numbers.
//   3. Render a prioritized Feishu card, header color by severity.
//
// The "real fault" lens follows engineering-failure-reduction.md: engineering-view
// categories (what we can fix) + hidden-bug user_actions, excluding login/recharge
// user-noise and null/old-version churn. `unknown` occupancy > 2% is a red-line
// canary that attribution is rotting.
//
// Degrades gracefully. Missing POSTHOG_QUERY_API_KEY => log + exit 0 (not yet
// configured). Missing ANTHROPIC key or a failed LLM call => deterministic
// fallback narrative. A single failed sub-query => that section renders as
// "数据缺失", the rest of the card still ships.
//
// Inputs (all via env):
//   POSTHOG_QUERY_API_KEY  personal API key (phx_…) with query scope on the project.
//                          Empty => the daily post is skipped (self-check still runs).
//   POSTHOG_PROJECT_ID     PostHog project id (default 420348)
//   POSTHOG_QUERY_HOST     PostHog query host (default https://us.posthog.com)
//   ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL  LLM analyst (optional)
//   TRIAGE_LLM_MODEL       model id (default claude-sonnet-5)
//   FEISHU_WEBHOOK         (required for the real post) custom-bot webhook URL
//   FEISHU_SIGN_SECRET     (optional) signing secret when the bot enables 签名校验
//   RUN_URL                link back to the GitHub Actions run (optional)

import { createHmac } from "node:crypto";

// ---------- env ----------

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalEnv(name: string, fallback = ""): string {
  const value = process.env[name];
  return value == null || value.length === 0 ? fallback : value;
}

const POSTHOG_PROJECT_ID = optionalEnv("POSTHOG_PROJECT_ID", "420348");
const POSTHOG_QUERY_HOST = optionalEnv("POSTHOG_QUERY_HOST", "https://us.posthog.com").replace(/\/+$/, "");
const LLM_MODEL = optionalEnv("TRIAGE_LLM_MODEL", "claude-sonnet-5");

// ---------- reliability lens (mirrors engineering-failure-reduction.md) ----------

// Engineering-view failure categories: "what we can actually fix". Excludes the
// product-view buckets (auth/insufficient_balance/user_cancel/…) that are user
// self-heal or not-our-fault.
const ENGINEERING_CATEGORIES = [
  "process_exit",
  "timeout",
  "upstream_unavailable",
  "empty_output",
  "tool_error",
  "rate_limit",
  "unknown",
] as const;

// user_action tags that LOOK like the user's job but hide our own bug — must be
// treated as real faults, never filtered as noise.
const HIDDEN_BUG_ACTIONS = ["fix_config", "reduce_context", "switch_model"] as const;

// user_action tags that are genuine user-side noise (not our fault, user self-heals).
const USER_NOISE_ACTIONS = ["login", "recharge"] as const;

// Fetch-failure exception messages (#4661): network churn from the renderer
// polling the local daemon. High-volume noise, dropped from the exception view.
const FETCH_NOISE_MESSAGES = ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."] as const;

const UNKNOWN_RATIO_REDLINE = 0.02;

// Owner areas the analyst may route a finding to (kept in sync with the prompt).
const OWNER_AREAS = ["daemon/agent-engine", "runtime-claude", "runtime-codex", "runtime-amr", "web-frontend", "packaging", "upstream(外部)"] as const;

/**
 * Derive the release channel from a version string, inline copy of
 * packages/release/src/index.ts:releaseChannelFromVersion. `.github/scripts`
 * runs via `node --experimental-strip-types` with no bundler, so it cannot
 * import workspace packages — keep this self-contained.
 */
function releaseChannelFromVersion(version: string | null | undefined): "beta" | "betas" | "prerelease" | "preview" | "stable" {
  if (version == null || version.length === 0) return "stable";
  if (/(?:^|[-.])beta(?:[-.]|$)/i.test(version)) return "beta";
  if (/(?:^|[-.])betas(?:[-.]|$)/i.test(version)) return "betas";
  if (/(?:^|[-.])preview(?:[-.]|$)/i.test(version)) return "preview";
  if (/(?:^|[-.])prerelease(?:[-.]|$)/i.test(version)) return "prerelease";
  return "stable";
}

// ---------- small utils ----------

function retryDelay(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 15000)));
}

function shanghaiDateTime(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(value);
}

function shanghaiDate(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeZone: "Asia/Shanghai" }).format(value);
}

// Feishu lark_md is markdown-ish; neutralize control chars that break layout.
function sanitizeMarkdown(value: string): string {
  return value.replace(/\s+/g, " ").replaceAll("[", "［").replaceAll("]", "］").replaceAll("`", "'").trim();
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function sqlList(values: readonly string[]): string {
  return values.map((v) => `'${v.replaceAll("'", "''")}'`).join(", ");
}

function toNum(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function fmtPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

function fmtDelta(deltaPct: number | null): string {
  if (deltaPct == null) return "🆕新出现";
  if (!Number.isFinite(deltaPct)) return "🆕新出现";
  const sign = deltaPct >= 0 ? "▲+" : "▼";
  return `${sign}${Math.abs(deltaPct).toFixed(0)}%`;
}

// Release-channel scope. "stable" = 正式版 only (an app_version with no
// -beta/-betas/-preview/-prerelease suffix, i.e. releaseChannelFromVersion()
// === 'stable'); "all" = every channel. Defaults to stable: production users
// are the signal that matters, beta/prerelease are internal R&D validation
// noise. Trade-off: stable lags beta by ~a day for regression detection, so
// set TRIAGE_CHANNEL_SCOPE=all when you want beta as an early-warning signal.
const CHANNEL_SCOPE: "stable" | "all" = optionalEnv("TRIAGE_CHANNEL_SCOPE", "stable") === "all" ? "all" : "stable";
const SCOPE_LABEL = CHANNEL_SCOPE === "stable" ? "仅正式版" : "全渠道";

// A run/exception carrying a usable version. Under stable scope also require a
// hyphen-free version (e.g. 0.13.0) — position(x,'-')=0 means no prerelease tag.
const VERSION_PRESENT = "isNotNull(properties.app_version) AND properties.app_version NOT IN ('', '0.0.0')";
const SCOPE_CLAUSE = CHANNEL_SCOPE === "stable" ? `${VERSION_PRESENT} AND position(properties.app_version, '-') = 0` : VERSION_PRESENT;

// The engineering "real fault" predicate, reused across queries. A failed run
// that is neither user-noise nor old-version churn, in scope, and is either an
// engineering-view category or a hidden-bug user_action.
const REAL_FAULT_PREDICATE = `properties.result = 'failed'
  AND properties.user_action NOT IN (${sqlList(USER_NOISE_ACTIONS)})
  AND (properties.failure_category IN (${sqlList(ENGINEERING_CATEGORIES)}) OR properties.user_action IN (${sqlList(HIDDEN_BUG_ACTIONS)}))
  AND ${SCOPE_CLAUSE}`;

// ---------- PostHog HogQL client ----------

interface HogQLResponse {
  columns?: string[];
  results?: unknown[][];
}

async function hogql(query: string): Promise<Record<string, unknown>[]> {
  const key = requiredEnv("POSTHOG_QUERY_API_KEY");
  const url = `${POSTHOG_QUERY_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      });
    } catch (error) {
      if (attempt === 5) throw error;
      await retryDelay(attempt);
      continue;
    }
    if (response.ok) {
      const data = (await response.json()) as HogQLResponse;
      const columns = data.columns ?? [];
      const results = data.results ?? [];
      return results.map((row) => {
        const obj: Record<string, unknown> = {};
        columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        return obj;
      });
    }
    const body = await response.text();
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 5) {
      throw new Error(`PostHog query failed: HTTP ${response.status} ${body.slice(0, 400)}`);
    }
    console.warn(`[triage] PostHog query attempt ${attempt}/5 failed: HTTP ${response.status}`);
    await retryDelay(attempt);
  }
  throw new Error("PostHog query failed");
}

// ---------- aggregation ----------

interface Bucket {
  category: string;
  detail: string;
  today: number;
  users: number;
  baselineAvg: number;
  deltaPct: number | null; // null => newly appeared (no baseline)
}

interface Health {
  total: number; // in-scope runs (stable-only by default) — the rate denominator
  ok: number;
  failed: number;
  cancelled: number;
  realFault: number;
  unknownFailed: number;
  userNoise: number;
  oldverNoise: number;
  prereleaseExcluded: number; // failed runs on beta/prerelease/preview, excluded under stable scope
  engFailRate: number; // realFault / total * 100
  unknownRatio: number; // unknownFailed / failed (0..1)
}

interface ExceptionRow {
  type: string;
  message: string;
  n: number;
  users: number;
}

interface VersionRow {
  version: string;
  channel: string;
  realFault: number;
  total: number;
  rate: number; // realFault / total * 100
}

// Fold the period-labelled bucket rows into today vs baseline-daily-average.
function foldBuckets(rows: Record<string, unknown>[]): Bucket[] {
  const map = new Map<string, { category: string; detail: string; today: number; users: number; baseline: number }>();
  for (const row of rows) {
    const category = String(row.category ?? "unknown");
    const detail = String(row.detail ?? "unknown");
    const key = `${category}||${detail}`;
    const entry = map.get(key) ?? { category, detail, today: 0, users: 0, baseline: 0 };
    if (String(row.period) === "today") {
      entry.today = toNum(row.n);
      entry.users = toNum(row.users);
    } else {
      entry.baseline = toNum(row.n);
    }
    map.set(key, entry);
  }
  const buckets: Bucket[] = [];
  for (const entry of map.values()) {
    if (entry.today <= 0) continue; // only surface what happened today
    const baselineAvg = entry.baseline / 7;
    const deltaPct = baselineAvg > 0 ? ((entry.today - baselineAvg) / baselineAvg) * 100 : null;
    buckets.push({ category: entry.category, detail: entry.detail, today: entry.today, users: entry.users, baselineAvg, deltaPct });
  }
  // Rank by today's volume, users as tiebreaker.
  buckets.sort((a, b) => b.today - a.today || b.users - a.users);
  return buckets;
}

async function queryBuckets(): Promise<Bucket[]> {
  const rows = await hogql(`
    SELECT
      if(timestamp >= now() - INTERVAL 1 DAY, 'today', 'baseline') AS period,
      properties.failure_category AS category,
      properties.failure_detail AS detail,
      count() AS n,
      count(DISTINCT distinct_id) AS users
    FROM events
    WHERE event = 'run_finished'
      AND ${REAL_FAULT_PREDICATE}
      AND timestamp >= now() - INTERVAL 8 DAY
    GROUP BY period, category, detail`);
  return foldBuckets(rows);
}

async function queryHealth(): Promise<Health> {
  // Denominators (total/ok/failed/cancelled/unknown) are scoped so the failure
  // rate is measured over in-scope runs only. Noise counts are computed over
  // ALL runs so the "已过滤噪音" section can show exactly what was excluded.
  const rows = await hogql(`
    SELECT
      countIf(${SCOPE_CLAUSE}) AS total,
      countIf(${SCOPE_CLAUSE} AND properties.result = 'success') AS ok,
      countIf(${SCOPE_CLAUSE} AND properties.result = 'failed') AS failed,
      countIf(${SCOPE_CLAUSE} AND properties.result = 'cancelled') AS cancelled,
      countIf(${SCOPE_CLAUSE} AND properties.result = 'failed' AND properties.failure_category = 'unknown') AS unknown_failed,
      countIf(${REAL_FAULT_PREDICATE}) AS real_fault,
      countIf(properties.result = 'failed' AND properties.user_action IN (${sqlList(USER_NOISE_ACTIONS)})) AS user_noise,
      countIf(properties.result = 'failed' AND (isNull(properties.app_version) OR properties.app_version IN ('', '0.0.0'))) AS oldver_noise,
      countIf(properties.result = 'failed' AND ${VERSION_PRESENT} AND position(properties.app_version, '-') > 0) AS prerelease_excluded
    FROM events
    WHERE event = 'run_finished' AND timestamp >= now() - INTERVAL 1 DAY`);
  const r = rows[0] ?? {};
  const total = toNum(r.total);
  const failed = toNum(r.failed);
  const realFault = toNum(r.real_fault);
  const unknownFailed = toNum(r.unknown_failed);
  return {
    total,
    ok: toNum(r.ok),
    failed,
    cancelled: toNum(r.cancelled),
    realFault,
    unknownFailed,
    userNoise: toNum(r.user_noise),
    oldverNoise: toNum(r.oldver_noise),
    prereleaseExcluded: toNum(r.prerelease_excluded),
    engFailRate: pct(realFault, total),
    unknownRatio: failed > 0 ? unknownFailed / failed : 0,
  };
}

async function queryExceptions(): Promise<ExceptionRow[]> {
  const rows = await hogql(`
    SELECT
      properties.$exception_type AS type,
      properties.$exception_message AS message,
      count() AS n,
      count(DISTINCT distinct_id) AS users
    FROM events
    WHERE event = '$exception'
      AND coalesce(properties.$exception_message, '') NOT IN (${sqlList(FETCH_NOISE_MESSAGES)})
      AND ${SCOPE_CLAUSE}
      AND timestamp >= now() - INTERVAL 1 DAY
    GROUP BY type, message
    ORDER BY n DESC
    LIMIT 8`);
  return rows.map((r) => ({
    type: String(r.type ?? "Error"),
    message: String(r.message ?? ""),
    n: toNum(r.n),
    users: toNum(r.users),
  }));
}

async function queryVersions(): Promise<VersionRow[]> {
  const rows = await hogql(`
    SELECT
      properties.app_version AS version,
      countIf(properties.result = 'failed'
        AND properties.user_action NOT IN (${sqlList(USER_NOISE_ACTIONS)})
        AND properties.failure_category IN (${sqlList(ENGINEERING_CATEGORIES)})) AS real_fault,
      count() AS total
    FROM events
    WHERE event = 'run_finished'
      AND ${SCOPE_CLAUSE}
      AND timestamp >= now() - INTERVAL 2 DAY
    GROUP BY version
    HAVING total >= 200
    ORDER BY total DESC
    LIMIT 12`);
  return rows.map((r) => {
    const version = String(r.version ?? "");
    const realFault = toNum(r.real_fault);
    const total = toNum(r.total);
    return { version, channel: releaseChannelFromVersion(version), realFault, total, rate: pct(realFault, total) };
  });
}

// ---------- LLM analyst ----------

interface AnalystTop {
  title: string;
  why: string;
  hypothesis: string;
  owner: string;
}

interface Analysis {
  severity: "red" | "orange" | "blue";
  headline: string;
  top: AnalystTop[];
  changes: string;
  release: string;
  noiseNote: string;
  source: "llm" | "fallback";
}

function anthropicToken(): string | null {
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || null;
}

async function callLLM(system: string, user: string, maxTokens = 1400): Promise<string> {
  const token = anthropicToken();
  if (token == null) throw new Error("no anthropic token");
  const baseUrl = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": token, authorization: `Bearer ${token}`, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: LLM_MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`No JSON object in LLM output: ${text.slice(0, 200)}`);
  return JSON.parse(candidate.slice(start, end + 1));
}

const ANALYST_SYSTEM = [
  "你是 Open Design 的可靠性值班分析师,擅长错误 trace 下钻与失败归因。",
  "你会收到一份【已经算好的】PostHog 聚合数据(近 24h,对比前 7 日基线的每日均值)。",
  CHANNEL_SCOPE === "stable"
    ? "范围:本报告只统计【正式版(stable)】,beta/prerelease/preview 等非正式版已排除。版本回归指正式版补丁之间(如 0.13.1 vs 0.13.0)的对比,不要提及 beta。"
    : "范围:本报告统计所有发布渠道。",
  "铁律:",
  "1. 只依据给定数字判断,绝对不要编造任何数字、桶名或不存在的现象。",
  "2. 你的职责是判断轻重缓急、给根因假设、建议排查归属,不是复述数据。",
  "3. 工程视角真故障=我们能修的(process_exit/timeout/upstream_unavailable/empty_output/tool_error/rate_limit/unknown),",
  "   外加藏 bug 的 user_action(fix_config/reduce_context/switch_model)。login/recharge/老版本 是噪音,已被过滤,不要当故障。",
  "4. unknown 占比 > 2% 是归因腐化红线,必须点名。",
  "5. 版本回归:某个较新版本真故障率明显高于其它版本 = 疑似发布引入回归。",
  `owner 只能从这些方向里选最贴切的一个:${OWNER_AREAS.join(" / ")}。`,
  "严格输出 JSON(中文),字段:",
  '  severity: "red"|"orange"|"blue"(有 P0 尖峰/unknown 超红线/明显版本回归=red;中度环比上升=orange;平稳=blue)',
  "  headline: 一句话今日总判断,≤50 字",
  "  top: 数组,≤3 项,每项 {title, why(含量级与影响), hypothesis(根因假设), owner}",
  "  changes: 环比异动一段话,≤120 字",
  '  release: 版本回归判断一段话;没有就写"今日无明显版本回归"',
  "  noise_note: 对噪音过滤的一句话(让读者相信没吵也没漏)",
].join("\n");

function clampStr(value: unknown, limit: number): string {
  return truncate(String(value ?? "").trim(), limit);
}

async function analyze(input: { window: string; health: Health; buckets: Bucket[]; exceptions: ExceptionRow[]; versions: VersionRow[] }): Promise<Analysis> {
  const payload = {
    window: input.window,
    health: {
      total: input.health.total,
      real_fault: input.health.realFault,
      eng_failure_rate_pct: Number(input.health.engFailRate.toFixed(2)),
      unknown_ratio_pct: Number((input.health.unknownRatio * 100).toFixed(2)),
      user_noise: input.health.userNoise,
      oldver_noise: input.health.oldverNoise,
    },
    top_buckets: input.buckets.slice(0, 12).map((b) => ({
      category: b.category,
      detail: b.detail,
      today: b.today,
      affected_installs: b.users,
      baseline_daily_avg: Number(b.baselineAvg.toFixed(1)),
      delta_vs_baseline_pct: b.deltaPct == null ? "new" : Number(b.deltaPct.toFixed(0)),
    })),
    exceptions: input.exceptions.map((e) => ({ type: e.type, message: truncate(e.message, 160), today: e.n, affected_installs: e.users })),
    versions: input.versions.map((v) => ({ version: v.version, channel: v.channel, real_fault_rate_pct: Number(v.rate.toFixed(2)), samples: v.total })),
  };
  try {
    const raw = extractJson(await callLLM(ANALYST_SYSTEM, JSON.stringify(payload))) as Record<string, unknown>;
    const severityRaw = String(raw.severity ?? "blue");
    const severity = severityRaw === "red" || severityRaw === "orange" ? severityRaw : "blue";
    const topRaw = Array.isArray(raw.top) ? raw.top : [];
    const top: AnalystTop[] = topRaw.slice(0, 3).map((t) => {
      const item = (t ?? {}) as Record<string, unknown>;
      const owner = clampStr(item.owner, 40);
      return {
        title: clampStr(item.title, 90),
        why: clampStr(item.why, 160),
        hypothesis: clampStr(item.hypothesis, 200),
        owner: OWNER_AREAS.includes(owner as (typeof OWNER_AREAS)[number]) ? owner : owner || "待定",
      };
    });
    return {
      severity,
      headline: clampStr(raw.headline, 90) || fallbackHeadline(input.health),
      top,
      changes: clampStr(raw.changes, 240),
      release: clampStr(raw.release, 240),
      noiseNote: clampStr(raw.noise_note, 160),
      source: "llm",
    };
  } catch (error) {
    console.warn(`[triage] LLM analyst unavailable, using deterministic fallback: ${error instanceof Error ? error.message : String(error)}`);
    return fallbackAnalysis(input.health, input.buckets, input.versions);
  }
}

function fallbackHeadline(health: Health): string {
  return `近 24h 工程真故障 ${health.realFault} 次,工程失败率 ${fmtPct(health.engFailRate)}(样本 ${health.total})`;
}

// Deterministic narrative when the LLM is unavailable — never blocks the card.
function fallbackAnalysis(health: Health, buckets: Bucket[], versions: VersionRow[]): Analysis {
  const top: AnalystTop[] = buckets.slice(0, 3).map((b) => ({
    title: `${b.category} / ${b.detail}`,
    why: `${b.today} 次 · 影响 ~${b.users} 台 · 环比 ${fmtDelta(b.deltaPct)}`,
    hypothesis: "",
    owner: "",
  }));
  const spiking = buckets.filter((b) => b.deltaPct != null && b.deltaPct >= 50).slice(0, 3);
  const changes = spiking.length > 0 ? `环比上升明显的桶:${spiking.map((b) => `${b.detail}(${fmtDelta(b.deltaPct)})`).join("、")}` : "各桶环比无明显异动。";
  const sorted = [...versions].sort((a, b) => b.rate - a.rate);
  const worst = sorted[0];
  const release = worst != null && worst.rate > 0 ? `真故障率最高版本:${worst.version}(${worst.channel},${fmtPct(worst.rate)},样本 ${worst.total})——需与其它版本对比确认是否回归。` : "今日无明显版本回归。";
  const severity: Analysis["severity"] = health.unknownRatio > UNKNOWN_RATIO_REDLINE ? "red" : spiking.length > 0 ? "orange" : "blue";
  const prereleaseNote = CHANNEL_SCOPE === "stable" ? `、非正式版 ${health.prereleaseExcluded} 次` : "";
  return { severity, headline: fallbackHeadline(health), top, changes, release, noiseNote: `已过滤 login/recharge ${health.userNoise} 次、老版本 ${health.oldverNoise} 次${prereleaseNote}及 fetch 网络噪音。`, source: "fallback" };
}

// ---------- Feishu card ----------

type FeishuElement = Record<string, unknown>;
type FeishuCard = Record<string, unknown>;

function headerTemplate(severity: Analysis["severity"]): "red" | "orange" | "blue" {
  return severity;
}

function severityEmoji(severity: Analysis["severity"]): string {
  return severity === "red" ? "🔴" : severity === "orange" ? "🟠" : "🔵";
}

function topSection(top: AnalystTop[]): string {
  if (top.length === 0) return "🟢 今日无需紧急处理的真故障。";
  const lines = top.map((t, i) => {
    const parts = [`**${i + 1}. ${sanitizeMarkdown(t.title)}**`, `   ${sanitizeMarkdown(t.why)}`];
    if (t.hypothesis.length > 0) parts.push(`   假设:${sanitizeMarkdown(t.hypothesis)}`);
    if (t.owner.length > 0 && t.owner !== "待定") parts.push(`   建议 → ${sanitizeMarkdown(t.owner)}`);
    return parts.join("\n");
  });
  return `🔴 **今日必看 Top ${top.length}**(真故障 · 按 影响×严重度)\n${lines.join("\n")}`;
}

function exceptionSection(exceptions: ExceptionRow[]): string {
  if (exceptions.length === 0) return "";
  const shown = exceptions.slice(0, 5);
  const lines = shown.map((e, i) => `${i + 1}. \`${sanitizeMarkdown(e.type)}\` ${truncate(sanitizeMarkdown(e.message), 70)} — ${e.n} 次 / ~${e.users} 台`);
  return `🐞 **前端异常 Top ${shown.length}**(已排除 fetch 网络噪音)\n${lines.join("\n")}`;
}

function versionSection(release: string, versions: VersionRow[]): string {
  const table = versions
    .slice(0, 4)
    .map((v) => `- ${sanitizeMarkdown(v.version)}(${v.channel}):真故障率 ${fmtPct(v.rate)} · 样本 ${v.total}`)
    .join("\n");
  const body = table.length > 0 ? `${sanitizeMarkdown(release)}\n${table}` : sanitizeMarkdown(release);
  return `🚀 **版本回归哨兵**\n${body}`;
}

function healthSection(health: Health): string {
  const unknownFlag = health.unknownRatio > UNKNOWN_RATIO_REDLINE ? "🔴超红线" : "✅";
  return [
    "🩺 **归因健康度**",
    `- unknown 占比:${fmtPct(health.unknownRatio * 100)} ${unknownFlag}(红线 <2%)`,
    `- 工程视角失败率(${SCOPE_LABEL}):${fmtPct(health.engFailRate)} · 真故障 ${health.realFault} 次`,
    `- 近 24h ${SCOPE_LABEL}样本:${health.total}(成功 ${health.ok} / 失败 ${health.failed} / 取消 ${health.cancelled})`,
  ].join("\n");
}

function noiseSection(health: Health, noiseNote: string): string {
  return [
    "🧊 **已过滤噪音**(透明化 · 证明没吵也没漏)",
    `- 用户侧(login/recharge):${health.userNoise} 次 · 老版本(null/0.0.0):${health.oldverNoise} 次 · fetch 网络错误:已丢弃`,
    CHANNEL_SCOPE === "stable" ? `- 非正式版(beta/prerelease/preview)失败:${health.prereleaseExcluded} 次 —— 本报告只看正式版` : "",
    noiseNote.length > 0 ? `- ${sanitizeMarkdown(noiseNote)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCard(params: { now: Date; analysis: Analysis; health: Health; exceptions: ExceptionRow[]; versions: VersionRow[]; runUrl: string; degraded: string[] }): FeishuCard {
  const { now, analysis, health, exceptions, versions, runUrl, degraded } = params;
  const projectUrl = `${POSTHOG_QUERY_HOST}/project/${POSTHOG_PROJECT_ID}`;

  const sections: string[] = [
    `${severityEmoji(analysis.severity)} **${sanitizeMarkdown(analysis.headline)}**`,
    topSection(analysis.top),
    analysis.changes.length > 0 ? `📈 **环比异动**\n${sanitizeMarkdown(analysis.changes)}` : "",
    versionSection(analysis.release, versions),
    exceptionSection(exceptions),
    healthSection(health),
    noiseSection(health, analysis.noiseNote),
  ].filter((s) => s.length > 0);

  const elements: FeishuElement[] = [];
  sections.forEach((content, i) => {
    if (i > 0) elements.push({ tag: "hr" });
    elements.push({ tag: "div", text: { tag: "lark_md", content } });
  });

  elements.push({ tag: "hr" });
  const footerBits = [
    `[PostHog 数据探索](${projectUrl})`,
    `分析来源:${analysis.source === "llm" ? `LLM(${LLM_MODEL})` : "确定性回退"}`,
    `窗口:近 24h vs 前 7 日基线 · ${SCOPE_LABEL}`,
    `生成于 ${shanghaiDateTime(now)}`,
  ];
  if (runUrl.length > 0) footerBits.push(`[CI run](${runUrl})`);
  if (degraded.length > 0) footerBits.push(`⚠️ 数据缺失:${degraded.join("、")}`);
  elements.push({ tag: "note", elements: [{ tag: "lark_md", content: footerBits.join("  ·  ") }] });
  elements.push({ tag: "note", elements: [{ tag: "lark_md", content: "trace 下钻:PostHog run_finished 的 langfuse_trace_id == run.id,可直接查 Langfuse 单条 trace。" }] });

  return {
    config: { wide_screen_mode: true },
    header: {
      template: headerTemplate(analysis.severity),
      title: { tag: "plain_text", content: `${severityEmoji(analysis.severity)} Open Design 可靠性日报 · ${shanghaiDate(now)}` },
    },
    elements,
  };
}

// ---------- Feishu delivery ----------

function signedEnvelope(card: FeishuCard): Record<string, unknown> {
  const body = { msg_type: "interactive", card };
  const signSecret = optionalEnv("FEISHU_SIGN_SECRET");
  if (signSecret.length === 0) return body;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sign = createHmac("sha256", `${timestamp}\n${signSecret}`).update("").digest("base64");
  return { timestamp, sign, ...body };
}

async function postFeishu(card: FeishuCard): Promise<void> {
  const webhook = requiredEnv("FEISHU_WEBHOOK");
  const body = signedEnvelope(card);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch (error) {
      console.warn(`[triage] Feishu POST attempt ${attempt}/5 threw: ${error instanceof Error ? error.message : String(error)}`);
      if (attempt === 5) throw error;
      await retryDelay(attempt);
      continue;
    }
    const text = await response.text();
    let code: unknown = null;
    try {
      const parsed = JSON.parse(text) as { code?: unknown; StatusCode?: unknown };
      code = parsed.code ?? parsed.StatusCode ?? null;
    } catch {
      // Feishu normally returns JSON; keep the HTTP status fallback.
    }
    if (response.ok && (code === 0 || code == null)) {
      console.log(`[triage] delivered (HTTP ${response.status}, code ${code ?? "n/a"})`);
      return;
    }
    const retryable = response.status === 429 || response.status >= 500 || code === 9499;
    console.warn(`[triage] Feishu attempt ${attempt}/5 failed: HTTP ${response.status} code ${String(code)} ${text.slice(0, 400)}`);
    if (!retryable || attempt === 5) {
      throw new Error(`Feishu webhook failed: HTTP ${response.status} code ${String(code)}`);
    }
    await retryDelay(attempt);
  }
}

// ---------- run ----------

async function safeQuery<T>(label: string, fn: () => Promise<T>, fallback: T, degraded: string[]): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[triage] query '${label}' failed: ${error instanceof Error ? error.message : String(error)}`);
    degraded.push(label);
    return fallback;
  }
}

const EMPTY_HEALTH: Health = { total: 0, ok: 0, failed: 0, cancelled: 0, realFault: 0, unknownFailed: 0, userNoise: 0, oldverNoise: 0, prereleaseExcluded: 0, engFailRate: 0, unknownRatio: 0 };

async function run(): Promise<void> {
  if (optionalEnv("POSTHOG_QUERY_API_KEY").length === 0) {
    console.log("[triage] POSTHOG_QUERY_API_KEY not set — skipping daily post (configure the secret to enable). self-check still validates the card.");
    return;
  }
  const now = new Date();
  const degraded: string[] = [];
  const [health, buckets, exceptions, versions] = await Promise.all([
    safeQuery("归因健康度", queryHealth, EMPTY_HEALTH, degraded),
    safeQuery("失败桶", queryBuckets, [] as Bucket[], degraded),
    safeQuery("前端异常", queryExceptions, [] as ExceptionRow[], degraded),
    safeQuery("版本", queryVersions, [] as VersionRow[], degraded),
  ]);
  const analysis = await analyze({ window: `近 24h vs 前 7 日基线(${SCOPE_LABEL})`, health, buckets, exceptions, versions });
  // Never let the LLM under-call an attribution-rot red line.
  if (health.unknownRatio > UNKNOWN_RATIO_REDLINE && analysis.severity !== "red") {
    analysis.severity = "red";
  }
  const card = buildCard({ now, analysis, health, exceptions, versions, runUrl: optionalEnv("RUN_URL"), degraded });
  console.log(JSON.stringify({ severity: analysis.severity, source: analysis.source, health, topBuckets: buckets.slice(0, 5), degraded }, null, 2));

  if (optionalEnv("FEISHU_WEBHOOK").length === 0) {
    console.log("[triage] FEISHU_WEBHOOK not set — computed the card but not posting.");
    return;
  }
  await postFeishu(card);
}

// ---------- self-check (offline) ----------

function selfCheck(): void {
  // 1. Reliability-lens invariants.
  if (!REAL_FAULT_PREDICATE.includes("process_exit") || !REAL_FAULT_PREDICATE.includes("fix_config")) {
    throw new Error("self-check: real-fault predicate must cover engineering categories + hidden-bug actions");
  }
  if (REAL_FAULT_PREDICATE.includes("'login'") && !REAL_FAULT_PREDICATE.includes("NOT IN ('login', 'recharge')")) {
    throw new Error("self-check: real-fault predicate must exclude login/recharge noise");
  }
  if (releaseChannelFromVersion("0.13.1-beta.2") !== "beta") throw new Error("self-check: beta channel derivation");
  if (releaseChannelFromVersion("0.13.0") !== "stable") throw new Error("self-check: stable channel derivation");
  if (releaseChannelFromVersion("") !== "stable") throw new Error("self-check: empty version derivation");
  if (CHANNEL_SCOPE === "stable" && !REAL_FAULT_PREDICATE.includes("position(properties.app_version, '-') = 0")) {
    throw new Error("self-check: stable scope must add the hyphen-free (正式版) version filter");
  }

  // 2. Bucket folding: baseline is a 7-day daily average; today-only rows survive.
  const folded = foldBuckets([
    { period: "today", category: "process_exit", detail: "stream_error", n: 120, users: 40 },
    { period: "baseline", category: "process_exit", detail: "stream_error", n: 700, users: 0 },
    { period: "baseline", category: "timeout", detail: "inactivity_timeout", n: 70, users: 0 },
  ]);
  if (folded.length !== 1) throw new Error("self-check: only today-present buckets should surface");
  const b0 = folded[0];
  if (b0.baselineAvg !== 100 || Math.round(b0.deltaPct ?? -1) !== 20) {
    throw new Error(`self-check: expected baselineAvg 100 and delta +20%, got ${b0.baselineAvg} / ${b0.deltaPct}`);
  }
  if (fmtDelta(null) !== "🆕新出现") throw new Error("self-check: null delta must render as new");

  // 3. Card rendering with a fixed analysis (LLM skipped).
  const health: Health = { total: 5000, ok: 4600, failed: 380, cancelled: 20, realFault: 260, unknownFailed: 30, userNoise: 90, oldverNoise: 40, prereleaseExcluded: 55, engFailRate: pct(260, 5000), unknownRatio: 30 / 380 };
  const analysis: Analysis = {
    severity: "orange",
    headline: "工程失败率 5.2%,stream_error 环比上升",
    top: [{ title: "process_exit / stream_error", why: "120 次 · 影响 ~40 台 · ▲+20%", hypothesis: "child_close 阶段 RPC 提前断", owner: "daemon/agent-engine" }],
    changes: "tool_error 环比 ▲+120%,集中在 codex_cli。",
    release: "beta 0.13.1 真故障率高于 0.13.0,疑似回归。",
    noiseNote: "已过滤 login/recharge 与老版本。",
    source: "fallback",
  };
  const exceptions: ExceptionRow[] = [{ type: "TypeError", message: "Cannot read properties of undefined", n: 55, users: 22 }];
  const versions: VersionRow[] = [
    { version: "0.13.1-beta.2", channel: "beta", realFault: 90, total: 1000, rate: 9 },
    { version: "0.13.0", channel: "stable", realFault: 60, total: 1000, rate: 6 },
  ];
  const card = buildCard({ now: new Date(0), analysis, health, exceptions, versions, runUrl: "https://github.com/nexu-io/open-design/actions/runs/1", degraded: [] });
  const json = JSON.stringify(card);
  for (const marker of ["今日必看", "归因健康度", "已过滤噪音", "版本回归哨兵", "可靠性日报"]) {
    if (!json.includes(marker)) throw new Error(`self-check: card missing section '${marker}'`);
  }
  if (CHANNEL_SCOPE === "stable" && (!json.includes("仅正式版") || !json.includes("非正式版"))) {
    throw new Error("self-check: stable scope must label the card 仅正式版 and surface excluded 非正式版 noise");
  }
  const header = card.header as { template?: string };
  if (header.template !== "orange") throw new Error("self-check: header template must follow severity");

  // 4. unknown red-line override.
  const redHealth: Health = { ...health, unknownFailed: 40, unknownRatio: 40 / 380 };
  if (!(redHealth.unknownRatio > UNKNOWN_RATIO_REDLINE)) throw new Error("self-check: expected unknown ratio above red line");

  // 5. Fallback analysis is self-consistent.
  const fb = fallbackAnalysis(health, folded, versions);
  if (fb.source !== "fallback" || fb.top.length === 0) throw new Error("self-check: fallback analysis must produce top items");

  console.log("[triage] self-check passed");
}

const command = process.argv[2] ?? "run";
if (command === "self-check") {
  selfCheck();
} else if (command === "run") {
  await run();
} else {
  throw new Error(`Unknown command: ${command}`);
}
