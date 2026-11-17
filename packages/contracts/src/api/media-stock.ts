export type StockProvider = string;
/** Stable service-managed channel IDs; never URLs or credentials. */
export const isStockProvider = (value: unknown): value is StockProvider => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
export type StockOrientation = 'landscape' | 'portrait' | 'square';

/** Quota headers describe the monthly API window, not the hourly budget. */
export type StockRateLimit = {
  period: 'month';
  limit: number | null;
  remaining: number | null;
  resetUnix: number | null;
};

export type StockSearchAttempt = {
  provider: StockProvider;
  stage: 'search' | 'download';
  status: 'ok' | 'not_found' | 'error';
  timestamp: string;
  /** Monotonic elapsed time; downloads include decoding and writing bytes. */
  durationMs: number;
  httpStatus: number | null;
  rateLimited: boolean;
  rateLimit?: StockRateLimit;
  retryAfter?: string;
  error?: string;
};

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
  /** Includes failed providers even when a later provider succeeds. */
  attempts?: StockSearchAttempt[];
};

export type StockSearchReport = {
  providers: StockProvider[];
  slots: StockSlotResult[];
};

export interface StockSearchRequest {
  slots: StockSlot[];
  /** Relative to the authorized project; defaults to assets/stock. */
  outDir?: string;
  requestTimeoutMs?: number;
  budgetMs?: number;
  concurrency?: number;
}

export interface StockSearchResponse extends StockSearchReport {
  telemetry: { callId: string; collectionStatus: 'complete' | 'failed' | 'disabled' };
}

/** The caller cannot supply credentials, cwd, or project/run authority. */
export function parseStockSearchRequest(input: unknown): StockSearchRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('stock search request must be an object');
  const body = input as Record<string, unknown>;
  const allowed = new Set(['slots', 'outDir', 'requestTimeoutMs', 'budgetMs', 'concurrency']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new Error('unsupported stock search request field');
  if (!Array.isArray(body.slots) || body.slots.length < 1 || body.slots.length > 30) throw new Error('stock search requires 1–30 slots');
  const slots: StockSlot[] = body.slots.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid image slot');
    const slot = value as Record<string, unknown>;
    if (Object.keys(slot).some((key) => !['id', 'query', 'width', 'orientation'].includes(key))
      || typeof slot.id !== 'string' || !slot.id.trim()
      || typeof slot.query !== 'string' || !slot.query.trim()
      || (slot.width !== undefined && (typeof slot.width !== 'number' || !Number.isFinite(slot.width)))
      || (slot.orientation !== undefined && (typeof slot.orientation !== 'string' || !['landscape', 'portrait', 'square'].includes(slot.orientation)))) {
      throw new Error('each slot needs id, query, optional finite width and landscape/portrait/square orientation');
    }
    return slot as unknown as StockSlot;
  });
  for (const name of ['requestTimeoutMs', 'budgetMs', 'concurrency'] as const) {
    const value = body[name];
    if (value !== undefined && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)) throw new Error(`${name} must be a finite positive integer`);
  }
  if (body.outDir !== undefined && (typeof body.outDir !== 'string' || !body.outDir.trim())) throw new Error('outDir must be a project-relative directory');
  return { ...body, slots } as StockSearchRequest;
}
