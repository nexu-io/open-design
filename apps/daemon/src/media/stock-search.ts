import { fetchPublicAsset } from '../public-asset-fetch.js';
// Company-managed stock search through Vela; download only into the authorized project.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { StockSearchAttempt, StockSlotResult, StockSearchReport, StockSearchRequest } from '@open-design/contracts';
import { searchVelaStockPhotos, type VelaStockSearchInput, type StockSearchServiceReport } from './vela-stock-search.js';
export type { StockProvider, StockOrientation, StockRateLimit, StockSearchAttempt, StockSlot, StockSlotResult, StockSearchReport } from '@open-design/contracts';

export type StockSearchOptions = StockSearchRequest & {
  cwd?: string;
  fetch?: typeof fetch;
  now?: () => number;
  workspaceId?: string;
  search?: (input: VelaStockSearchInput) => Promise<StockSearchServiceReport>;
  resolveOutputPath?: (relativePath: string) => Promise<string>;
  onAttempt?: (event: StockSearchAttempt & { slotId: string; slotIndex: number }) => void;
};
export class StockSearchServiceError extends Error {}
export class StockSearchInputError extends Error {}
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function slotFileName(id: string): string {
  const safe = id.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  // Canonical IDs keep readable paths; altered IDs retain their identity after
  // case folding, punctuation removal, truncation, or non-Latin normalization.
  const suffix = safe === id ? '' : `-${createHash('sha256').update(id).digest('hex').slice(0, 12)}`;
  return `${safe || 'image'}${suffix}.jpg`;
}

function validateExecutionInputs(options: StockSearchOptions): void {
  for (const [name, value] of [
    ['concurrency', options.concurrency],
    ['requestTimeoutMs', options.requestTimeoutMs],
    ['budgetMs', options.budgetMs],
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
      throw new StockSearchInputError(`${name} must be a finite positive integer`);
    }
  }
  const files = new Set<string>();
  for (const slot of options.slots) {
    const file = slotFileName(slot.id);
    if (files.has(file)) throw new StockSearchInputError('slot IDs must map to distinct image files');
    files.add(file);
  }
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
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return out;
}

async function boundedImageBody(response: Response): Promise<Buffer> {
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_IMAGE_BYTES) throw new Error('stock image exceeds size limit');
  if (!response.body) throw new Error('invalid stock image body');
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) throw new Error('stock image exceeds size limit');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export async function stockSearch(options: StockSearchOptions): Promise<StockSearchReport> {
  validateExecutionInputs(options);
  const now = options.now ?? Date.now;
  const requestTimeoutMs = Math.min(options.requestTimeoutMs ?? 12_000, 12_000);
  const budgetMs = Math.min(options.budgetMs ?? 180_000, 180_000);
  const concurrency = Math.min(options.concurrency ?? 6, 6);
  const deadline = now() + budgetMs;
  let report: StockSearchServiceReport;
  try {
    report = await (options.search ?? searchVelaStockPhotos)({ slots: options.slots, requestTimeoutMs, budgetMs,
      concurrency, ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}) });
  } catch {
    throw new StockSearchServiceError('stock search service unavailable; use web search for missing slots');
  }
  const outDir = options.outDir ?? 'assets/stock';
  const cwd = options.cwd ?? process.cwd();
  const resolveOutputPath = options.resolveOutputPath ?? (async (rel: string) => path.resolve(cwd, rel));
  await mkdir(await resolveOutputPath(outDir), { recursive: true });
  const results = await mapLimit(report.slots, concurrency, async (candidate, slotIndex): Promise<StockSlotResult> => {
    const slot = options.slots[slotIndex]!;
    const attempts = [...candidate.attempts];
    const emit = (attempt: StockSearchAttempt) => {
      try { options.onAttempt?.({ ...attempt, slotId: slot.id, slotIndex }); } catch { /* logging must not change acquisition */ }
    };
    attempts.forEach(emit);
    const base = { id: slot.id, query: slot.query, attempts };
    if (candidate.status !== 'ok') return { ...base, status: candidate.status, ...(candidate.error ? { error: candidate.error } : {}) };
    if (now() >= deadline) return { ...base, status: 'budget_exceeded' };
    const provider = candidate.provider!;
    const started = performance.now();
    let httpStatus: number | null = null;
    const record = (status: 'ok' | 'error', error?: string) => {
      const attempt: StockSearchAttempt = { provider, stage: 'download', status, timestamp: new Date().toISOString(),
        durationMs: performance.now() - started, httpStatus, rateLimited: httpStatus === 429, ...(error ? { error } : {}) };
      attempts.push(attempt); emit(attempt);
    };
    try {
      const response = await fetchPublicAsset(candidate.downloadUrl!, {
        signal: AbortSignal.timeout(Math.min(requestTimeoutMs, Math.max(1, deadline - now()))) },
        { httpsOnly: true, ...(options.fetch ? { fetch: options.fetch } : {}) });
      httpStatus = response.status;
      if (!response.ok) throw new Error(`download HTTP ${httpStatus}`);
      const buf = await boundedImageBody(response);
      const size = imageSize(buf);
      if (!size || size.width < 1 || size.height < 1) throw new Error('invalid stock image content');
      const rel = path.posix.join(outDir.split(path.sep).join('/'), slotFileName(slot.id));
      await writeFile(await resolveOutputPath(rel), buf);
      record('ok');
      return { ...base, status: 'ok', provider, path: rel, ...size, bytes: buf.length,
        alt: candidate.alt ?? '', ...(candidate.author ? { author: candidate.author } : {}), ...(candidate.authorUrl ? { authorUrl: candidate.authorUrl } : {}), sourceUrl: candidate.sourceUrl ?? '', license: candidate.license ?? '' };
    } catch (error) {
      // Fixed diagnostics keep arbitrary upstream/body/filesystem text out of tool output.
      const timeout = error instanceof Error && /timeout|abort/i.test(error.name);
      const message = timeout ? 'stock image download timed out' : httpStatus !== null && httpStatus >= 400
        ? `download HTTP ${httpStatus}` : 'invalid or unavailable stock image';
      record('error', message);
      return { ...base, status: now() >= deadline ? 'budget_exceeded' : 'error', error: message };
    }
  });
  await writeCredits(path.posix.join(outDir, 'credits.json'), results.filter(r => r.status === 'ok'), resolveOutputPath);
  return { providers: report.providers, slots: results };
}

async function writeCredits(file: string, fresh: StockSlotResult[], resolveOutputPath: (relativePath: string) => Promise<string>): Promise<void> {
  if (fresh.length === 0) return;
  // Resolve before the read catch so a rejected symlink cannot be treated as a missing file.
  const target = await resolveOutputPath(file);
  let existing: Array<Partial<StockSlotResult>> = [];
  try {
    const parsed = JSON.parse(await readFile(target, 'utf8'));
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
  await writeFile(await resolveOutputPath(file), `${JSON.stringify([...byPath.values()], null, 2)}\n`);
}
