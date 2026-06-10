/*
 * youtube-tutorials/youtube — YouTube Data API v3 client shared by the daily
 * notifier (candidate discovery) and the selected-entry generator.
 */
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { iso8601ToSeconds, scoreCandidate, type CandidateScore, type VideoInput } from './lib.ts';

export const DEFAULT_QUERIES = [
  'open design open source claude design alternative',
  'open design ai design agent github',
  'open design nexu io design agent',
  'open design 开源 设计 agent claude',
];

export async function loadYoutubeKey(): Promise<string> {
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

export async function fetchVideoDetails(ids: string[], key: string): Promise<VideoInput[]> {
  const out: VideoInput[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const data = await ytGet<{ items: VideoItem[] }>(
      'videos',
      { part: 'snippet,contentDetails,statistics', id: batch.join(',') },
      key,
    );
    out.push(...data.items.map(toVideoInput));
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

export type ScoredCandidate = VideoInput & { score: CandidateScore };

export interface CandidateResult {
  candidates: ScoredCandidate[];
  searchFailures: number;
  queryCount: number;
}

/**
 * Discover Open-Design-relevant tutorial candidates published since
 * `publishedAfter` (RFC 3339), already filtered against the existing catalogue
 * (caller passes known ids) and the LLM relevance gate. Each kept candidate is
 * scored (completeness + relevance + reach) and the list is sorted by that
 * suggested score descending. The caller owns the window start so it can derive
 * a gap-free watermark instead of a fixed wall-clock window.
 */
export async function fetchCandidates(
  key: string,
  publishedAfter: string,
  existingIds: Set<string>,
  queries: string[] = DEFAULT_QUERIES,
): Promise<CandidateResult> {
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
  // Any search failure means this sweep is incomplete: the failed query's
  // results for this window are unknown. Return early (caller aborts) so the
  // watermark does not advance past an incomplete sweep and skip those
  // candidates permanently — the next run re-covers the same window.
  if (searchFailures > 0) return { candidates: [], searchFailures, queryCount: queries.length };

  const fresh = [...idSet].filter((id) => !existingIds.has(id));
  if (fresh.length === 0) return { candidates: [], searchFailures, queryCount: queries.length };

  const videos = await fetchVideoDetails(fresh, key);
  const scored = await mapPool(videos, 4, async (v) => ({ ...v, score: await scoreCandidate(v) }));
  const candidates = scored
    .filter((c) => c.score.isOpenDesign)
    // Recommended ("worth adding") first, then highest suggested score, then
    // newest — so the actionable picks cluster at the top of the digest.
    .sort(
      (a, b) =>
        Number(b.score.recommend) - Number(a.score.recommend) ||
        b.score.overall - a.score.overall ||
        (a.date < b.date ? 1 : a.date > b.date ? -1 : 0),
    );
  return { candidates, searchFailures, queryCount: queries.length };
}

/** Fetch specific videos by id (for generating maintainer-approved entries). */
export async function fetchByIds(key: string, ids: string[]): Promise<VideoInput[]> {
  if (ids.length === 0) return [];
  return fetchVideoDetails(ids, key);
}
