/*
 * fetch-youtube-tutorials — daily cron entry. Queries the YouTube Data API v3
 * for recent community tutorials about Open Design, filters out videos already
 * in the catalogue and lookalike products, then writes new `*.md` entries using
 * the shared LLM copy generator.
 *
 * Usage:
 *   tsx scripts/youtube-tutorials/fetch-youtube-tutorials.ts [--days 14] [--dry-run]
 *
 * Env:
 *   YOUTUBE_API_KEY     required (or ~/.youtube/.env)
 *   ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL   for copy gen
 *   TUTORIALS_QUERIES   optional, '||'-separated search queries (override default)
 *
 * The GitHub Actions workflow runs this, then opens a PR if new files appear.
 */
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  isAboutOpenDesign,
  iso8601ToSeconds,
  readExistingSlugs,
  readExistingVideoIds,
  writeTutorial,
  type VideoInput,
} from './lib.ts';

const DEFAULT_QUERIES = [
  'open design open source claude design alternative',
  'open design ai design agent github',
  'open design nexu io design agent',
  'open design 开源 设计 agent claude',
];

async function loadYoutubeKey(): Promise<string> {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;
  try {
    const raw = await readFile(path.join(os.homedir(), '.youtube', '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*YOUTUBE_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* fall through */
  }
  throw new Error('Missing YOUTUBE_API_KEY (env or ~/.youtube/.env)');
}

interface SearchItem {
  id?: { videoId?: string };
}
interface VideoItem {
  id: string;
  snippet: {
    title: string;
    channelTitle: string;
    publishedAt: string;
    description: string;
    defaultAudioLanguage?: string;
    defaultLanguage?: string;
  };
  contentDetails: { duration: string };
  statistics?: { viewCount?: string };
}

async function ytGet<T>(endpoint: string, params: Record<string, string>, key: string): Promise<T> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', key);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube ${endpoint} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

async function searchVideoIds(query: string, publishedAfter: string, key: string): Promise<string[]> {
  const data = await ytGet<{ items: SearchItem[] }>(
    'search',
    { part: 'snippet', q: query, type: 'video', order: 'date', maxResults: '50', publishedAfter },
    key,
  );
  return data.items.map((i) => i.id?.videoId).filter((v): v is string => Boolean(v));
}

async function fetchVideoDetails(ids: string[], key: string): Promise<VideoItem[]> {
  const out: VideoItem[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const data = await ytGet<{ items: VideoItem[] }>(
      'videos',
      { part: 'snippet,contentDetails,statistics', id: batch.join(',') },
      key,
    );
    out.push(...data.items);
  }
  return out;
}

function toVideoInput(v: VideoItem): VideoInput {
  const lang = v.snippet.defaultAudioLanguage || v.snippet.defaultLanguage;
  return {
    videoId: v.id,
    title: v.snippet.title.trim(),
    author: v.snippet.channelTitle.trim(),
    date: v.snippet.publishedAt.slice(0, 10),
    durationSeconds: Math.max(1, iso8601ToSeconds(v.contentDetails.duration)),
    description: v.snippet.description ?? '',
    language: lang ? lang.split('-')[0] : undefined,
    viewCount: v.statistics?.viewCount ? Number(v.statistics.viewCount) : undefined,
  };
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const daysIdx = args.indexOf('--days');
  const days = daysIdx !== -1 ? Number(args[daysIdx + 1]) : 14;

  const key = await loadYoutubeKey();
  const queries = process.env.TUTORIALS_QUERIES
    ? process.env.TUTORIALS_QUERIES.split('||').map((q) => q.trim()).filter(Boolean)
    : DEFAULT_QUERIES;

  // publishedAfter window. Date.now is acceptable here (no resume semantics).
  const publishedAfter = new Date(Date.now() - days * 86400_000).toISOString();

  const idSet = new Set<string>();
  let searchFailures = 0;
  for (const q of queries) {
    try {
      for (const id of await searchVideoIds(q, publishedAfter, key)) idSet.add(id);
    } catch (e) {
      searchFailures++;
      console.error(`search failed for "${q}": ${(e as Error).message}`);
    }
  }
  console.log(`Found ${idSet.size} unique video ids across ${queries.length} queries (last ${days}d)`);

  // Fail loud instead of drifting silently: if every query errored (e.g. an API
  // outage or bad key), an empty result set is indistinguishable from "nothing
  // new". Exit non-zero so the scheduled run is observably red, not falsely green.
  if (searchFailures === queries.length) {
    console.error(`All ${queries.length} search queries failed; aborting without writing.`);
    process.exitCode = 1;
    return;
  }

  const existingIds = await readExistingVideoIds();
  const candidateIds = [...idSet].filter((id) => !existingIds.has(id));
  console.log(`${candidateIds.length} not yet in catalogue`);
  if (candidateIds.length === 0) return;

  const details = await fetchVideoDetails(candidateIds, key);
  const videos = details.map(toVideoInput);

  // Relevance gate, then generate.
  const gated = await mapPool(videos, 4, async (v) => ({ v, ok: await isAboutOpenDesign(v) }));
  const kept = gated.filter((r) => r.ok).map((r) => r.v);
  for (const r of gated.filter((r) => !r.ok)) {
    console.log(`  - rejected (not Open Design): ${r.v.videoId} | ${r.v.author} | ${r.v.title}`);
  }
  console.log(`Gate: ${kept.length} relevant, ${gated.length - kept.length} rejected`);

  if (dryRun) {
    for (const v of kept) console.log(`  would add: ${v.videoId} | ${v.date} | ${v.author} | ${v.title}`);
    return;
  }

  const takenSlugs = await readExistingSlugs();
  let ok = 0;
  let failed = 0;
  await mapPool(kept, 4, async (v) => {
    try {
      const slug = await writeTutorial(v, takenSlugs);
      ok++;
      console.log(`  + ${slug} <- ${v.videoId} (${v.author})`);
    } catch (e) {
      failed++;
      console.error(`  ! failed ${v.videoId}: ${(e as Error).message}`);
    }
  });
  console.log(`Done: ${ok}/${kept.length} new tutorials written, ${failed} failed`);

  // A kept (relevant) video that cannot be written would otherwise vanish: the
  // git-status PR step only sees the files that did land. Exit non-zero so a
  // partial sync surfaces, mirroring the backfill script's exit 2.
  if (failed > 0) process.exitCode = 2;
}

void main();
