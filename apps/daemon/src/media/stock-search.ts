// `od media stock-search`: licensed stock photos for image slots in one call.
//
// Runs inside the agent's shell (no daemon round trip) with the provider keys
// the host injected: PEXELS_API_KEY first, PIXABAY_API_KEY as fallback. All
// slots are searched and downloaded concurrently under a per-request timeout
// and one overall budget, so a slow provider cannot stall the turn. Each file is
// requested at display width from the provider CDN, measured from its header,
// and recorded with its source and license in <outDir>/credits.json. Providers
// only match keywords, so each slot re-ranks a 20-photo pool by its alt text.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type StockProvider = 'pexels' | 'pixabay';
export type StockOrientation = 'landscape' | 'portrait' | 'square';

export type StockSlot = {
  id: string;
  query: string;
  /** Display width in CSS pixels; the file is requested at this width. */
  width?: number;
  orientation?: StockOrientation;
};

export type StockSlotResult = {
  id: string;
  query: string;
  status: 'ok' | 'not_found' | 'error' | 'budget_exceeded';
  provider?: StockProvider;
  path?: string;
  width?: number;
  height?: number;
  bytes?: number;
  alt?: string;
  author?: string;
  authorUrl?: string;
  sourceUrl?: string;
  license?: string;
  error?: string;
};

export type StockSearchOptions = {
  slots: StockSlot[];
  /** Project-relative directory for downloaded files (default assets/stock). */
  outDir?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  requestTimeoutMs?: number;
  budgetMs?: number;
  concurrency?: number;
  fetch?: typeof fetch;
  now?: () => number;
};

export type StockSearchReport = {
  providers: StockProvider[];
  slots: StockSlotResult[];
};

export class StockSearchConfigError extends Error {}

const LICENSES: Record<StockProvider, string> = {
  pexels: 'Pexels License (https://www.pexels.com/license/)',
  pixabay: 'Pixabay Content License (https://pixabay.com/service/license-summary/)',
};

type Candidate = {
  provider: StockProvider;
  downloadUrl: string;
  alt: string;
  author: string | undefined;
  authorUrl: string | undefined;
  sourceUrl: string;
};

// Providers rank by keyword relevance only; a photo whose alt merely mentions
// the subject ("an elderly woman reading, wearing glasses") can outrank one of
// the subject itself. Re-rank the candidate pool by how directly the alt text
// names the query subject, and demote people-led photos unless people were asked for.
const PEOPLE = /\b(woman|women|man|men|person|people|girl|boy|lady|child|children|kid|elderly|senior|couple|family|portrait|model)\b/i;
const PEOPLE_CJK = /(人|女|男|孩|老|客|员|家庭|模特)/;
const CJK = /[\u3400-\u9fff]/;

/**
 * Higher is a more direct match; 0 rejects the candidate. Alt text and tags are
 * English, so CJK queries keep provider order and only drop people-led photos.
 */
export function subjectScore(query: string, alt: string): number {
  const text = alt.toLowerCase();
  const lead = text.split(/[,.;]/)[0] ?? '';
  const wantsPeople = PEOPLE.test(query) || PEOPLE_CJK.test(query);
  const peopleLed = !wantsPeople && PEOPLE.test(lead);
  if (CJK.test(query)) return peopleLed ? 0 : 1;
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const hits = terms.filter((t) => text.includes(t)).length;
  if (hits === 0) return 0;
  let score = hits * 2;
  if (terms.some((t) => lead.includes(t))) score += 2;
  if (peopleLed) score -= 3;
  return Math.max(score, 0);
}

function pickBest(query: string, candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = subjectScore(query, candidate.alt);
    if (score > bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

function slotFileName(id: string): string {
  const safe = id.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${safe || 'image'}.jpg`;
}

async function getJson(fetchImpl: typeof fetch, url: string, headers: Record<string, string>, timeoutMs: number): Promise<any> {
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function searchPexels(fetchImpl: typeof fetch, key: string, slot: StockSlot, width: number, timeoutMs: number): Promise<Candidate[]> {
  const params = new URLSearchParams({ query: slot.query, per_page: '20' });
  if (slot.orientation) params.set('orientation', slot.orientation);
  if (CJK.test(slot.query)) params.set('locale', 'zh-CN');
  const body = await getJson(fetchImpl, `https://api.pexels.com/v1/search?${params}`, { authorization: key }, timeoutMs);
  const photos = Array.isArray(body?.photos) ? body.photos.filter((p: any) => typeof p?.src?.original === 'string') : [];
  return photos.map((photo: any): Candidate => ({
    provider: 'pexels',
    downloadUrl: `${photo.src.original}?auto=compress&cs=tinysrgb&w=${width}`,
    alt: String(photo.alt ?? ''),
    author: photo.photographer ? String(photo.photographer) : undefined,
    authorUrl: photo.photographer_url ? String(photo.photographer_url) : undefined,
    sourceUrl: String(photo.url ?? ''),
  }));
}

async function searchPixabay(fetchImpl: typeof fetch, key: string, slot: StockSlot, width: number, timeoutMs: number): Promise<Candidate[]> {
  const orientation = slot.orientation === 'landscape' ? 'horizontal' : slot.orientation === 'portrait' ? 'vertical' : 'all';
  const params = new URLSearchParams({ key, q: slot.query, image_type: 'photo', per_page: '20', safesearch: 'true', orientation });
  if (CJK.test(slot.query)) params.set('lang', 'zh');
  const body = await getJson(fetchImpl, `https://pixabay.com/api/?${params}`, {}, timeoutMs);
  const hits = Array.isArray(body?.hits) ? body.hits.filter((h: any) => typeof h?.webformatURL === 'string') : [];
  return hits.map((hit: any): Candidate => ({
    provider: 'pixabay',
    downloadUrl: width > 640 && typeof hit.largeImageURL === 'string' ? hit.largeImageURL : hit.webformatURL,
    alt: String(hit.tags ?? ''),
    author: hit.user ? String(hit.user) : undefined,
    authorUrl: hit.user && hit.user_id ? `https://pixabay.com/users/${hit.user}-${hit.user_id}/` : undefined,
    sourceUrl: String(hit.pageURL ?? ''),
  }));
}

/** Intrinsic size from a JPEG SOF or PNG IHDR header; null when unknown. */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1]!;
    const length = buf.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function stockSearch(options: StockSearchOptions): Promise<StockSearchReport> {
  const env = options.env ?? process.env;
  const keys: Partial<Record<StockProvider, string>> = {
    ...(env.PEXELS_API_KEY?.trim() ? { pexels: env.PEXELS_API_KEY.trim() } : {}),
    ...(env.PIXABAY_API_KEY?.trim() ? { pixabay: env.PIXABAY_API_KEY.trim() } : {}),
  };
  const providers = (['pexels', 'pixabay'] as const).filter((p) => keys[p]);
  if (providers.length === 0) {
    throw new StockSearchConfigError('no stock photo API key: set PEXELS_API_KEY or PIXABAY_API_KEY');
  }
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.requestTimeoutMs ?? 12_000;
  const deadline = now() + (options.budgetMs ?? 180_000);
  const cwd = options.cwd ?? process.cwd();
  const outDir = options.outDir ?? 'assets/stock';
  await mkdir(path.resolve(cwd, outDir), { recursive: true });

  const results = await mapLimit(options.slots, options.concurrency ?? 6, async (slot): Promise<StockSlotResult> => {
    const base = { id: slot.id, query: slot.query };
    const width = Math.min(Math.max(Math.round(slot.width ?? 1200), 200), 2400);
    let lastError: string | undefined;
    for (const provider of providers) {
      const remaining = deadline - now();
      if (remaining <= 0) return { ...base, status: 'budget_exceeded' };
      const budget = Math.min(timeoutMs, remaining);
      try {
        const search = provider === 'pexels' ? searchPexels : searchPixabay;
        const candidate = pickBest(slot.query, await search(fetchImpl, keys[provider]!, slot, width, budget));
        if (!candidate) continue;
        const res = await fetchImpl(candidate.downloadUrl, { signal: AbortSignal.timeout(Math.min(timeoutMs, Math.max(deadline - now(), 1))) });
        if (!res.ok) throw new Error(`download HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const size = imageSize(buf);
        const rel = path.posix.join(outDir.split(path.sep).join('/'), slotFileName(slot.id));
        await writeFile(path.resolve(cwd, rel), buf);
        return {
          ...base,
          status: 'ok',
          provider,
          path: rel,
          ...(size ?? {}),
          bytes: buf.length,
          alt: candidate.alt,
          ...(candidate.author ? { author: candidate.author } : {}),
          ...(candidate.authorUrl ? { authorUrl: candidate.authorUrl } : {}),
          sourceUrl: candidate.sourceUrl,
          license: LICENSES[provider],
        };
      } catch (error) {
        lastError = `${provider}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    return lastError ? { ...base, status: 'error', error: lastError } : { ...base, status: 'not_found' };
  });

  await writeCredits(path.resolve(cwd, outDir, 'credits.json'), results.filter((r) => r.status === 'ok'));
  return { providers, slots: results };
}

async function writeCredits(file: string, fresh: StockSlotResult[]): Promise<void> {
  if (fresh.length === 0) return;
  let existing: Array<Partial<StockSlotResult>> = [];
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (Array.isArray(parsed)) existing = parsed;
  } catch {
    // No prior credits file.
  }
  const byPath = new Map<string | undefined, Partial<StockSlotResult> | Record<string, unknown>>(
    existing.map((entry) => [entry.path, entry]),
  );
  for (const entry of fresh) {
    byPath.set(entry.path, {
      id: entry.id, query: entry.query, status: entry.status, provider: entry.provider, path: entry.path,
      alt: entry.alt, author: entry.author, authorUrl: entry.authorUrl, sourceUrl: entry.sourceUrl, license: entry.license,
    });
  }
  await writeFile(file, `${JSON.stringify([...byPath.values()], null, 2)}\n`);
}
