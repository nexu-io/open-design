import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { parseClientMetricEvent, isInputAggregationDestination } from '@open-design/contracts/analytics';

export function nativeInputPocEnabled(packaged: boolean, env: NodeJS.ProcessEnv): boolean {
  if (env.OD_INPUT_TRIAL_CAPABILITY === '1') return isInputAggregationDestination(env.POSTHOG_HOST ?? '', env.POSTHOG_KEY ?? '');
  return (!packaged || env.OD_INPUT_QA_BUNDLE === 'local-only') && env.OD_INPUT_NATIVE_POC === '1'
    && env.NEXT_PUBLIC_OD_INPUT_AGGREGATION_POC === '1' && env.POSTHOG_KEY === 'phc_local_poc_only'
    && /^http:\/\/127\.0\.0\.1(?::[0-9]+)?\/?$/.test(env.POSTHOG_HOST ?? '');
}

type Change = { put: [string, string][]; drop: string[] };
type RequestBody = { op: 'read' } | { op: 'close' } | ({ op: 'write' } & Change);
type Request = { id: number } & RequestBody;
const MAX_BYTES = 2 * 1024 * 1024;
const keyPattern = /^(meta|completed|(collecting|rawPending|active|pending):[a-zA-Z0-9_-]{1,128})$/;

/** SQLite transactions run off both UI threads; the reply means COMMIT finished. */
export class NativeInputStore {
  private worker: Worker;
  private sequence = 0;
  private failed = false;
  private requests = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  constructor(filename: string) {
    const workerFile = import.meta.url.endsWith('.ts') ? './input-native-store.ts' : './input-native-store.js';
    this.worker = new Worker(new URL(workerFile, import.meta.url), { workerData: { filename, prewarm: process.env.OD_INPUT_PREWARM_POC !== '0' }, execArgv: [] });
    this.worker.on('message', (reply: { id: number; value?: unknown; error?: string }) => {
      const pending = this.requests.get(reply.id);
      if (!pending) return;
      clearTimeout(pending.timer); this.requests.delete(reply.id);
      if (reply.error) pending.reject(new Error(reply.error)); else pending.resolve(reply.value);
    });
    this.worker.on('error', error => this.fail(error));
    this.worker.on('exit', () => this.fail(new Error('native input store closed')));
  }
  private fail(error: Error) {
    this.failed = true;
    for (const pending of this.requests.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.requests.clear();
  }
  private request(message: RequestBody): Promise<unknown> {
    if (this.failed || this.requests.size >= 64) return Promise.reject(new Error('native input store unavailable'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('native input commit timed out')), 10_000);
      this.requests.set(id, { resolve, reject, timer });
      this.worker.postMessage({ ...message, id });
    });
  }
  async read() { return await this.request({ op: 'read' }) as [string, string][]; }
  async write(put: Change['put'], drop: Change['drop']) { await this.request({ op: 'write', put, drop }); }
  async close() {
    try { if (!this.failed) await this.request({ op: 'close' }); }
    finally { await this.worker.terminate(); }
  }
}

function validateChange(change: Change) {
  if (!Array.isArray(change.put) || !Array.isArray(change.drop) || change.put.length + change.drop.length > 1600) throw new Error('invalid native patch');
  const keys = new Set<string>();
  for (const entry of change.put) {
    if (!Array.isArray(entry) || entry.length !== 2) throw new Error('invalid native record');
    const [key, text] = entry;
    if (typeof key !== 'string' || !keyPattern.test(key) || keys.has(key) || typeof text !== 'string'
      || Buffer.byteLength(text) > (key === 'completed' ? 280_000 : 8192)) throw new Error('invalid native record');
    keys.add(key);
    const value = JSON.parse(text);
    if (key === 'completed') {
      if (!Array.isArray(value) || value.length > 2048 || value.some(v => typeof v !== 'string' || v.length > 128)) throw new Error('invalid completed sources');
    } else if (key === 'meta') {
      if (!value || value.version !== 2 || typeof value.identity !== 'string' || value.identity.length > 2048
        || !Number.isFinite(value.lastTime) || !Number.isFinite(value.nextSendAt)
        || !(value.stopped === null || typeof value.stopped === 'string')
        || (value.rawPassthrough !== undefined && typeof value.rawPassthrough !== 'boolean')
        || Object.keys(value).some(k => !['version', 'identity', 'lastTime', 'nextSendAt', 'stopped', 'rawPassthrough'].includes(k))) throw new Error('invalid native metadata');
    } else {
      const name = /^(active|pending):/.test(key) ? 'client_input_responsiveness_summary' : 'client_input_responsiveness';
      const parsed = parseClientMetricEvent(name, value);
      if (!parsed || !['settings', 'search'].includes(String(parsed.area)) || key.split(':')[1] !== parsed.event_id) throw new Error('invalid input metric');
      entry[1] = JSON.stringify(parsed);
    }
  }
  for (const key of change.drop) {
    if (typeof key !== 'string' || !keyPattern.test(key) || keys.has(key)) throw new Error('invalid native deletion');
    keys.add(key);
  }
}

if (!isMainThread) {
  const db = new DatabaseSync(workerData.filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000;
    PRAGMA max_page_count=16384; CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  const upsert = db.prepare('INSERT INTO records VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const remove = db.prepare('DELETE FROM records WHERE key=?');
  // Compile the input validators off the UI thread before the first real record; no facts are written.
  if (workerData.prewarm) {
    const raw = { event_schema_version: 4, metric_schema_version: 1, event_id: '__prepare_raw__',
      device_id: '__prepare__', app_session_id: '__prepare__', client_type: 'desktop',
      capture_source: 'web/input-aggregation', env: 'development', channel: 'development',
      app_version: null, client_version: null, platform: null, os_version: null, arch: null,
      occurred_at: new Date(0).toISOString(), reported_at: new Date(0).toISOString(),
      telemetry_capability: 'supported', area: 'settings', aggregation_page_id: '__prepare__',
      window_ms: 1, input_attempt_count: 0, qualified_sample_count: 0, over_500ms_count: 0,
      max_input_to_presentation_ms: null, max_queue_delay_ms: null, sample_floor_ms: 16 };
    const put: Change['put'] = [[`collecting:${raw.event_id}`, JSON.stringify(raw)]];
    for (const period of [300_000, 600_000]) {
      const summary = { ...raw, event_id: `__prepare_${period}__`, period_ms: period,
        window_start: raw.occurred_at, window_end: new Date(period).toISOString(),
        flush_reason: 'window', source_event_count: 1, source_window_ms: 1 };
      put.push([`active:${summary.event_id}`, JSON.stringify(summary)]);
    }
    validateChange({ put, drop: [] });
  }
  parentPort!.on('message', (request: Request) => {
    try {
      let value: unknown;
      if (request.op === 'read') value = db.prepare('SELECT key, value FROM records ORDER BY rowid').all().map(r => [r.key, r.value]);
      else if (request.op === 'close') { db.close(); parentPort!.postMessage({ id: request.id }); parentPort!.close(); return; }
      else {
        validateChange(request);
        db.exec('BEGIN IMMEDIATE');
        try {
          for (const key of request.drop) remove.run(key);
          for (const [key, text] of request.put) upsert.run(key, text);
          const size = db.prepare('SELECT count(*) AS n, coalesce(sum(length(CAST(value AS BLOB))), 0) AS bytes FROM records').get()!;
          if (Number(size.n) > 1600 || Number(size.bytes) > MAX_BYTES) throw new Error('native input queue limit');
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      }
      parentPort!.postMessage({ id: request.id, value });
    } catch (error) { parentPort!.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) }); }
  });
}
