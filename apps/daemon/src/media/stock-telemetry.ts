import { isStockProvider } from '@open-design/contracts';
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MEDIA_STOCK_BATCH_LIMITS, type MediaStockCommonProps, type MediaStockError, type MediaStockTelemetryEvent } from '@open-design/contracts/analytics';
import type { StockSearchAttempt, StockSearchReport } from './stock-search.js';
import { readAppConfig } from '../app-config.js';

export const STOCK_TELEMETRY_LIMITS = {
  callBytes: MEDIA_STOCK_BATCH_LIMITS.bytes, spoolBytes: 32 * 1024 * 1024, files: 1024,
  events: MEDIA_STOCK_BATCH_LIMITS.events, callsPerPass: 4, pollMs: 30_000, partialAfterMs: 10 * 60_000,
  retentionMs: 7 * 24 * 60 * 60_000,
} as const;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ID = /^[a-zA-Z0-9_.:-]{1,128}$/;
const sourceId = (value: string | null | undefined): string | null => value && ID.test(value) ? value : null;
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
export const stockTelemetryDir = (dataDir: string): string => path.join(dataDir, 'media-stock-telemetry');

async function admissionIsStale(lock: string): Promise<boolean> {
  try {
    const owner = Number(await readFile(path.join(lock, 'owner'), 'utf8'));
    if (Number.isSafeInteger(owner) && owner > 0) {
      try { process.kill(owner, 0); } catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; }
    }
    return false;
  } catch {
    const info = await stat(lock).catch(() => null);
    return info !== null && Date.now() - info.mtimeMs > 60_000;
  }
}

async function recoverAdmission(lock: string): Promise<void> {
  // Recovery must re-read ownership exclusively: another recovery may already
  // have replaced the dead owner's lock with a live writer's lock.
  const recovery = `${lock}-recovery`;
  try { await mkdir(recovery); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return;
    throw error;
  }
  try { if (await admissionIsStale(lock)) await rm(lock, { recursive: true, force: true }); }
  finally { await rm(recovery, { recursive: true, force: true }); }
}

export function stockErrorType(attempt: Pick<StockSearchAttempt, 'status' | 'httpStatus' | 'error'>): MediaStockError {
  if (attempt.status !== 'error') return 'none';
  if (attempt.httpStatus === 429) return 'rate_limit_429';
  if (attempt.httpStatus !== null && attempt.httpStatus >= 400) return 'http_error';
  if (/timeout|timed out|abort/i.test(attempt.error ?? '')) return 'timeout';
  if (/EACCES|ENOSPC|ENOENT|write/i.test(attempt.error ?? '')) return 'write_error';
  if (attempt.httpStatus === null) return 'network_error';
  if (/json|unexpected token|parse/i.test(attempt.error ?? '')) return 'invalid_response';
  return 'unknown';
}

type Header = {
  kind: 'start'; schemaVersion: 1; callId: string; startedAt: string; slotCount: number;
  context: Omit<MediaStockCommonProps, 'slot_index' | 'collection_status'>;
  sessionId: string | null;
  writerPid: number;
  uploadAllowed: boolean;
  identity: { deviceId: string; sessionId: string; clientType?: 'web' | 'desktop' | 'external_mcp'; locale?: string } | null;
};
type Footer = { kind: 'end'; eventCount: number; finishedAt: string };
export type StockJournal = { header: Header; events: MediaStockTelemetryEvent[]; complete: boolean };
export interface StockRecorder {
  callId: string;
  record(event: StockSearchAttempt & { slotIndex: number }): void;
  finish(report: StockSearchReport): Promise<'complete' | 'failed' | 'disabled'>;
}

/** The inherited OD_DATA_DIR is the resolved daemon root; there is no cwd fallback. */
export async function createStockRecorder(args: {
  env?: NodeJS.ProcessEnv; slotCount: number;
}): Promise<StockRecorder> {
  const env = args.env ?? process.env;
  const callId = randomUUID();
  const dataDir = env.OD_DATA_DIR;
  const disabled: StockRecorder = { callId, record: () => {}, finish: async () => 'disabled' };
  if (!dataDir || !path.isAbsolute(dataDir)) return disabled;
  const dir = stockTelemetryDir(dataDir);
  const active = path.join(dir, `${callId}.active.jsonl`);
  const context: Header['context'] = {
    call_id: callId, stock_schema_version: 1,
    run_id: sourceId(env.OD_STOCK_RUN_ID), project_id: sourceId(env.OD_PROJECT_ID),
    node_id: sourceId(env.OD_STOCK_NODE_ID), evaluation_run_id: sourceId(env.OD_STOCK_EVALUATION_RUN_ID),
    case_id: sourceId(env.OD_STOCK_CASE_ID),
    source_commit: /^[a-f0-9]{40}$/i.test(env.OD_STOCK_SOURCE_COMMIT ?? '') ? env.OD_STOCK_SOURCE_COMMIT! : null,
    execution_source: env.OD_STOCK_EXECUTION_SOURCE === 'validation' ? 'validation'
      : env.OD_STOCK_EXECUTION_SOURCE === 'evaluation' ? 'evaluation'
      : env.OD_STOCK_RUN_ID ? 'product' : 'standalone',
  };
  let uploadAllowed = false;
  let installationId: string | null = null;
  try {
    const cfg = await readAppConfig(dataDir);
    uploadAllowed = cfg.telemetry?.metrics === true;
    installationId = sourceId(cfg.installationId);
  } catch { /* consent or identity unknown */ }
  const deviceId = sourceId(env.OD_STOCK_ANALYTICS_DEVICE_ID) ?? installationId;
  const clientType = env.OD_STOCK_ANALYTICS_CLIENT_TYPE;
  const locale = env.OD_STOCK_ANALYTICS_LOCALE;
  const identity: Header['identity'] = deviceId ? {
    deviceId, sessionId: sourceId(env.OD_STOCK_ANALYTICS_SESSION_ID) ?? sourceId(env.OD_STOCK_SESSION_ID) ?? callId,
    ...(clientType === 'web' || clientType === 'desktop' || clientType === 'external_mcp' ? { clientType } : {}),
    ...(locale && /^[A-Za-z-]{1,24}$/.test(locale) ? { locale } : {}),
  } : null;
  const header: Header = {
    kind: 'start', schemaVersion: 1, callId, startedAt: new Date().toISOString(),
    slotCount: args.slotCount, context, sessionId: sourceId(env.OD_STOCK_SESSION_ID),
    writerPid: process.pid, uploadAllowed,
    identity,
  };
  let failed = false;
  let bytes = 0;
  let eventCount = 0;
  let pending = Promise.resolve();
  const append = (value: Header | Footer | MediaStockTelemetryEvent) => {
    const line = `${JSON.stringify(value)}\n`;
    bytes += Buffer.byteLength(line);
    if (bytes > STOCK_TELEMETRY_LIMITS.callBytes) { failed = true; return; }
    pending = pending.then(async () => {
      if (!failed) await appendFile(active, line, { mode: 0o600 });
    }).catch(() => { failed = true; });
  };
  try {
    await mkdir(dir, { recursive: true });
    const lock = path.join(dir, '.admission');
    let locked = false;
    const until = performance.now() + 250;
    while (!locked && performance.now() < until) {
      try {
        await mkdir(lock);
        locked = true;
        await writeFile(path.join(lock, 'owner'), String(process.pid), { mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (await admissionIsStale(lock)) await recoverAdmission(lock);
        else await new Promise(resolve => setTimeout(resolve, 5));
      }
    }
    if (!locked) throw new Error('stock telemetry admission busy');
    try {
      const names = (await readdir(dir)).filter(name => name.endsWith('.jsonl'));
      let spoolBytes = 0;
      for (const name of names) spoolBytes += name.includes('.active.')
        ? STOCK_TELEMETRY_LIMITS.callBytes : (await stat(path.join(dir, name)).catch(() => null))?.size ?? 0;
      // Reserve one maximum-size call. Full spools fail telemetry, never image acquisition.
      if (names.length >= STOCK_TELEMETRY_LIMITS.files
        || spoolBytes + STOCK_TELEMETRY_LIMITS.callBytes > STOCK_TELEMETRY_LIMITS.spoolBytes) failed = true;
      if (!failed) await writeFile(active, '', { flag: 'wx', mode: 0o600 });
    } finally { await rm(lock, { recursive: true, force: true }); }
  } catch { failed = true; }
  append(header);
  const common = (slot_index: number): MediaStockCommonProps => ({ ...context, slot_index, collection_status: 'partial' });
  return {
    callId,
    record: (attempt) => {
      if (eventCount >= STOCK_TELEMETRY_LIMITS.events) { failed = true; return; }
      append({
        id: `${callId}:request:${eventCount++}`, timestamp: attempt.timestamp,
        event: 'media_stock_request_result',
        properties: {
          ...common(attempt.slotIndex), provider: attempt.provider, stage: attempt.stage,
          result: attempt.status, http_status: attempt.httpStatus, error_type: stockErrorType(attempt),
          duration_ms: attempt.durationMs, credential_ref: null,
          rate_limited: attempt.httpStatus === 429,
          quota_limit: attempt.rateLimit?.limit ?? null, quota_remaining: attempt.rateLimit?.remaining ?? null,
          quota_reset_unix: attempt.rateLimit?.resetUnix ?? null, retry_after: attempt.retryAfter ?? null,
        },
      });
    },
    finish: async (report) => {
      for (const [index, slot] of report.slots.entries()) {
        const attempts = slot.attempts ?? [];
        const pexels = attempts.filter(attempt => attempt.provider === 'pexels');
        const primary = report.providers[0] ?? null;
        const searches = attempts.filter(attempt => attempt.stage === 'search');
        const fallback = searches.some(attempt => attempt.provider !== primary);
        const lastPrimary = searches.filter(attempt => attempt.provider === primary).at(-1);
        append({
          id: `${callId}:slot:${index}`, timestamp: new Date().toISOString(), event: 'media_stock_slot_result',
          properties: {
            ...common(index), provider: slot.provider ?? null, result: slot.status,
            pexels_attempted: pexels.length > 0, primary_provider: primary,
            attempted_providers: [...new Set(searches.map(attempt => attempt.provider))], fallback_attempted: fallback,
            fallback_reason: fallback && lastPrimary
              ? lastPrimary.status === 'not_found' ? 'not_found' : stockErrorType(lastPrimary) : 'none',
            fallback_succeeded: fallback && slot.status === 'ok' && slot.provider !== primary,
            duration_ms: attempts.reduce((total, attempt) => total + attempt.durationMs, 0),
          },
        });
        eventCount++;
      }
      append({ kind: 'end', eventCount, finishedAt: new Date().toISOString() });
      await pending;
      if (failed) return 'failed';
      try { await rename(active, path.join(dir, `${callId}.jsonl`)); return 'complete'; }
      catch { return 'failed'; }
    },
  };
}

const COMMON_KEYS = ['call_id', 'slot_index', 'run_id', 'project_id', 'node_id', 'evaluation_run_id', 'case_id', 'source_commit', 'execution_source', 'collection_status', 'stock_schema_version'];
const REQUEST_KEYS = ['provider', 'stage', 'result', 'http_status', 'error_type', 'duration_ms', 'credential_ref', 'rate_limited', 'quota_limit', 'quota_remaining', 'quota_reset_unix', 'retry_after'];
const SLOT_KEYS = ['primary_provider', 'attempted_providers', 'provider', 'result', 'pexels_attempted', 'fallback_attempted', 'fallback_reason', 'fallback_succeeded', 'duration_ms'];
const ERROR_TYPES = ['none', 'rate_limit_429', 'http_error', 'timeout', 'network_error', 'invalid_response', 'write_error', 'unknown'];
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const nullableId = (value: unknown): boolean => value === null || typeof value === 'string' && ID.test(value);

/** Validate and re-project persisted rows; arbitrary extra JSON never reaches analytics. */
export function parseStockJournal(raw: string, callId: string): StockJournal | null {
  if (!UUID.test(callId) || Buffer.byteLength(raw) > STOCK_TELEMETRY_LIMITS.callBytes) return null;
  try {
    const lines = raw.trimEnd().split('\n');
    let records: any[] = [];
    for (const [index, line] of lines.entries()) {
      try { records.push(JSON.parse(line)); }
      catch { if (index !== lines.length - 1 || raw.endsWith('\n')) return null; }
    }
    const header = records.shift() as Header;
    if (header?.kind !== 'start' || header.schemaVersion !== 1 || header.callId !== callId
      || !Number.isInteger(header.slotCount) || header.slotCount < 1 || header.slotCount > 30
      || !Number.isFinite(Date.parse(header.startedAt)) || !nullableId(header.sessionId)
      || !Number.isSafeInteger(header.writerPid) || header.writerPid <= 0 || typeof header.uploadAllowed !== 'boolean') return null;
    if (header.identity !== null) {
      const identity = header.identity;
      if (!identity || typeof identity.deviceId !== 'string' || !ID.test(identity.deviceId)
        || typeof identity.sessionId !== 'string' || !ID.test(identity.sessionId)
        || !(identity.clientType === undefined || ['web', 'desktop', 'external_mcp'].includes(identity.clientType))
        || !(identity.locale === undefined || typeof identity.locale === 'string' && /^[A-Za-z-]{1,24}$/.test(identity.locale))) return null;
      header.identity = { deviceId: identity.deviceId, sessionId: identity.sessionId,
        ...(identity.clientType ? { clientType: identity.clientType } : {}), ...(identity.locale ? { locale: identity.locale } : {}) };
    }
    const context = header.context;
    if (!context || context.call_id !== callId || context.stock_schema_version !== 1
      || !nullableId(context.run_id) || !nullableId(context.project_id)
      || !nullableId(context.node_id) || !nullableId(context.evaluation_run_id) || !nullableId(context.case_id)
      || !(context.source_commit === null || /^[a-f0-9]{40}$/i.test(context.source_commit))
      || !['product', 'evaluation', 'standalone', 'validation'].includes(context.execution_source)) return null;
    const end = records.at(-1)?.kind === 'end' ? records.pop() as Footer : null;
    const complete = end?.eventCount === records.length && Number.isFinite(Date.parse(end.finishedAt));
    if (records.length > STOCK_TELEMETRY_LIMITS.events) return null;
    const events: MediaStockTelemetryEvent[] = [];
    const ids = new Set<string>();
    const slotIndices = new Set<number>();
    for (const row of records) {
      const p = row?.properties;
      const request = row?.event === 'media_stock_request_result';
      if (!(request || row?.event === 'media_stock_slot_result') || !p
        || typeof row.id !== 'string' || !row.id.startsWith(`${callId}:`) || row.id.length > 100
        || ids.has(row.id) || !Number.isFinite(Date.parse(row.timestamp))
        || p.call_id !== callId || !Number.isInteger(p.slot_index) || p.slot_index < 0 || p.slot_index >= header.slotCount
        || !finite(p.duration_ms) || !(isStockProvider(p.provider) || !request && p.provider === null)) return null;
      ids.add(row.id);
      if (!request) {
        if (slotIndices.has(p.slot_index)) return null;
        slotIndices.add(p.slot_index);
      }
      if (request) {
        if (!['search', 'download'].includes(p.stage) || !['ok', 'not_found', 'error'].includes(p.result)
          || !(p.http_status === null || Number.isInteger(p.http_status) && p.http_status >= 100 && p.http_status <= 599)
          || !ERROR_TYPES.includes(p.error_type) || typeof p.rate_limited !== 'boolean'
          || !(p.credential_ref === null || typeof p.credential_ref === 'string' && /^[a-f0-9]{24}$/.test(p.credential_ref))
          || ['quota_limit', 'quota_remaining', 'quota_reset_unix'].some(key => p[key] !== null && (!finite(p[key]) || !Number.isSafeInteger(p[key])))
          || !(p.retry_after === null || typeof p.retry_after === 'string' && p.retry_after.length <= 64 && /^[a-zA-Z0-9, :]+$/.test(p.retry_after))) return null;
      } else if (!['ok', 'not_found', 'error', 'budget_exceeded'].includes(p.result)
        || ![...ERROR_TYPES, 'not_found'].includes(p.fallback_reason)
        || ['pexels_attempted', 'fallback_attempted', 'fallback_succeeded'].some(key => typeof p[key] !== 'boolean')) return null;
      if (!request && ((p.primary_provider !== undefined && p.primary_provider !== null && !isStockProvider(p.primary_provider))
        || (p.attempted_providers !== undefined && (!Array.isArray(p.attempted_providers) || p.attempted_providers.length > 6 || p.attempted_providers.some((provider: unknown) => !isStockProvider(provider)) || new Set(p.attempted_providers).size !== p.attempted_providers.length)))) return null;
      const properties: Record<string, unknown> = {};
      for (const key of [...COMMON_KEYS, ...(request ? REQUEST_KEYS : SLOT_KEYS)]) properties[key] = p[key];
      // Correlation belongs to the call header, not to independently edited rows.
      for (const key of COMMON_KEYS) if (key !== 'slot_index' && key !== 'collection_status') {
        properties[key] = (context as unknown as Record<string, unknown>)[key];
      }
      properties.collection_status = complete ? 'complete' : 'partial';
      // Fields were validated above and projected through the event-specific allowlist.
      events.push({ id: row.id, timestamp: row.timestamp, event: row.event, properties } as unknown as MediaStockTelemetryEvent);
    }
    if (complete && events.filter(row => row.event === 'media_stock_slot_result').length !== header.slotCount) return null;
    return { header, events, complete };
  } catch { return null; }
}

export async function readStockJournal(dataDir: string, callId: string): Promise<StockJournal | null> {
  if (!UUID.test(callId)) return null;
  try {
    const file = path.join(stockTelemetryDir(dataDir), `${callId}.jsonl`);
    if ((await stat(file)).size > STOCK_TELEMETRY_LIMITS.callBytes) return null;
    return parseStockJournal(await readFile(file, 'utf8'), callId);
  } catch { return null; }
}

type Receipt = { status: 'uploaded' | 'retry' | 'disabled' | 'invalid'; attempts: number; eventCount: number; at: number; nextAttemptAt: number };
export async function collectStockTelemetry(args: {
  dataDir: string;
  send: (journal: StockJournal, signal?: AbortSignal) => Promise<'uploaded' | 'retry' | 'disabled'>;
  now?: number;
  signal?: AbortSignal;
}): Promise<{ uploaded: number; events: number; pending: number }> {
  const dir = stockTelemetryDir(args.dataDir);
  const result = { uploaded: 0, events: 0, pending: 0 };
  const now = args.now ?? Date.now();
  let names: string[];
  try { names = (await readdir(dir)).filter(name => /^[a-f0-9-]{36}(?:\.active)?\.jsonl$/i.test(name)); }
  catch { return result; }
  let processed = 0;
  for (const name of names.sort()) {
    if (args.signal?.aborted) break;
    const callId = name.slice(0, 36);
    const file = path.join(dir, name);
    const receiptFile = path.join(dir, `${callId}.receipt.json`);
    let receipt: Receipt | null = null;
    try { receipt = JSON.parse(await readFile(receiptFile, 'utf8')) as Receipt; } catch { /* not delivered */ }
    if (receipt?.status === 'uploaded' || receipt?.status === 'disabled') {
      if (now - receipt.at > STOCK_TELEMETRY_LIMITS.retentionMs) {
        await unlink(file).catch(() => {}); await unlink(receiptFile).catch(() => {});
      }
      continue;
    }
    if (receipt?.status === 'invalid') continue;
    result.pending++;
    if (processed >= STOCK_TELEMETRY_LIMITS.callsPerPass || (receipt?.nextAttemptAt ?? 0) > now) continue;
    const info = await stat(file).catch(() => null);
    if (!info || name.includes('.active.') && now - info.mtimeMs < STOCK_TELEMETRY_LIMITS.partialAfterMs) continue;
    processed++;
    const journal = info.size <= STOCK_TELEMETRY_LIMITS.callBytes
      ? parseStockJournal(await readFile(file, 'utf8').catch(() => ''), callId) : null;
    let status: Receipt['status'] = 'invalid';
    if (journal && name.includes('.active.')) {
      try { process.kill(journal.header.writerPid, 0); continue; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') continue; }
      // A dead writer can no longer consume the maximum-size reservation.
      await rename(file, path.join(dir, `${callId}.jsonl`));
    }
    if (journal?.events.length) {
      if (!journal.header.uploadAllowed) status = 'disabled';
      else try { status = await args.send(journal, args.signal); } catch { status = 'retry'; }
    }
    const attempts = (receipt?.attempts ?? 0) + 1;
    const next: Receipt = {
      status, attempts, eventCount: journal?.events.length ?? 0, at: now,
      nextAttemptAt: now + Math.min(30 * 60_000, 60_000 * 2 ** Math.min(attempts - 1, 5)),
    };
    const temp = `${receiptFile}.tmp`;
    await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
    await rename(temp, receiptFile);
    if (status === 'uploaded') { result.uploaded++; result.events += next.eventCount; result.pending--; }
  }
  return result;
}

export function startStockTelemetryCollector(args: Parameters<typeof collectStockTelemetry>[0]): {
  dispose: () => void;
  flush: () => Promise<void>;
} {
  const controller = new AbortController();
  let running: Promise<void> | null = null;
  const collect = (): Promise<void> => {
    if (running) return running;
    running = collectStockTelemetry({ ...args, signal: controller.signal })
      .then(() => {}, () => {}) // Observability never gates a Run.
      .finally(() => { running = null; });
    return running;
  };
  const timer = setInterval(() => { void collect(); }, STOCK_TELEMETRY_LIMITS.pollMs);
  timer.unref();
  void collect();
  return {
    dispose: () => clearInterval(timer),
    flush: async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<void>(resolve => {
        timeout = setTimeout(() => { controller.abort(); resolve(); }, 2_000);
      });
      const freshPass = async () => {
        if (running) await running;
        if (!controller.signal.aborted) await collect();
      };
      try { await Promise.race([freshPass(), deadline]); }
      finally { clearTimeout(timeout); controller.abort(); }
    },
  };
}
