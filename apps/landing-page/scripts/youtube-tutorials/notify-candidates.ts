/*
 * notify-candidates — daily cron entry. Discovers new Open-Design tutorial
 * candidates from YouTube, then posts a numbered digest to a Feishu (Lark)
 * webhook for a human to review. It does NOT generate entries or open a PR:
 * a maintainer replies with which numbers to publish, and the selected videos
 * are turned into entries by `generate-selected.ts`.
 *
 * Usage:
 *   tsx scripts/youtube-tutorials/notify-candidates.ts [--days 14] [--print]
 *
 * Env:
 *   YOUTUBE_API_KEY                        YouTube Data API v3 (or ~/.youtube/.env)
 *   ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL   relevance gate
 *   FEISHU_TUTORIALS_WEBHOOK               Feishu custom-bot incoming webhook URL
 *   FEISHU_TUTORIALS_SECRET                optional, if the bot has signing enabled
 *
 * --print skips Feishu and writes the digest to stdout (used locally to
 * reproduce the candidate numbering before generating selected entries).
 */
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readExistingVideoIds } from './lib.ts';
import { fetchCandidates, loadYoutubeKey, type ScoredCandidate } from './youtube.ts';
import {
  fetchContributionPRs,
  fetchSubmissionIssues,
  type ContributionPR,
  type SubmissionIssue,
} from './github-submissions.ts';

function fmtViews(n?: number): string {
  if (!n) return '';
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function buildDigest(candidates: ScoredCandidate[], today: string): string {
  const lines: string[] = [];
  lines.push(`📺 Open Design 教程候选 · ${today} · 共 ${candidates.length} 条待审(按建议评分排序)`);
  lines.push('');
  candidates.forEach((v, i) => {
    const s = v.score;
    const meta = [v.author, v.date, fmtViews(v.viewCount) && `${fmtViews(v.viewCount)} 次观看`, fmtDuration(v.durationSeconds)]
      .filter(Boolean)
      .join(' · ');
    const verdict = s.recommend ? '✅ 建议收录' : '🚫 不建议';
    lines.push(`[${i + 1}] ${verdict} · ⭐${s.overall}分 · 完整${s.completeness}/5 精准${s.relevance}/5 热度${s.reach}/5`);
    lines.push(`    ${v.title}`);
    lines.push(`    ${meta}`);
    if (s.reason) lines.push(`    💬 ${s.reason}`);
    lines.push(`    https://youtu.be/${v.videoId}`);
  });
  lines.push('');
  lines.push('评分=完整度×8+精准度×8+热度×4(满分100,仅供参考,你定夺)');
  lines.push('回复指令(发给 Claude):');
  lines.push('• 上架 1 3 5    只上这几条');
  lines.push('• 全上 / 全不上');
  lines.push('• 全上 除 2 4    除这几条其余都上');
  lines.push('');
  lines.push('(已自动过滤:已收录的 + 经 LLM 闸门判定非 Open Design 的内容)');
  return lines.join('\n');
}

/** Build a Feishu interactive card: one section per candidate with a verdict. */
function buildCard(
  candidates: ScoredCandidate[],
  issues: SubmissionIssue[],
  prs: ContributionPR[],
  today: string,
): Record<string, unknown> {
  const recommended = candidates.filter((c) => c.score.recommend).length;
  const elements: Record<string, unknown>[] = [];
  elements.push({
    tag: 'div',
    text: {
      tag: 'lark_md',
      content:
        `**YouTube 候选 ${candidates.length} 条**（✅ ${recommended} 建议收录）` +
        (issues.length ? ` · **用户投稿 issue ${issues.length}**` : '') +
        (prs.length ? ` · **待审 PR ${prs.length}**` : ''),
    },
  });
  elements.push({ tag: 'hr' });
  candidates.forEach((v, i) => {
    const s = v.score;
    const verdict = s.recommend ? '✅ **建议收录**' : '🚫 **不建议**';
    const meta = [v.author, v.date, fmtViews(v.viewCount) && `${fmtViews(v.viewCount)} 次观看`, fmtDuration(v.durationSeconds)]
      .filter(Boolean)
      .join(' · ');
    const parts = [
      `**[${i + 1}] ${verdict} · ⭐ ${s.overall} 分**`,
      `完整 ${s.completeness}/5 · 精准 ${s.relevance}/5 · 热度 ${s.reach}/5`,
      `[${v.title}](https://youtu.be/${v.videoId})`,
      meta,
    ];
    if (s.reason) parts.push(`💬 ${s.reason}`);
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: parts.join('\n') } });
    elements.push({ tag: 'hr' });
  });
  if (issues.length) {
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: '**👤 用户投稿 issue（待你批准后由我生成）**' } });
    for (const it of issues) {
      const link = it.videoUrl ? `[视频](${it.videoUrl}) · ` : '⚠️ 未填视频链接 · ';
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: `[#${it.number}](${it.url}) ${it.title}\n${link}@${it.author}` },
      });
    }
    elements.push({ tag: 'hr' });
  }
  if (prs.length) {
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: '**🔀 待审 PR（去 GitHub review/merge）**' } });
    for (const pr of prs) {
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: `[#${pr.number}](${pr.url}) ${pr.title} · @${pr.author}` },
      });
    }
    elements.push({ tag: 'hr' });
  }
  elements.push({
    tag: 'note',
    elements: [
      {
        tag: 'lark_md',
        content:
          '评分 = 完整度×8 + 精准度×8 + 热度×4（满分100，仅供参考）｜回复 Claude：**上架 1 3 5**（YouTube 候选）/ **收 issue 12**（用户投稿）/ **全上** / **全上 除 2 4**',
      },
    ],
  });
  return {
    config: { wide_screen_mode: true },
    header: {
      template: recommended > 0 ? 'green' : 'grey',
      title: { tag: 'plain_text', content: `📺 Open Design 教程候选 · ${today}` },
    },
    elements,
  };
}

async function postToFeishu(
  webhook: string,
  secret: string | undefined,
  card: Record<string, unknown>,
): Promise<void> {
  const body: Record<string, unknown> = { msg_type: 'interactive', card };
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sign = createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64');
    body.timestamp = timestamp;
    body.sign = sign;
  }
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: number; msg?: string; StatusCode?: number };
  // Feishu signals failure with a non-zero `code` (new format) OR a non-zero
  // `StatusCode` (legacy format), both returned on an HTTP 200. Treat either as
  // a failure so a digest that never reached the group does not look posted.
  const failed = !res.ok || (json.code != null && json.code !== 0) || (json.StatusCode != null && json.StatusCode !== 0);
  if (failed) {
    throw new Error(`Feishu webhook failed: HTTP ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  }
}

// This workflow's file name, used to look up its own prior runs.
const WORKFLOW_FILE = 'tutorials-youtube-sync.yml';
// Window used only when there is no watermark source (local runs, or a CI run
// with no prior successful run yet) — wide enough that a single delayed/skipped
// run can't open a gap, narrow enough not to dump history on a first run.
const FALLBACK_DAYS = 2;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

/**
 * Start time (RFC 3339) of the most recent successful run of this workflow that
 * isn't the current run, via the Actions API. Returns null when unavailable
 * (no token, no prior success, or an API error).
 */
export async function lastSuccessfulRunStart(): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return null;
  const currentRunId = process.env.GITHUB_RUN_ID;
  // Scope to this run's ref so only the canonical digest branch (main, for the
  // schedule) advances its own watermark. Without this, a successful
  // workflow_dispatch run on a feature branch could become main's watermark and
  // permanently skip the range that branch run "covered".
  const branch = process.env.GITHUB_REF_NAME ?? 'main';
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?status=success&branch=${encodeURIComponent(branch)}&per_page=10`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`Actions API HTTP ${res.status}`);
  const data = (await res.json()) as {
    workflow_runs?: { id: number; created_at: string; run_started_at?: string }[];
  };
  // Use run_started_at (actual execution start), NOT created_at (queue/creation
  // time). They differ by the queue wait, which can be 10-15 min; deriving the
  // watermark from created_at would re-emit candidates published while a run sat
  // queued. Fall back to created_at only if run_started_at is absent.
  const prior = (data.workflow_runs ?? [])
    .filter((r) => String(r.id) !== currentRunId)
    .map((r) => r.run_started_at ?? r.created_at)
    .sort();
  return prior.length ? prior[prior.length - 1] : null;
}

type WindowResult = { since: string; reason: string } | { fail: string };

/**
 * Resolve the digest window start.
 * - Explicit --days always wins, with no upper clamp, so a manual catch-up after
 *   a long outage actually covers the requested range.
 * - In CI (a watermark source exists), the last successful run is the gap-free
 *   watermark. If that lookup ERRORS, fail the job rather than silently sweeping
 *   a wrong (short) window — dedupe only covers already-published videos, so a
 *   bad window would drop or duplicate notifications while the run looks green.
 * - The short FALLBACK_DAYS window is used only when there is genuinely no
 *   watermark (local run, or a CI run with no prior successful run yet).
 */
async function resolveWindowStart(explicitDays: number | null): Promise<WindowResult> {
  if (explicitDays != null) {
    return { since: isoDaysAgo(explicitDays), reason: `--days ${explicitDays}` };
  }
  const hasWatermarkSource = Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY);
  if (hasWatermarkSource) {
    let watermark: string | null;
    try {
      watermark = await lastSuccessfulRunStart();
    } catch (e) {
      return { fail: `watermark lookup failed: ${(e as Error).message}` };
    }
    if (watermark) {
      // Lower bound = prior successful run's start. Windows are contiguous, so
      // delayed/skipped runs stay gap-free. A residual overlap equal to the prior
      // run's setup time (start → search call, ~1 min) can re-list a video once
      // if it was published in that minute and not yet acted on. That is bounded
      // and cosmetic here: the digest is human-reviewed, so a rare duplicate line
      // is simply not picked twice, and once published it's filtered by the
      // catalogue. Eliminating it fully needs a durable already-notified store,
      // which is out of scope for this window-tuning change (follow-up if it ever
      // proves noisy).
      return { since: watermark, reason: `since last successful run ${watermark}` };
    }
    return { since: isoDaysAgo(FALLBACK_DAYS), reason: `no prior successful run; ${FALLBACK_DAYS}-day window` };
  }
  return { since: isoDaysAgo(FALLBACK_DAYS), reason: `no watermark source; ${FALLBACK_DAYS}-day window` };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const printOnly = args.includes('--print');
  const daysIdx = args.indexOf('--days');
  const explicitDays = daysIdx !== -1 ? Number(args[daysIdx + 1]) : null;
  // The --days operator escape hatch must fail fast on bad input rather than
  // crash (NaN -> RangeError) or silently no-op (negative -> future window).
  if (explicitDays != null && !(Number.isInteger(explicitDays) && explicitDays > 0)) {
    console.error(`Invalid --days value "${args[daysIdx + 1]}"; expected a positive integer.`);
    process.exit(1);
  }

  const key = await loadYoutubeKey();
  const existing = await readExistingVideoIds();

  // Window start = last successful run (gap-free across delayed/skipped runs),
  // or a short fallback window. --days overrides for manual catch-up.
  const window = await resolveWindowStart(explicitDays);
  if ('fail' in window) {
    console.error(`Cannot resolve a safe window: ${window.fail}; aborting.`);
    process.exitCode = 1;
    return;
  }
  const { since, reason } = window;
  console.log(`Window start: ${since} (${reason})`);

  const { candidates, searchFailures, queryCount } = await fetchCandidates(key, since, existing);

  // Abort on ANY search failure (not just all). A partial failure is an
  // incomplete sweep; posting + succeeding would advance the watermark past the
  // failed query's window and skip those candidates forever. Failing instead
  // holds the watermark so the next run re-covers the window.
  if (searchFailures > 0) {
    console.error(`${searchFailures}/${queryCount} search queries failed; aborting before posting so the watermark holds and the next run re-covers this window.`);
    process.exitCode = 1;
    return;
  }

  console.log(`${candidates.length} candidate(s) after dedupe + relevance gate`);

  // Also surface user submissions (form issues + contribution PRs) when a GitHub
  // token is present. If a lookup fails, abort before posting rather than send a
  // digest that silently omits submissions — the run goes red (observable) and
  // the next run re-queries (submissions are not windowed, so nothing is lost;
  // YouTube candidates are re-covered via the unchanged watermark).
  let issues: SubmissionIssue[] = [];
  let prs: ContributionPR[] = [];
  const ghToken = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (ghToken && repo) {
    try {
      [issues, prs] = await Promise.all([
        fetchSubmissionIssues(ghToken, repo),
        fetchContributionPRs(ghToken, repo),
      ]);
      console.log(`Submissions: ${issues.length} issue(s), ${prs.length} PR(s)`);
    } catch (e) {
      console.error(`Submission lookup failed; aborting before posting so the digest is not silently incomplete: ${(e as Error).message}`);
      process.exitCode = 1;
      return;
    }
  }

  const today = candidates[0]?.date ?? new Date().toISOString().slice(0, 10);
  const digest = buildDigest(candidates, today);

  if (printOnly) {
    console.log('\n' + digest);
    if (issues.length || prs.length) console.log(`\n(+ ${issues.length} issue / ${prs.length} PR submissions)`);
    return;
  }

  if (candidates.length === 0 && issues.length === 0 && prs.length === 0) {
    console.log('Nothing to review; skipping Feishu post.');
    return;
  }

  const webhook = process.env.FEISHU_TUTORIALS_WEBHOOK;
  if (!webhook) {
    console.error('Missing FEISHU_TUTORIALS_WEBHOOK; printing digest instead:\n');
    console.log(digest);
    process.exitCode = 1;
    return;
  }
  await postToFeishu(webhook, process.env.FEISHU_TUTORIALS_SECRET, buildCard(candidates, issues, prs, today));
  console.log('Posted candidate digest card to Feishu.');
}

// Only sweep when run directly; importing (e.g. from tests) must have no effect.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
