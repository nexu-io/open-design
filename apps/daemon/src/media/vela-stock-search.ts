import { isStockProvider } from '@open-design/contracts';
import type { StockProvider, StockSearchAttempt, StockSlot } from '@open-design/contracts';
import { runVelaCommand, velaWorkspaceCommandOptions } from '../integrations/vela-command.js';

export type StockSearchCandidate = {
  id: string;
  status: 'ok' | 'not_found' | 'error' | 'budget_exceeded';
  provider?: StockProvider;
  downloadUrl?: string;
  alt?: string;
  author?: string;
  authorUrl?: string;
  sourceUrl?: string;
  license?: string;
  error?: string;
  attempts: StockSearchAttempt[];
};
export type VelaStockSearchInput = {
  slots: StockSlot[];
  requestTimeoutMs: number;
  budgetMs: number;
  concurrency: number;
  workspaceId?: string;
};
export type StockSearchServiceReport = { providers: StockProvider[]; slots: StockSearchCandidate[] };

/** Reuse Vela's login, executable resolver and workspace authority. No provider keys. */
export async function searchVelaStockPhotos(
  input: VelaStockSearchInput,
  runCommand: typeof runVelaCommand = runVelaCommand,
): Promise<StockSearchServiceReport> {
  const stdout = await runCommand(['media', 'stock-search', '--request-file', '-', '--json'], {
    ...velaWorkspaceCommandOptions(input.workspaceId),
    input: JSON.stringify({ slots: input.slots, request_timeout_ms: input.requestTimeoutMs,
      budget_ms: input.budgetMs, concurrency: input.concurrency, max_attempts: 6 }),
    timeoutMs: input.budgetMs + 5_000,
  });
  const body = JSON.parse(stdout);
  if (!body || !Array.isArray(body.providers) || body.providers.length > 6 || body.providers.some((p: unknown) => !isStockProvider(p)) || new Set(body.providers).size !== body.providers.length
    || !Array.isArray(body.slots) || body.slots.length !== input.slots.length) throw new Error('invalid stock service response');
  const slots = body.slots.map((slot: any, index: number): StockSearchCandidate => {
    if (slot?.id !== input.slots[index]!.id || !['ok', 'error', 'not_found', 'budget_exceeded'].includes(slot.status)
      || !Array.isArray(slot.attempts) || slot.attempts.length > body.providers.length || new Set(slot.attempts.map((attempt: any) => attempt?.provider)).size !== slot.attempts.length) throw new Error('invalid stock service slot');
    const attempts = slot.attempts.map((a: any): StockSearchAttempt => {
      if (!a || !isStockProvider(a.provider) || !body.providers.includes(a.provider) || a.stage !== 'search'
        || !['ok', 'not_found', 'error'].includes(a.status) || typeof a.timestamp !== 'string'
        || !Number.isFinite(Date.parse(a.timestamp)) || !Number.isFinite(a.duration_ms) || a.duration_ms < 0
        || (a.http_status !== null && (!Number.isInteger(a.http_status) || a.http_status < 100 || a.http_status > 599))) {
        throw new Error('invalid stock service attempt');
      }
      const quota = a.rate_limit;
      const validQuota = quota && ['limit', 'remaining', 'reset_unix'].every(key => quota[key] === null
        || (Number.isSafeInteger(quota[key]) && quota[key] >= 0));
      return { provider: a.provider, stage: 'search', status: a.status, timestamp: a.timestamp,
        httpStatus: a.http_status, durationMs: a.duration_ms, rateLimited: a.http_status === 429,
        ...(validQuota ? { rateLimit: { period: 'month', limit: quota.limit, remaining: quota.remaining, resetUnix: quota.reset_unix } } : {}),
        ...(typeof a.retry_after === 'string' ? { retryAfter: a.retry_after.slice(0, 80) } : {}),
        // The API exposes fixed error codes, never a provider body or credential.
        ...(typeof a.error === 'string' ? { error: a.error.slice(0, 120) } : {}),
      };
    });
    if (slot.status === 'ok' && (!isStockProvider(slot.provider) || !body.providers.includes(slot.provider)
      || typeof slot.download_url !== 'string' || typeof slot.source_url !== 'string' || typeof slot.license !== 'string')) {
      throw new Error('invalid stock service candidate');
    }
    return { id: slot.id, status: slot.status, provider: slot.provider, downloadUrl: slot.download_url,
      alt: typeof slot.alt === 'string' ? slot.alt : '', author: slot.author, authorUrl: slot.author_url,
      sourceUrl: slot.source_url, license: slot.license, error: slot.error, attempts };
  });
  return { providers: body.providers, slots };
}
