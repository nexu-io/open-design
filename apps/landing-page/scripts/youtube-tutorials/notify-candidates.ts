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
import { readExistingVideoIds, type VideoInput } from './lib.ts';
import { fetchCandidates, loadYoutubeKey } from './youtube.ts';

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

function buildDigest(candidates: VideoInput[], today: string): string {
  const lines: string[] = [];
  lines.push(`📺 Open Design 教程候选 · ${today} · 共 ${candidates.length} 条待审`);
  lines.push('');
  candidates.forEach((v, i) => {
    const meta = [v.author, v.date, fmtViews(v.viewCount) && `${fmtViews(v.viewCount)} 次观看`, fmtDuration(v.durationSeconds)]
      .filter(Boolean)
      .join(' · ');
    lines.push(`[${i + 1}] ${v.title}`);
    lines.push(`    ${meta}`);
    lines.push(`    https://youtu.be/${v.videoId}`);
  });
  lines.push('');
  lines.push('回复指令(发给 Claude):');
  lines.push('• 上架 1 3 5    只上这几条');
  lines.push('• 全上 / 全不上');
  lines.push('• 全上 除 2 4    除这几条其余都上');
  lines.push('');
  lines.push('(已自动过滤:已收录的 + 经 LLM 闸门判定非 Open Design 的内容)');
  return lines.join('\n');
}

async function postToFeishu(webhook: string, secret: string | undefined, text: string): Promise<void> {
  const body: Record<string, unknown> = { msg_type: 'text', content: { text } };
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const printOnly = args.includes('--print');
  const daysIdx = args.indexOf('--days');
  const days = daysIdx !== -1 ? Number(args[daysIdx + 1]) : 14;

  const key = await loadYoutubeKey();
  const existing = await readExistingVideoIds();
  const { candidates, searchFailures, queryCount } = await fetchCandidates(key, days, existing);

  if (searchFailures === queryCount) {
    console.error(`All ${queryCount} search queries failed; aborting.`);
    process.exitCode = 1;
    return;
  }

  console.log(`${candidates.length} candidate(s) after dedupe + relevance gate (last ${days}d)`);

  // Stamp the date from the publishedAfter window's "now" without Date APIs in
  // the digest body? We need a date string for the header; derive from newest
  // candidate or fall back to a generic label.
  const today = candidates[0]?.date ?? new Date().toISOString().slice(0, 10);
  const digest = buildDigest(candidates, today);

  if (printOnly) {
    console.log('\n' + digest);
    return;
  }

  if (candidates.length === 0) {
    console.log('No new candidates; skipping Feishu post.');
    return;
  }

  const webhook = process.env.FEISHU_TUTORIALS_WEBHOOK;
  if (!webhook) {
    console.error('Missing FEISHU_TUTORIALS_WEBHOOK; printing digest instead:\n');
    console.log(digest);
    process.exitCode = 1;
    return;
  }
  await postToFeishu(webhook, process.env.FEISHU_TUTORIALS_SECRET, digest);
  console.log('Posted candidate digest to Feishu.');
}

void main();
