import { parseClientMetricEvent, type ClientMetricProps } from '@open-design/contracts/analytics';
import { BackoffController } from '../lib/backoff';
import type { InputAggregationStore } from './input-aggregation-store';

type Raw = ClientMetricProps<'client_input_responsiveness'>;
type Summary = ClientMetricProps<'client_input_responsiveness_summary'>;
type Reason = Summary['flush_reason'];
export type InputTelemetryEvent = { event: 'client_input_responsiveness'; properties: Raw }
  | { event: 'client_input_responsiveness_summary'; properties: Summary };
interface Snapshot {
  version: 2; collecting: Raw[]; rawPending: Raw[]; completed: string[];
  active: Summary[]; pending: Summary[]; identity: string;
  lastTime: number; nextSendAt: number; stopped: string | null;
  rawPassthrough?: boolean;
}
const HOUR = 3_600_000;
const MAX_RAW = 1024, MAX_SUMMARIES = 512, MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const maximum = (a: number | null, b: number | null) => a === null ? b : b === null ? a : Math.max(a, b);
const identityOf = (raw: Raw) => JSON.stringify([raw.device_id, raw.app_session_id, raw.user_id, raw.app_version,
  raw.client_version, raw.channel, raw.env, raw.client_type, raw.platform, raw.os_version, raw.arch, raw.capture_source,
  raw.input_trial_id, raw.input_trial_revision]);

/** A single transaction owns the collector tail, raw outbox and both summary periods. */
export class InputAggregation {
  readonly pageId = crypto.randomUUID();
  stopped: string | null = null;
  private collecting = new Map<string, Raw>();
  private rawPending: Raw[] = [];
  private completed: string[] = [];
  private active = new Map<number, Summary>();
  private pending: Summary[] = [];
  private identity = '';
  private lastTime = Date.now();
  private nextSendAt = Date.now() + HOUR;
  private urgent = false;
  private draining: Promise<void> | null = null;
  private store: InputAggregationStore | null = null;
  private operation: Promise<void> = Promise.resolve();
  private closed = false;
  private savedState = '';
  private mode: 'shadow' | 'drain' | 'paused' = 'shadow';
  private retryAt = 0;
  private backoff = new BackoffController({ initialMs: 5000, maxMs: 60_000, jitter: false });
  private rawPassthrough: boolean;
  private retryBackoff: boolean;
  private closing = false;
  private ready = false;
  private counters = { committed_inputs: 0, accepted_events: 0, retry_count: 0 };

  constructor(private send: (events: InputTelemetryEvent[]) => Promise<boolean>, store?: InputAggregationStore | Promise<InputAggregationStore>,
    options: { rawPassthrough?: boolean; retryBackoff?: boolean; mode?: 'shadow' | 'drain' | 'paused' } = {}) {
    this.rawPassthrough = options.rawPassthrough === true;
    this.retryBackoff = options.retryBackoff === true || this.rawPassthrough;
    this.mode = options.mode ?? 'shadow';
    this.ready = !store;
    if (store) this.operation = this.restore(store).catch(error => {
      this.stopped = 'storage_error'; this.log('stopped', { reason: this.stopped, error: String(error) });
    });
  }
  get pendingCount() { return this.pending.length; }
  get collectingEnabled() { return !this.closing && this.mode === 'shadow' && !this.stopped; }
  diagnostics() {
    const facts = [...this.collecting.values(), ...this.rawPending, ...this.active.values(), ...this.pending];
    const oldest = facts.length ? Math.min(...facts.map(s => Date.parse(s.occurred_at))) : null;
    return { ...this.counters, mode: this.mode, persistence_ready: this.ready, stopped_reason: this.stopped,
      collecting_records: this.collecting.size, raw_pending: this.rawPending.length,
      active_summaries: this.active.size, pending_summaries: this.pending.length,
      oldest_pending_age_ms: oldest === null ? null : Math.max(0, Date.now() - oldest) };
  }
  async setMode(mode: 'shadow' | 'drain' | 'paused') {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'drain') await this.flush('recovery');
  }
  ownsSource(id: string) { return this.collecting.has(id) || this.completed.includes(id); }
  observe(properties: Record<string, unknown>) { return this.checkpointSource(properties, true); }

  async checkpointSource(properties: Record<string, unknown>, final: boolean): Promise<Record<string, unknown> | null> {
    const admitted = this.collectingEnabled;
    const result = await this.update(async () => {
      this.advance();
      const parsed = parseClientMetricEvent('client_input_responsiveness', properties) as Raw | null;
      if (!admitted || this.stopped || !parsed || !['settings', 'search'].includes(parsed.area)
        || parsed.telemetry_capability !== 'supported' || Date.parse(parsed.occurred_at) > Date.now()) return null;
      const previous = this.collecting.get(parsed.event_id);
      const raw: Raw = { ...parsed, aggregation_page_id: previous?.aggregation_page_id ?? this.pageId };
      if (this.completed.includes(raw.event_id)) return raw;
      if (previous && (identityOf(previous) !== identityOf(raw)
        || ['input_attempt_count', 'qualified_sample_count', 'over_500ms_count'].some(k => Number(raw[k as keyof Raw]) < Number(previous[k as keyof Raw])))) throw new Error('invalid_source');
      if (this.identity && this.identity !== identityOf(raw)) this.freezeAll('identity_change');
      this.identity = identityOf(raw);
      this.collecting.set(raw.event_id, raw);
      if (final) this.finishSource(raw);
      await this.checkpoint();
      this.counters.committed_inputs += Math.max(0, raw.input_attempt_count - (previous?.input_attempt_count ?? 0));
      this.log(final ? 'source_committed' : 'tail_committed', { source: raw });
      return raw;
    });
    if (result && final) void this.drain();
    return result;
  }

  private finishSource(raw: Raw) {
    this.collecting.delete(raw.event_id);
    if (this.completed.includes(raw.event_id)) return;
    if (this.rawPending.length >= MAX_RAW || bytes(raw) > 8192) throw new Error('queue_limit');
    if (!this.rawPassthrough) this.rawPending.push(Object.freeze({ ...raw }));
    this.completed.push(raw.event_id); this.completed = this.completed.slice(-2048);
    const at = Date.parse(raw.occurred_at);
    for (const period of [300_000, 600_000] as const) {
      const start = Math.floor(at / period) * period;
      const key = period + (raw.area === 'search' ? 1 : 0);
      let summary = this.active.get(key);
      if (summary && Date.parse(summary.window_start) !== start) {
        this.active.delete(key); this.freeze(summary, 'window'); summary = undefined;
      }
      summary ??= { ...raw, area: raw.area as Summary['area'], event_id: crypto.randomUUID(),
        capture_source: 'web/input-aggregation', aggregation_page_id: raw.aggregation_page_id!,
        period_ms: period, window_start: new Date(start).toISOString(), window_end: new Date(start + period).toISOString(),
        flush_reason: 'window', source_event_count: 0, source_window_ms: 0,
        input_attempt_count: 0, qualified_sample_count: 0, over_500ms_count: 0,
        max_input_to_presentation_ms: null, max_queue_delay_ms: null };
      summary.source_event_count++;
      summary.source_window_ms += raw.window_ms;
      summary.input_attempt_count += raw.input_attempt_count;
      summary.qualified_sample_count += raw.qualified_sample_count;
      summary.over_500ms_count += raw.over_500ms_count;
      summary.max_input_to_presentation_ms = maximum(summary.max_input_to_presentation_ms, raw.max_input_to_presentation_ms);
      summary.max_queue_delay_ms = maximum(summary.max_queue_delay_ms, raw.max_queue_delay_ms);
      summary.occurred_at = raw.occurred_at;
      if (![summary.input_attempt_count, summary.qualified_sample_count, summary.over_500ms_count].every(Number.isSafeInteger)) throw new Error('counter_limit');
      if (start + period <= Date.now()) this.freeze(summary, 'window');
      else this.active.set(key, summary);
    }
  }
  private freeze(summary: Summary, reason: Reason) {
    if (this.pending.length >= MAX_SUMMARIES) throw new Error('queue_limit');
    const parsed = parseClientMetricEvent('client_input_responsiveness_summary', {
      ...summary, flush_reason: reason, reported_at: new Date().toISOString(),
    }) as Summary | null;
    if (!parsed || bytes(parsed) > 8192) throw new Error('invalid_summary');
    this.pending.push(Object.freeze(parsed));
  }
  private freezeAll(reason: Reason) {
    for (const raw of [...this.collecting.values()]) this.finishSource(raw);
    const remaining = [...this.active.values()]; this.active.clear();
    for (const summary of remaining) this.freeze(summary, reason);
  }
  private advance() {
    const now = Date.now();
    if (now < this.lastTime) { this.freezeAll('recovery'); this.stopped = 'clock_rollback'; this.urgent = true; }
    this.lastTime = now;
    for (const [key, summary] of this.active) {
      if (Date.parse(summary.window_end) <= now) { this.active.delete(key); this.freeze(summary, 'window'); }
    }
  }
  async flush(reason: Reason) {
    await this.update(async () => {
      if (this.stopped === 'storage_error') return;
      this.freezeAll(reason); this.urgent = true; await this.checkpoint();
    });
    await this.drain();
  }
  async tick() {
    await this.update(async () => { if (this.stopped !== 'storage_error') { this.advance(); await this.checkpoint(); } });
    await this.drain();
  }
  private snapshot(): Snapshot {
    return { version: 2, collecting: [...this.collecting.values()].map(s => ({ ...s })), rawPending: this.rawPending.map(s => ({ ...s })),
      completed: [...this.completed], active: [...this.active.values()].map(s => ({ ...s })), pending: this.pending.map(s => ({ ...s })),
      identity: this.identity, lastTime: this.lastTime, nextSendAt: this.nextSendAt, stopped: this.stopped,
      rawPassthrough: this.rawPassthrough };
  }
  private load(snapshot: Snapshot) {
    this.collecting = new Map(snapshot.collecting.map(s => [s.event_id, s]));
    this.rawPending = snapshot.rawPending; this.completed = snapshot.completed;
    this.active = new Map(snapshot.active.map(s => [s.period_ms + (s.area === 'search' ? 1 : 0), s]));
    this.pending = snapshot.pending; this.identity = snapshot.identity;
    this.lastTime = snapshot.lastTime; this.nextSendAt = snapshot.nextSendAt; this.stopped = snapshot.stopped;
    this.rawPassthrough = snapshot.rawPassthrough === true;
  }
  private async restore(storage: InputAggregationStore | Promise<InputAggregationStore>) {
    this.store = await storage;
    const saved = await this.store.read();
    if (saved === undefined) { this.ready = true; this.log('ready'); return; }
    if (!saved || typeof saved !== 'object' || bytes(saved) > MAX_SNAPSHOT_BYTES) throw new Error('invalid snapshot');
    const state = saved as Partial<Snapshot>;
    if (Number(state.version) === 1) Object.assign(state, { version: 2, collecting: [], rawPending: [], completed: [], nextSendAt: Date.now() + HOUR });
    if (state.version !== 2 || !Array.isArray(state.collecting) || state.collecting.length > 4
      || !Array.isArray(state.rawPending) || state.rawPending.length > MAX_RAW
      || !Array.isArray(state.completed) || state.completed.length > 2048 || state.completed.some(id => typeof id !== 'string' || id.length > 128)
      || !Array.isArray(state.active) || state.active.length > 4 || !Array.isArray(state.pending) || state.pending.length > MAX_SUMMARIES
      || typeof state.identity !== 'string' || state.identity.length > 2048 || !Number.isFinite(state.lastTime)
      || !Number.isFinite(state.nextSendAt) || !(state.stopped === null || typeof state.stopped === 'string')) throw new Error('invalid snapshot');
    const parse = <T extends 'client_input_responsiveness' | 'client_input_responsiveness_summary'>(event: T, value: unknown) => {
      const parsed = parseClientMetricEvent(event, value);
      if (!parsed || bytes(parsed) > 8192 || !['settings', 'search'].includes(String(parsed.area))) throw new Error('invalid stored metric');
      return parsed as ClientMetricProps<T>;
    };
    const collecting = state.collecting.map(s => parse('client_input_responsiveness', s));
    const rawPending = state.rawPending.map(s => parse('client_input_responsiveness', s));
    const active = state.active.map(s => parse('client_input_responsiveness_summary', s));
    const pending = state.pending.map(s => parse('client_input_responsiveness_summary', s));
    const ids = [...collecting, ...rawPending, ...active, ...pending].map(s => s.event_id);
    if (new Set(ids).size !== ids.length || new Set(active.map(s => `${s.period_ms}:${s.area}`)).size !== active.length) throw new Error('duplicate stored id');
    if (state.rawPassthrough !== undefined && typeof state.rawPassthrough !== 'boolean') throw new Error('invalid delivery mode');
    const requestedPassthrough = this.rawPassthrough;
    this.load({ ...state, collecting, rawPending, active, pending } as Snapshot);
    this.freezeAll('recovery'); this.urgent = true;
    this.rawPassthrough = requestedPassthrough;
    await this.checkpoint(); this.ready = true; this.log('restored', { raw_pending: this.rawPending.length, pending: this.pending.length });
  }
  private async checkpoint() {
    if (this.collecting.size > 4 || this.rawPending.length + this.collecting.size > MAX_RAW
      || this.active.size > 4 || this.pending.length + this.active.size + this.collecting.size * 2 > MAX_SUMMARIES) throw new Error('queue_limit');
    if (!this.store) return;
    const snapshot = this.snapshot(), encoded = JSON.stringify({ ...snapshot, lastTime: 0 });
    if (encoded === this.savedState) return;
    if (bytes(snapshot) > MAX_SNAPSHOT_BYTES) throw new Error('queue_limit');
    await this.store.write(snapshot); this.savedState = encoded;
  }
  private update<T>(action: () => T | Promise<T>): Promise<T | null> {
    const next = this.operation.then(async () => {
      if (this.closed) return null;
      const before = this.snapshot(), urgent = this.urgent;
      try { return await action(); }
      catch (error) {
        this.load(before); this.urgent = urgent;
        this.stopped = error instanceof Error && ['queue_limit', 'counter_limit', 'invalid_source', 'invalid_summary'].includes(error.message) ? error.message : 'storage_error';
        this.log('stopped', { reason: this.stopped, error: String(error) }); return null;
      }
    });
    this.operation = next.then(() => undefined); return next;
  }
  async prepareShutdown() {
    this.closing = true;
    await this.update(async () => {
      try {
        if (this.stopped !== 'storage_error') { this.freezeAll('pagehide'); this.urgent = true; await this.checkpoint(); }
      } finally { this.closed = true; }
    });
    this.store?.close();
  }
  async close() {
    this.closing = true;
    await this.draining;
    await this.operation;
    this.closed = true;
    this.store?.close();
  }
  private async drain() {
    // A flush can enqueue facts after an in-flight drain selected an empty batch.
    while (this.draining) await this.draining;
    this.draining = this.drainLoop().finally(() => { this.draining = null; });
    return this.draining;
  }
  private async drainLoop() {
    while (!this.closed && this.mode !== 'paused' && this.stopped !== 'storage_error' && Date.now() >= this.retryAt) {
      const batch = await this.update(() => {
        const events: InputTelemetryEvent[] = this.rawPending.map(properties => ({ event: 'client_input_responsiveness', properties }));
        if (this.urgent || Date.now() >= this.nextSendAt) events.push(...this.pending.map(properties => ({ event: 'client_input_responsiveness_summary' as const, properties })));
        const selected: InputTelemetryEvent[] = [];
        for (const event of events) {
          if (bytes([...selected, event]) > 24 * 1024) break;
          selected.push(event);
        }
        return selected;
      });
      if (!batch?.length) {
        await this.update(async () => {
          if ((this.urgent || Date.now() >= this.nextSendAt) && this.pending.length === 0) {
            this.nextSendAt = Date.now() + HOUR; this.urgent = false; await this.checkpoint();
          }
        });
        break;
      }
      if (!await this.send(batch).catch(() => false)) {
        this.counters.retry_count++;
        this.retryAt = this.retryBackoff ? Date.now() + this.backoff.nextDelay() : 0;
        this.log('retry', { event_ids: batch.map(e => e.properties.event_id) }); break;
      }
      this.backoff.reset(); this.retryAt = 0;
      const removed = await this.update(async () => {
        const ids = new Set(batch.map(e => e.properties.event_id));
        this.rawPending = this.rawPending.filter(s => !ids.has(s.event_id));
        this.pending = this.pending.filter(s => !ids.has(s.event_id));
        await this.checkpoint(); return true;
      });
      if (!removed) break;
      this.counters.accepted_events += batch.length;
      this.log('accepted', { event_ids: batch.map(e => e.properties.event_id), events: batch.length });
    }
  }
  private log(stage: string, extra: Record<string, unknown> = {}) {
    console.info('[input-aggregation]', JSON.stringify({ stage, page_id: this.pageId, ...extra }));
  }
}
