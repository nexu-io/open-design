/*
 * backfill-tutorials — one-off importer that turns pre-fetched yt-dlp JSON
 * lines into `app/content/tutorials/*.md` entries, reusing the same LLM copy
 * generation and slug rules as the daily cron.
 *
 * Usage:
 *   tsx scripts/youtube-tutorials/backfill-tutorials.ts <videos.jsonl> [--dry-run]
 *
 * Each input line is a yt-dlp `-j` info object. Videos already present in the
 * content dir (by youtubeId) are skipped. Requires ANTHROPIC_AUTH_TOKEN (or
 * ANTHROPIC_API_KEY) + ANTHROPIC_BASE_URL in the environment.
 */
import { readFile } from 'node:fs/promises';
import {
  isAboutOpenDesign,
  readExistingSlugs,
  readExistingVideoIds,
  writeTutorial,
  type VideoInput,
} from './lib.ts';

interface YtdlpInfo {
  id: string;
  title: string;
  channel?: string;
  uploader?: string;
  duration?: number;
  upload_date?: string; // YYYYMMDD
  language?: string;
  view_count?: number;
  description?: string;
}

function toVideoInput(o: YtdlpInfo): VideoInput {
  const d = o.upload_date ?? '';
  const date = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
  return {
    videoId: o.id,
    title: o.title.trim(),
    author: (o.channel || o.uploader || 'Community').trim(),
    date,
    durationSeconds: Math.max(1, Math.round(o.duration ?? 0)),
    description: o.description ?? '',
    language: o.language ? o.language.split('-')[0] : undefined,
    viewCount: o.view_count,
  };
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const noGate = args.includes('--no-gate');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: tsx backfill-tutorials.ts <videos.jsonl> [--dry-run]');
    process.exit(1);
  }

  const raw = await readFile(file, 'utf8');
  const videos = raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => toVideoInput(JSON.parse(l) as YtdlpInfo));

  const existingIds = await readExistingVideoIds();
  const takenSlugs = await readExistingSlugs();

  const notDup = videos.filter((v) => !existingIds.has(v.videoId));
  console.log(`${videos.length} videos in, ${videos.length - notDup.length} already present, ${notDup.length} candidates`);

  // Relevance gate: titles alone produce false positives (lookalike products,
  // tool roundups that only mention OD in passing). Confirm each is actually
  // about Open Design before generating.
  let fresh = notDup;
  if (!noGate) {
    const verdicts = await mapPool(notDup, 4, async (v) => ({ v, ok: await isAboutOpenDesign(v) }));
    fresh = verdicts.filter((r) => r.ok).map((r) => r.v);
    for (const r of verdicts.filter((r) => !r.ok)) {
      console.log(`  - rejected (not Open Design): ${r.v.videoId} | ${r.v.author} | ${r.v.title}`);
    }
    console.log(`Gate: ${fresh.length} kept, ${notDup.length - fresh.length} rejected`);
  }

  if (dryRun) {
    for (const v of fresh) console.log(`  would add: ${v.videoId} | ${v.date} | ${v.author} | ${v.title}`);
    return;
  }

  let ok = 0;
  const results = await mapPool(fresh, 4, async (v) => {
    try {
      const slug = await writeTutorial(v, takenSlugs);
      ok++;
      console.log(`  + ${slug} <- ${v.videoId} (${v.author})`);
      return slug;
    } catch (e) {
      console.error(`  ! failed ${v.videoId} (${v.author}): ${(e as Error).message}`);
      return null;
    }
  });

  console.log(`Done: ${ok}/${fresh.length} written, ${results.filter((r) => r === null).length} failed`);
  if (results.some((r) => r === null)) process.exit(2);
}

void main();
